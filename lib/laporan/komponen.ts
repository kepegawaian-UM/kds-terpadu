/**
 * Urutan kolom komponen Rekap Kehadiran di laporan dan ekspor - sama dengan
 * config/rekap_kehadiran.php (urutan kolom template upload), bukan urutan penyimpanan di
 * database. Komponen bertipe teks: JENIS_SHIFT dan CUTI_ANAK_KE.
 */
export const KOLOM_KOMPONEN = [
  "SIGMA_HARI",
  "I",
  "S",
  "SD",
  "TD",
  "TB",
  "TK",
  "CTH",
  "CTM",
  "CTB",
  "CAP",
  "CTLN",
  "TOTAL",
  "JUMLAH_MASUK_NYATA",
  "JENIS_SHIFT",
  "CUTI_ANAK_KE",
] as const;

export type KodeKomponen = (typeof KOLOM_KOMPONEN)[number];
