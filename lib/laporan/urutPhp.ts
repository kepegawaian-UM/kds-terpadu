/**
 * Perbandingan teks ala PHP 8 (`sortBy('...')` / `asort` SORT_REGULAR di Laravel Collection):
 * dua string yang sama-sama angka dibandingkan sebagai angka, selain itu urut byte UTF-8
 * (huruf besar sebelum kecil, tanpa kolasi). Berbeda dari kolasi MySQL di `urutNama.ts`:
 * dipakai pada laporan yang di KDS2 diurutkan di PHP, bukan di SQL (mis. Belum Ada Rekap).
 */

/** String numerik PHP 8: spasi di ujung/pangkal boleh, tanda opsional, desimal/eksponen. */
const NUMERIK = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/;

export function bandingkanPhp(a: string, b: string): number {
  if (NUMERIK.test(a) && NUMERIK.test(b)) {
    const x = Number(a);
    const y = Number(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Urut menurut `nama` seperti `sortBy('nama')`: stabil, nama sama mempertahankan urutan asal. */
export function urutkanNamaPhp<T extends { nama: string }>(daftar: readonly T[]): T[] {
  return [...daftar].sort((x, y) => bandingkanPhp(x.nama, y.nama));
}
