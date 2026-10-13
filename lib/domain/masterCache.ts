import { prisma } from "@/lib/db";

/**
 * Snapshot seluruh master data di memori untuk 1 proses import batch (maks ~180 baris per
 * tabel, total kecil) - menghindari N+1 query per baris nominatif (bisa ribuan baris/bulan).
 */
export async function loadMasterCache() {
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
    prisma.jenisPegawai.findMany(),
    prisma.statusKepegawaian.findMany(),
    prisma.golongan.findMany(),
    prisma.jabatanFungsionalDosen.findMany(),
    prisma.jabatanFungsionalTendik.findMany(),
    prisma.jabatanFungsiUmumPelaksana.findMany(),
    prisma.kategoriAkademisiLuar.findMany(),
    prisma.unitAsal.findMany(),
    prisma.jabatanTambahanRole.findMany(),
    prisma.programStudi.findMany(),
    prisma.unitInduk.findMany(),
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

export async function loadKamusMap(): Promise<KamusMap> {
  const rows = await prisma.kamusKoreksi.findMany();
  return new Map(rows.map((r) => [`${r.jenisField}::${r.kunciMentah}`, r.nilaiResolusi]));
}

export type NipTerdaftar = Set<string>;

/** NIP yang SUDAH PERNAH tercatat (dari bulan manapun sebelumnya) - dipakai utk membedakan
 *  "pegawai baru" (NIP belum pernah muncul) dari "pegawai lama yang datanya kebetulan kosong
 *  lagi bulan ini", lihat resolveJabatan. */
export async function loadNipTerdaftar(): Promise<NipTerdaftar> {
  const rows = await prisma.pegawai.findMany({ select: { nip: true } });
  return new Set(rows.map((r) => r.nip));
}

export const JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN = "PegawaiDikecualikanPermanen";

/** NIP yang ditandai admin sbg "jangan tampilkan lagi selamanya" (mis. sudah pensiun tapi
 *  file sumber SIMPEGA masih menyertakannya tiap bulan) - di-skip TOTAL dari importBatch,
 *  tidak masuk arsip maupun daftar review, di bulan manapun berikutnya. Disimpan lewat
 *  KamusKoreksi (jenisField ini) supaya bisa dilihat/dihapus lagi dari halaman /kamus kalau
 *  ternyata keliru, tanpa perlu tabel/halaman terpisah. */
export async function loadNipDikecualikanPermanen(): Promise<Set<string>> {
  const rows = await prisma.kamusKoreksi.findMany({
    where: { jenisField: JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN },
    select: { kunciMentah: true },
  });
  return new Set(rows.map((r) => r.kunciMentah));
}
