/**
 * Tindakan kecil pada hasil Standarisasi: kecualikan baris bermasalah, hapus satu pegawai dari snapshot sebulan, hapus entri
 * Kamus Koreksi. Port dari aksi server KDS1; beda: id batch angka dan jejak audit memakai audit_log gabungan (per kolom).
 * Fungsi murni terhadap klien Prisma supaya bisa dites tanpa sesi login.
 */
import type { PrismaClient } from "@prisma/client";

import { JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN } from "@/lib/domain/masterCache";

export type Pengguna = { id: string | null; nama: string };
export type HasilTindakan = { ok: true; pesan?: string } | { ok: false; error: string };

const sekarang = () => new Date();

/** Sesi lama bisa menyimpan id pengguna yang sudah tidak ada; kunci asing dikosongkan, nama tetap tercatat di audit. */
async function idPenggunaAda(prisma: PrismaClient, id: string | null): Promise<string | null> {
  if (!id) return null;
  return (await prisma.user.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
}

/**
 * Kecualikan satu baris Review dari arsip. Bila `permanen`, NIP-nya masuk daftar "dikecualikan permanen" (Kamus Koreksi) sehingga
 * Standarisasi bulan-bulan berikutnya melewatinya otomatis.
 */
export async function kecualikanBaris(prisma: PrismaClient, batchId: number, barisId: string, permanen: boolean, pengguna: Pengguna): Promise<HasilTindakan> {
  const baris = await prisma.barisBermasalah.findUnique({ where: { id: barisId } });
  if (!baris || baris.uploadBatchId !== batchId) return { ok: false, error: "Baris tidak ditemukan di batch ini." };
  if (baris.status !== "Menunggu") return { ok: false, error: "Baris ini sudah diproses sebelumnya." };
  const penggunaId = await idPenggunaAda(prisma, pengguna.id);
  // Pembuat kamus wajib pengguna yang ada (kolom wajib): pakai pengguna pertama bila sesi lama.
  const pembuatKamus = penggunaId ?? (await prisma.user.findFirst({ select: { id: true }, orderBy: { id: "asc" } }))?.id ?? null;
  if (permanen && !pembuatKamus) return { ok: false, error: "Tidak ada pengguna terdaftar untuk mencatat kamus." };

  await prisma.$transaction(async (tx) => {
    await tx.barisBermasalah.update({ where: { id: barisId }, data: { status: "Dikecualikan", diselesaikanOlehId: penggunaId, diselesaikanPada: sekarang() } });
    await tx.auditLog.create({
      data: { namaTabel: "baris_bermasalah", idRecord: barisId, fieldDiubah: "status", nilaiLama: "Menunggu", nilaiBaru: permanen ? "Dikecualikan (permanen)" : "Dikecualikan", diubahOleh: pengguna.nama, diubahPada: sekarang(), aksi: "UPDATE" },
    });
    if (permanen) {
      await tx.kamusKoreksi.upsert({
        where: { jenisField_kunciMentah: { jenisField: JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN, kunciMentah: baris.nip } },
        create: { jenisField: JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN, kunciMentah: baris.nip, nilaiResolusi: "Dikecualikan permanen", dibuatOlehId: pembuatKamus! },
        update: {},
      });
    }
    const sisa = await tx.barisBermasalah.count({ where: { uploadBatchId: batchId, status: "Menunggu" } });
    await tx.uploadBatch.update({ where: { id: batchId }, data: { jumlahPerluReview: sisa, status: sisa === 0 ? "Selesai" : "MenungguReview" } });
  });
  return { ok: true };
}

/**
 * Hapus satu pegawai dari snapshot bulan batch ini saja (salah input/duplikat; BUKAN untuk pegawai yang keluar: cukup tidak
 * dimasukkan lagi bulan berikutnya). Jabatan tambahannya ikut terhapus (cascade).
 */
export async function hapusPegawaiBulan(prisma: PrismaClient, batchId: number, nominatifId: number, pengguna: Pengguna): Promise<HasilTindakan> {
  const n = await prisma.nominatifBulanan.findUnique({ where: { id: nominatifId } });
  if (!n || n.uploadBatchId !== batchId) return { ok: false, error: "Baris nominatif tidak ditemukan di batch ini." };
  await prisma.$transaction([
    prisma.nominatifBulanan.delete({ where: { id: nominatifId } }),
    prisma.uploadBatch.update({ where: { id: batchId }, data: { jumlahBarisTotal: { decrement: 1 }, jumlahBerhasil: { decrement: 1 } } }),
    prisma.auditLog.create({
      data: { namaTabel: "nominatif_bulanan", idRecord: String(nominatifId), fieldDiubah: "pegawai_nip", nilaiLama: n.pegawaiNip, nilaiBaru: null, diubahOleh: pengguna.nama, diubahPada: sekarang(), aksi: "DELETE" },
    }),
  ]);
  return { ok: true, pesan: `${n.nama} (NIP ${n.pegawaiNip}) berhasil dihapus dari bulan ini.` };
}

/** Hapus satu entri Kamus Koreksi (koreksi lama yang ternyata keliru). Tidak retroaktif: snapshot yang sudah tersimpan tidak berubah. */
export async function hapusKamus(prisma: PrismaClient, id: string, pengguna: Pengguna): Promise<HasilTindakan> {
  const e = await prisma.kamusKoreksi.findUnique({ where: { id } });
  if (!e) return { ok: false, error: "Entri kamus tidak ditemukan." };
  await prisma.$transaction([
    prisma.kamusKoreksi.delete({ where: { id } }),
    prisma.auditLog.create({
      data: { namaTabel: "kamus_koreksi", idRecord: id, fieldDiubah: e.jenisField, nilaiLama: `${e.kunciMentah} => ${e.nilaiResolusi}`, nilaiBaru: null, diubahOleh: pengguna.nama, diubahPada: sekarang(), aksi: "DELETE" },
    }),
  ]);
  return { ok: true };
}
