import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db";

/** Klien Prisma atau klien transaksi; bawaan = klien global (perubahan dari salinan KDS1: bisa disuntik untuk tes dan transaksi). */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Snapshot seluruh master data di memori untuk 1 proses import batch (maks ~180 baris per
 * tabel, total kecil) - menghindari N+1 query per baris nominatif (bisa ribuan baris/bulan).
 */
export async function loadMasterCache(db: Db = prisma) {
  const [
    jenisPegawai,
    statusKepegawaian,
    golongan,
    jabatanFungsionalDosen,
    jabatanFungsionalTendik,
    jabatanFungsiUmumPelaksana,
    kategoriAkademisiLuar,
    unitAsal,
    jabatanTambahanRole,
    programStudi,
    unitInduk,
  ] = await Promise.all([
    db.jenisPegawai.findMany(),
    db.statusKepegawaian.findMany(),
    db.golongan.findMany(),
    db.jabatanFungsionalDosen.findMany(),
    db.jabatanFungsionalTendik.findMany(),
    db.jabatanFungsiUmumPelaksana.findMany(),
    db.kategoriAkademisiLuar.findMany(),
    db.unitAsal.findMany(),
    db.jabatanTambahanRole.findMany(),
    db.programStudi.findMany(),
    db.unitInduk.findMany(),
  ]);

  return {
    jenisPegawai,
    statusKepegawaian,
    golongan,
    jabatanFungsionalDosen,
    jabatanFungsionalTendik,
    jabatanFungsiUmumPelaksana,
    kategoriAkademisiLuar,
    unitAsal,
    jabatanTambahanRole,
    programStudi,
    unitInduk,
  };
}

export type MasterCache = Awaited<ReturnType<typeof loadMasterCache>>;

export type KamusMap = Map<string, string>;

export async function loadKamusMap(db: Db = prisma): Promise<KamusMap> {
  const rows = await db.kamusKoreksi.findMany();
  return new Map(rows.map((r) => [`${r.jenisField}::${r.kunciMentah}`, r.nilaiResolusi]));
}

export type NipTerdaftar = Set<string>;

/** NIP yang SUDAH PERNAH tercatat (dari bulan manapun sebelumnya) - dipakai utk membedakan
 *  "pegawai baru" (NIP belum pernah muncul) dari "pegawai lama yang datanya kebetulan kosong
 *  lagi bulan ini", lihat resolveJabatan. */
export async function loadNipTerdaftar(db: Db = prisma): Promise<NipTerdaftar> {
  const rows = await db.pegawai.findMany({ select: { nip: true } });
  return new Set(rows.map((r) => r.nip));
}

export const JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN = "PegawaiDikecualikanPermanen";

/** NIP yang ditandai admin sbg "jangan tampilkan lagi selamanya" (mis. sudah pensiun tapi
 *  file sumber SIMPEGA masih menyertakannya tiap bulan) - di-skip TOTAL dari importBatch,
 *  tidak masuk arsip maupun daftar review, di bulan manapun berikutnya. Disimpan lewat
 *  KamusKoreksi (jenisField ini) supaya bisa dilihat/dihapus lagi dari halaman /kamus kalau
 *  ternyata keliru, tanpa perlu tabel/halaman terpisah. */
export async function loadNipDikecualikanPermanen(db: Db = prisma): Promise<Set<string>> {
  const rows = await db.kamusKoreksi.findMany({
    where: { jenisField: JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN },
    select: { kunciMentah: true },
  });
  return new Set(rows.map((r) => r.kunciMentah));
}
