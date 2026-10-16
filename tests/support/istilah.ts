/**
 * KDS2 memakai istilah "Rekap"; KDS Terpadu memakai "Absensi" (keputusan pengguna 16 Okt 2026, hanya teks tampilan).
 * Tes paritas membandingkan teks keluaran KDS2 asli (oracle PHP) dengan keluaran Terpadu: teks KDS2 dipetakan ke istilah baru dengan
 * aturan yang SAMA dengan penggantian di kode, sehingga yang dibuktikan tetap isi/aturan yang sama dan bukan kata-katanya.
 */
const L = String.raw`(?<![\w/\-.])`;
const R = String.raw`(?![\w/\-]|\.\w)`; // bukan bagian nama berkas ("rekap.xlsx") atau alamat
const ATURAN: [RegExp, string][] = [
  [/REKAP KEHADIRAN INDIVIDUAL TAHUN/g, "ABSENSI PEGAWAI TAHUN"],
  [/Rekap Kehadiran Bulanan/g, "Absensi Bulanan"],
  [/Rekap Kehadiran Tahunan/g, "Absensi Tahunan"],
  [/Rekap Kehadiran Individual/g, "Absensi Pegawai"],
  [/Rekap Individual/g, "Absensi Pegawai"],
  [/Rekap Kehadiran/g, "Absensi"],
  [/rekap kehadiran/g, "absensi"],
  [new RegExp(`${L}Rekap${R}`, "g"), "Absensi"],
  [new RegExp(`${L}rekap${R}`, "g"), "absensi"],
];

export function istilahBaru(teks: string): string {
  return ATURAN.reduce((t, [pola, ganti]) => t.replace(pola, ganti), teks);
}

/** Memetakan semua nilai teks (bukan kunci) pada struktur JSON dari oracle KDS2. */
export function petakanIstilah<T>(nilai: T): T {
  if (typeof nilai === "string") return istilahBaru(nilai) as T;
  if (Array.isArray(nilai)) return nilai.map(petakanIstilah) as T;
  if (nilai && typeof nilai === "object") return Object.fromEntries(Object.entries(nilai).map(([k, v]) => [k, petakanIstilah(v)])) as T;
  return nilai;
}
