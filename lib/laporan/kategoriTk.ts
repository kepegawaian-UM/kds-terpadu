/**
 * Kategori TK (tambahan Terpadu, tidak ada di KDS2): rentang total hari TK setahun yang dipakai dropdown "Kategori TK" di Absensi Tahunan
 * (tabel, Excel biasa, dan Excel TK). maks null = tanpa batas atas. "semua" = tanpa penyaringan pada tabel; pada Excel TK berarti 3 hari ke atas.
 */
export const KATEGORI_TK = {
  semua: { label: "Semua kategori", min: 3, maks: null, nama: null },
  ringan: { label: "TK Ringan (3-10 hari)", min: 3, maks: 10, nama: "TK Ringan" },
  sedang: { label: "TK Sedang (11-20 hari)", min: 11, maks: 20, nama: "TK Sedang" },
  berat: { label: "TK Berat (lebih dari 20 hari)", min: 21, maks: null, nama: "TK Berat" },
} as const satisfies Record<string, { label: string; min: number; maks: number | null; nama: string | null }>;
export type KategoriTk = keyof typeof KATEGORI_TK;

/** Kategori dari parameter URL; null bila tidak dikenal. */
export function kategoriDari(nilai: string | null | undefined): KategoriTk | null {
  const k = String(nilai ?? "").trim();
  return Object.hasOwn(KATEGORI_TK, k) ? (k as KategoriTk) : null;
}

/** Apakah total TK setahun masuk kategori (null atau "semua" = semua lolos). */
export function dalamKategoriTk(total: number, kategori: KategoriTk | null | undefined): boolean {
  if (!kategori || kategori === "semua") return true;
  const k = KATEGORI_TK[kategori];
  return total >= k.min && (k.maks === null || total <= k.maks);
}

/** Filter tambahan Absensi Tahunan di luar Jenis/Status/Keaktifan. unitIndukKode "" atau tak dikenal = semua unit induk. */
export type FilterTambahanTahunan = { kategori?: KategoriTk | null; unitIndukKode?: string | null };
