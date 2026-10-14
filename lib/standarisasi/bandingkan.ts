/**
 * Bandingkan Batch: selisih pegawai dua snapshot Nominatif (orang baru, orang hilang, NIP anomali) beserta catatan alasan admin.
 * Port dari bandingkanBatchService KDS1 (logika murni di lib/domain/bandingkanBatch.ts disalin apa adanya). Beda: id batch angka,
 * klien Prisma dilempar sebagai argumen supaya bisa dites. Dipakai halaman /bandingkan dan unduhan .xlsx agar hasilnya selalu sama.
 */
import type { PrismaClient } from "@prisma/client";

import { bandingkanDaftarPegawai, nipUtamaAnomali, type AnomaliNip, type PegawaiRingkas } from "@/lib/domain/bandingkanBatch";
import { isNipPlaceholderTidakStabil, JENIS_FIELD_IDENTITAS_EKSTERNAL, kunciIdentitasEksternal } from "@/lib/domain/identitasEksternal";
import { loadKamusMap } from "@/lib/domain/masterCache";
import { namaBulan } from "@/lib/laporan/periode";

export type AnomaliTampil = AnomaliNip & { sudahTercatat: boolean; polaPlaceholder: boolean };

export type HasilPerbandinganBatch = {
  labelA: string;
  labelB: string;
  orangBaru: PegawaiRingkas[];
  orangHilang: PegawaiRingkas[];
  nipAnomali: AnomaliTampil[];
  catatanTersimpan: { kategori: string; nipUtama: string; alasan: string }[];
};

const select = {
  pegawaiNip: true,
  nama: true,
  jenisPegawai: { select: { nama: true } },
  statusKepegawaian: { select: { nama: true } },
  unitAsal: { select: { nama: true } },
} as const;

type BarisSnapshot = { pegawaiNip: string; nama: string; jenisPegawai: { nama: string }; statusKepegawaian: { nama: string }; unitAsal: { nama: string } };

const keRingkas = (p: BarisSnapshot): PegawaiRingkas => ({ nip: p.pegawaiNip, nama: p.nama, jenisPegawai: p.jenisPegawai.nama, status: p.statusKepegawaian.nama, unitKerja: p.unitAsal.nama });

export async function hitungPerbandinganBatch(prisma: PrismaClient, batchAId: number, batchBId: number): Promise<HasilPerbandinganBatch | null> {
  const [batchA, batchB] = await Promise.all([prisma.uploadBatch.findUnique({ where: { id: batchAId } }), prisma.uploadBatch.findUnique({ where: { id: batchBId } })]);
  if (!batchA || !batchB || batchA.bulan === null || batchA.tahun === null || batchB.bulan === null || batchB.tahun === null) return null;

  const [pegawaiA, pegawaiB, kamus] = await Promise.all([
    prisma.nominatifBulanan.findMany({ where: { uploadBatchId: batchAId }, select }),
    prisma.nominatifBulanan.findMany({ where: { uploadBatchId: batchBId }, select }),
    loadKamusMap(prisma),
  ]);
  const hasil = bandingkanDaftarPegawai(pegawaiA.map(keRingkas), pegawaiB.map(keRingkas));

  const nipAnomali: AnomaliTampil[] = hasil.nipAnomali.map((anomali) => {
    const sudahTercatat = anomali.anggota.some((anggota) => {
      const kamusNip = kamus.get(`${JENIS_FIELD_IDENTITAS_EKSTERNAL}::${kunciIdentitasEksternal(anggota.nama)}`);
      return anomali.anggota.some((a2) => a2.nip === kamusNip);
    });
    const polaPlaceholder = anomali.anggota.some((anggota) => isNipPlaceholderTidakStabil(anggota.nip, batchB.bulan!, batchB.tahun!));
    return { ...anomali, sudahTercatat, polaPlaceholder };
  });

  // Catatan dicari menurut NIP yang relevan ke perbandingan ini (bukan dikunci ke pasangan batch A/B), supaya melekat ke NIP itu di perbandingan mana pun.
  const nipRelevan = [...hasil.orangBaru.map((p) => p.nip), ...hasil.orangHilang.map((p) => p.nip), ...hasil.nipAnomali.map((a) => nipUtamaAnomali(a))];
  const catatanTersimpan = await prisma.catatanPerubahanBatch.findMany({ where: { nipUtama: { in: nipRelevan } }, select: { kategori: true, nipUtama: true, alasan: true } });

  return {
    labelA: `${namaBulan(batchA.bulan)} ${batchA.tahun}`,
    labelB: `${namaBulan(batchB.bulan)} ${batchB.tahun}`,
    orangBaru: hasil.orangBaru,
    orangHilang: hasil.orangHilang,
    nipAnomali,
    catatanTersimpan,
  };
}

export type MasukanCatatan = { uploadBatchAId: number | null; uploadBatchBId: number | null; kategori: string; nipUtama: string; nama: string; alasan: string; nipTerkait?: string[] };
export const KATEGORI_CATATAN = ["Baru", "Hilang", "Anomali"];

/** Simpan/ubah catatan alasan, dikunci ke (kategori, NIP utama). Batch A/B hanya konteks informatif (perbandingan terakhir). */
export async function simpanCatatanPerubahan(prisma: PrismaClient, m: MasukanCatatan, penggunaId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const alasan = m.alasan.trim();
  if (!KATEGORI_CATATAN.includes(m.kategori) || !m.nipUtama) return { ok: false, error: "Data catatan tidak lengkap." };
  if (!alasan) return { ok: false, error: "Alasan tidak boleh kosong." };
  // Kolom pembuat wajib: sesi lama (id tidak ada) memakai pengguna pertama.
  const ada = penggunaId ? await prisma.user.findUnique({ where: { id: penggunaId }, select: { id: true } }) : null;
  const pembuat = ada?.id ?? (await prisma.user.findFirst({ select: { id: true }, orderBy: { id: "asc" } }))?.id;
  if (!pembuat) return { ok: false, error: "Tidak ada pengguna terdaftar." };
  // Batch yang sudah tidak ada (dihapus) tidak boleh melanggar kunci asing.
  const batchAda = async (id: number | null) => (id !== null && (await prisma.uploadBatch.findUnique({ where: { id }, select: { id: true } })) ? id : null);
  const a = await batchAda(m.uploadBatchAId);
  const b = await batchAda(m.uploadBatchBId);
  await prisma.catatanPerubahanBatch.upsert({
    where: { kategori_nipUtama: { kategori: m.kategori, nipUtama: m.nipUtama } },
    create: { uploadBatchAId: a, uploadBatchBId: b, kategori: m.kategori, nipUtama: m.nipUtama, nipTerkait: m.nipTerkait, nama: m.nama, alasan, dibuatOlehId: pembuat },
    update: { alasan, nama: m.nama, nipTerkait: m.nipTerkait, uploadBatchAId: a, uploadBatchBId: b },
  });
  return { ok: true };
}
