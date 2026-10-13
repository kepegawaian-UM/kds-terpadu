/**
 * Ekspor teks murni (aman dipakai di browser maupun server): CSV, salin-ke-clipboard (TSV), dan
 * header unduhan. Penulisan .xlsx ada di `xlsx.ts` (khusus server, memuat exceljs).
 */

export type Sel = string | number | null | undefined;

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MIME_CSV = "text/csv; charset=utf-8";

const teks = (v: Sel): string => (v === null || v === undefined ? "" : String(v));

/** CSV (RFC 4180): sel berisi koma, kutip, atau baris baru dibungkus kutip; kutip digandakan. */
export function keCsv(judul: string[], baris: Sel[][]): string {
  const sel = (v: Sel) => {
    const t = teks(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [judul, ...baris].map((b) => b.map(sel).join(",")).join("\r\n");
}

/** Teks dipisah tab untuk Salin; tab/baris baru di dalam sel diganti spasi. */
export function keTsv(judul: string[], baris: Sel[][]): string {
  const sel = (v: Sel) => teks(v).replace(/[\t\r\n]+/g, " ");
  return [judul, ...baris].map((b) => b.map(sel).join("\t")).join("\n");
}

/**
 * Header Content-Disposition untuk unduhan: `filename` ASCII (aksen dibuang) sebagai cadangan dan
 * `filename*` UTF-8 (RFC 5987) supaya nama file persis sesuai tab + filter.
 */
export function headerUnduhan(namaTanpaEkstensi: string, ekstensi: string): string {
  const penuh = `${namaTanpaEkstensi}.${ekstensi}`;
  const ascii = penuh
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "");
  const utf8 = encodeURIComponent(penuh).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
