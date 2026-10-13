/**
 * Padanan fungsi string PHP yang dipakai importer KDS2, supaya perilaku pada masukan aneh sama persis
 * (trim PHP hanya membuang " \t\n\r\0\x0B", tidak seperti String.trim JavaScript yang juga membuang
 * spasi tak-putus dll.).
 */
const SPASI_PHP = " \t\n\r\0\x0B";

export function phpTrim(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && SPASI_PHP.includes(s[a])) a++;
  while (b > a && SPASI_PHP.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

export function phpRtrim(s: string): string {
  let b = s.length;
  while (b > 0 && SPASI_PHP.includes(s[b - 1])) b--;
  return s.slice(0, b);
}

export function phpLtrim(s: string, karakter: string): string {
  let a = 0;
  while (a < s.length && karakter.includes(s[a])) a++;
  return s.slice(a);
}

/** strcasecmp PHP 8: perbandingan byte dengan huruf besar/kecil ASCII dilipat; 0 bila sama. */
export function phpSamaTanpaHuruf(a: string, b: string): boolean {
  const lipat = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return lipat(a) === lipat(b);
}

/** Lebar tampilan seperti mb_strwidth: karakter Asia Timur lebar = 2, lainnya 1. */
function lebar(cp: number): number {
  return (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
    ? 2
    : 1;
}

/** Illuminate\Support\Str::limit($nilai, $batas, '') : potong menurut lebar tampilan, lalu rtrim. */
export function strLimit(nilai: string, batas: number): string {
  const karakter = Array.from(nilai);
  const total = karakter.reduce((s, c) => s + lebar(c.codePointAt(0)!), 0);
  if (total <= batas) return nilai;
  let pakai = 0;
  let hasil = "";
  for (const c of karakter) {
    const w = lebar(c.codePointAt(0)!);
    if (pakai + w > batas) break;
    hasil += c;
    pakai += w;
  }
  return phpRtrim(hasil);
}
