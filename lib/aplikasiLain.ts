/**
 * Tautan ke aplikasi lain milik Seksi KDS (menu "Aplikasi lain" di sidebar). Tautan biasa: tidak ada data KDS Terpadu yang ikut terkirim,
 * dan tiap aplikasi tetap meminta login sendiri. Untuk menambah, mengganti, atau mengurutkan ulang cukup ubah daftar ini (alamat https saja).
 */
export type AplikasiLain = { nama: string; url: string };

export const APLIKASI_LAIN: readonly AplikasiLain[] = [
  { nama: "KDS3 Crosscheck Sister", url: "https://crosscheck-sister-simpega.vercel.app/login?next=%2Fcrosscheck" },
  { nama: "KDS4 Monitor TB", url: "https://kds4-tb.vercel.app/masuk" },
  { nama: "KDS5 Pengkategori Hukuman Absensi", url: "https://kategori-hukuman-absensi-tendik.vercel.app/" },
  { nama: "KDS6 Tutor PJJ", url: "https://kds6-tutorpjj.vercel.app/" },
];
