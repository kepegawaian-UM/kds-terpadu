/**
 * Pembanding nama yang meniru MySQL `utf8mb4_unicode_ci` (kolasi KDS2) supaya urutan daftar
 * identik dengan KDS2. Dasar keputusan (spike F3.0, terhadap 25.705 baris nyata): kolasi ICU
 * PostgreSQL berbeda posisi pada tanda baca (` dan ^ dalam MySQL tepat setelah spasi) dan
 * PostgreSQL mengabaikan kekuatan perbandingan bila ada `rules`, jadi pengurutan dilakukan di
 * aplikasi:
 *   1. tanpa memandang huruf besar/kecil dan aksen (NFD, buang tanda diakritik, huruf kecil);
 *   2. tanda baca < angka < huruf, tanda baca ASCII menurut bobot MySQL (tabel di bawah);
 *   3. seri: urut byte nama asli (huruf besar dulu), lalu id naik.
 * Spasi di ujung diabaikan (PAD SPACE seperti MySQL).
 */

/** Urutan tanda baca ASCII menurut bobot MySQL `utf8mb4_unicode_ci` (diambil via WEIGHT_STRING). */
const URUTAN_TANDA_BACA = " `^_-,;:!?.'\"()[]{}@*/\\&#%+<=>|~$";

const RANK_TANDA_BACA = new Map<string, number>([...URUTAN_TANDA_BACA].map((c, i) => [c, i]));

/** Kunci perbandingan satu karakter: [kelas, nilai]. */
function bobot(c: string): [number, number] {
  const rank = RANK_TANDA_BACA.get(c);
  if (rank !== undefined) return [0, rank]; // tanda baca ASCII (termasuk spasi)
  const kode = c.codePointAt(0)!;
  if (c >= "0" && c <= "9") return [2, kode]; // angka
  if (c >= "a" && c <= "z") return [3, kode]; // huruf latin
  if (/\p{L}|\p{N}/u.test(c)) return [4, kode]; // huruf/angka lain
  return [1, kode]; // tanda baca non-ASCII
}

/** Buang aksen dan samakan huruf besar/kecil; hapus spasi di ujung (PAD SPACE). */
export function kunciNama(nama: string): string {
  return nama
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ +$/, "");
}

export function bandingkanNama(a: string, b: string): number {
  const ka = [...kunciNama(a)];
  const kb = [...kunciNama(b)];
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    if (ka[i] === kb[i]) continue;
    const [ca, va] = bobot(ka[i]);
    const [cb, vb] = bobot(kb[i]);
    if (ca !== cb) return ca - cb;
    if (va !== vb) return va - vb;
  }
  if (ka.length !== kb.length) return ka.length - kb.length;
  // seri menurut kolasi: byte nama asli (huruf besar dulu)
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Urut nama menurut KDS2; seri terakhir diputuskan `id` naik. Tidak mengubah daftar asal. */
export function urutkanMenurutNama<T extends { nama: string; id: number }>(daftar: readonly T[]): T[] {
  return [...daftar].sort((x, y) => bandingkanNama(x.nama, y.nama) || x.id - y.id);
}
