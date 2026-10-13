/**
 * Menyelesaikan satu baris antrean Review (baris_bermasalah) oleh admin. Port dari lib/services/resolveRow.ts (KDS1): baris
 * dimasukkan ke snapshot Nominatif bulan batchnya (upsert per NIP), batch dihitung ulang, dan pilihan "ingat" ditulis ke
 * Kamus Koreksi (berlaku di upload bulan berikutnya, tidak retroaktif). Beda dari KDS1: id batch angka; jejak audit memakai
 * bentuk audit_log gabungan (per kolom) alih-alih tabel audit KDS1. Paritas: tests/paritas/standarisasi.test.ts.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import type { ResolvedNominatif } from "@/lib/domain/classify";
import {
  encodeJabatanTambahan, kunciGolongan, kunciJabatan, kunciJabatanTambahan, kunciKategoriAkademisiLuar, kunciKlasifikasi, kunciStatusKepegawaian, kunciUnitKerja,
} from "@/lib/domain/classify";
import { isNipPlaceholderTidakStabil, JENIS_FIELD_IDENTITAS_EKSTERNAL, kunciIdentitasEksternal } from "@/lib/domain/identitasEksternal";
import type { RawNominatifRow } from "@/lib/excel/types";

export type IngatFlags = {
  klasifikasi?: boolean;
  kategoriAkademisiLuar?: boolean;
  statusKepegawaian?: boolean;
  golongan?: boolean;
  jabatan?: boolean;
  unitKerja?: boolean;
  jabatanTambahan?: boolean;
};

export type MasukanResolve = {
  barisBermasalahId: string;
  kelompok: "Dosen" | "Tendik" | "Akademisi Luar UM";
  data: ResolvedNominatif;
  ingat: IngatFlags;
  /** pengguna yang menyelesaikan; id boleh null bila akunnya sudah tidak ada (sesi lama) */
  pengguna: { id: string | null; nama: string };
};

const jabatanKodeUntukKamus = (d: ResolvedNominatif) => d.jabatanFungsionalDosenKode ?? d.jabatanFungsionalTendikKode ?? d.jabatanFungsiUmumKode ?? null;
function jenisFieldJabatan(d: ResolvedNominatif): "JabatanFungsionalDosen" | "JabatanFungsionalTendik" | "FungsiUmumPelaksana" | null {
  if (d.jabatanFungsionalDosenKode) return "JabatanFungsionalDosen";
  if (d.jabatanFungsionalTendikKode) return "JabatanFungsionalTendik";
  if (d.jabatanFungsiUmumKode) return "FungsiUmumPelaksana";
  return null;
}

export async function selesaikanBaris(prisma: PrismaClient, input: MasukanResolve): Promise<void> {
  const baris = await prisma.barisBermasalah.findUniqueOrThrow({ where: { id: input.barisBermasalahId } });
  if (baris.status !== "Menunggu") throw new Error("Baris ini sudah diselesaikan atau dikecualikan.");
  const rawRow = baris.dataMentah as unknown as RawNominatifRow;
  const batchMeta = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: baris.uploadBatchId }, select: { bulan: true, tahun: true } });
  if (batchMeta.bulan === null || batchMeta.tahun === null) throw new Error("Batch tidak punya periode.");
  const { bulan, tahun } = batchMeta;

  // NIP placeholder SIMPEGA yang identitasnya sudah dikonfirmasi admin: pakai NIP kanonik tersimpan sebagai identitas sebenarnya.
  let nipEfektif = baris.nip;
  if (isNipPlaceholderTidakStabil(baris.nip, bulan, tahun)) {
    const nama = rawRow.namaDenganGelar || rawRow.namaTanpaGelar;
    const kamusIdentitas = await prisma.kamusKoreksi.findUnique({
      where: { jenisField_kunciMentah: { jenisField: JENIS_FIELD_IDENTITAS_EKSTERNAL, kunciMentah: kunciIdentitasEksternal(nama) } },
    });
    if (kamusIdentitas) nipEfektif = kamusIdentitas.nilaiResolusi;
  }
  const rawUntukKamus: RawNominatifRow = { ...rawRow, nip: nipEfektif };
  // Pengguna lama bisa tidak ada lagi di tabel user (sesi lama): kunci asing dikosongkan, nama tetap tercatat di audit.
  const adaPengguna = input.pengguna.id ? await prisma.user.findUnique({ where: { id: input.pengguna.id }, select: { id: true } }) : null;
  const olehId = adaPengguna?.id ?? null;
  // Kamus Koreksi mewajibkan pembuat bertipe pengguna: bila sesi lama, pakai pengguna pertama yang ada (admin tunggal).
  const pembuatKamusId = olehId ?? (await prisma.user.findFirst({ orderBy: { dibuatPada: "asc" }, select: { id: true } }))?.id;
  if (!pembuatKamusId) throw new Error("Tidak ada pengguna terdaftar.");

  await prisma.$transaction(async (tx) => {
    await tx.pegawai.upsert({ where: { nip: nipEfektif }, create: { nip: nipEfektif }, update: {} });

    const { jabatanTambahan, ...data } = input.data;
    const nominatif = await tx.nominatifBulanan.upsert({
      where: { pegawaiNip_bulan_tahun: { pegawaiNip: nipEfektif, bulan, tahun } },
      create: { pegawaiNip: nipEfektif, bulan, tahun, uploadBatchId: baris.uploadBatchId, ...data },
      update: { uploadBatchId: baris.uploadBatchId, ...data },
    });
    await tx.nominatifBulananJabatanTambahan.deleteMany({ where: { nominatifBulananId: nominatif.id } });
    if (jabatanTambahan.length > 0) {
      await tx.nominatifBulananJabatanTambahan.createMany({ data: jabatanTambahan.map((slot) => ({ nominatifBulananId: nominatif.id, ...slot })) });
    }

    await tx.barisBermasalah.update({
      where: { id: baris.id },
      data: { status: "Terselesaikan", resolvedFields: input.data as unknown as Prisma.InputJsonValue, diselesaikanOlehId: olehId, diselesaikanPada: new Date() },
    });

    const batch = await tx.uploadBatch.findUniqueOrThrow({ where: { id: baris.uploadBatchId } });
    const sisaMenunggu = await tx.barisBermasalah.count({ where: { uploadBatchId: baris.uploadBatchId, status: "Menunggu" } });
    await tx.uploadBatch.update({
      where: { id: baris.uploadBatchId },
      data: { jumlahBerhasil: batch.jumlahBerhasil + 1, jumlahPerluReview: sisaMenunggu, status: sisaMenunggu === 0 ? "Selesai" : "MenungguReview" },
    });

    const ingatKamus = async (jenisField: string, kunciMentah: string, nilaiResolusi: string) => {
      await tx.kamusKoreksi.upsert({
        where: { jenisField_kunciMentah: { jenisField, kunciMentah } },
        create: { jenisField, kunciMentah, nilaiResolusi, dibuatOlehId: pembuatKamusId },
        update: { nilaiResolusi },
      });
    };
    if (input.ingat.klasifikasi) await ingatKamus("Klasifikasi", kunciKlasifikasi(rawUntukKamus), input.kelompok);
    if (input.ingat.kategoriAkademisiLuar && input.data.kategoriAkademisiLuarKode) await ingatKamus("KategoriAkademisiLuar", kunciKategoriAkademisiLuar(rawUntukKamus), input.data.kategoriAkademisiLuarKode);
    if (input.ingat.statusKepegawaian) await ingatKamus("StatusKepegawaian", kunciStatusKepegawaian(rawRow), input.data.statusKepegawaianKode);
    if (input.ingat.golongan && input.data.golonganKode) await ingatKamus("Golongan", kunciGolongan(rawRow), input.data.golonganKode);
    const jenisJab = jenisFieldJabatan(input.data);
    const kodeJab = jabatanKodeUntukKamus(input.data);
    if (input.ingat.jabatan && jenisJab && kodeJab) await ingatKamus(jenisJab, kunciJabatan(rawUntukKamus), kodeJab);
    if (input.ingat.unitKerja) await ingatKamus("UnitKerja", kunciUnitKerja(rawRow), input.data.unitAsalKode);
    // Kamus menyimpan SEMUA slot (maks 3) dalam satu string, supaya baris bertulisan mentah sama bulan depan tidak kehilangan jabatan keduanya.
    if (input.ingat.jabatanTambahan && jabatanTambahan.length > 0) await ingatKamus("JabatanTambahan", kunciJabatanTambahan(rawRow), encodeJabatanTambahan(jabatanTambahan));

    await tx.auditLog.create({
      data: { namaTabel: "baris_bermasalah", idRecord: baris.id, fieldDiubah: "status", nilaiLama: "Menunggu", nilaiBaru: "Terselesaikan", diubahOleh: input.pengguna.nama, diubahPada: new Date(), aksi: "UPDATE" },
    });
  });
}
