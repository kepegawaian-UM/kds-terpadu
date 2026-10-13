/**
 * Pembaca tanggal untuk upload Nominatif (Tanggal Lahir, TMT). Padanan `parseTanggal` KDS2 (Carbon::parse) untuk format
 * yang SUNGGUH dipakai, dengan PENGERASAN yang disengaja (lihat docs/08 §10). Carbon::parse menerima hampir apa saja:
 * teks sembarang ("x", "2018") diam-diam menjadi TANGGAL HARI INI, "01/02/1990" dibaca 2 Januari (bulan/hari terbalik bagi
 * pembaca Indonesia), "2018-02-30" menjadi 2 Maret. Di sini semuanya ditolak (baris gagal dengan pesan jelas) alih-alih
 * menyimpan tanggal yang salah. Sel tanggal Excel (yang ditolak KDS2) diterima. Format yang diterima KDS2 dan di sini sama hasilnya:
 *   2018-03-04 | 2018-03-04 10:00:00 | 2018-3-4 | 2018/03/04 | 04-03-2018 | 04.03.2018 | 20180304 | 4 January 2018 | 4-Jan-2018 | Jan 4, 2018
 * Ditambah (tidak dipahami KDS2 atau terbalik): d/m/Y bila hari > 12 (pasti d/m/Y); m/d/Y bila hari kedua > 12; selain itu ambigu -> ditolak.
 */
import type { NilaiSel } from "@/lib/upload/bacaSheet";

import { phpTrim } from "./phpString";

const BULAN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // nama bulan Indonesia (tidak dipahami KDS2; diterima di sini)
  januari: 1, februari: 2, maret: 3, mei: 5, juni: 6, juli: 7, agustus: 8, agu: 8, okt: 10, oktober: 10, nop: 11, nopember: 11, des: 12, desember: 12,
};

function susun(t: number, b: number, h: number): string | null {
  if (!Number.isInteger(t) || t < 1000 || t > 9999 || b < 1 || b > 12 || h < 1) return null;
  const hariDalamBulan = new Date(Date.UTC(t, b, 0)).getUTCDate();
  if (h > hariDalamBulan) return null;
  return `${String(t).padStart(4, "0")}-${String(b).padStart(2, "0")}-${String(h).padStart(2, "0")}`;
}

export function parseTanggalNominatif(v: NilaiSel): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : susun(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v !== "string") return null; // angka/bool: nomor seri Excel tidak dapat dibedakan dari angka biasa -> ditolak, seperti KDS2
  const s = phpTrim(v);
  if (s === "") return null;
  let m: RegExpExecArray | null;

  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(s))) return susun(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s))) return susun(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-.](\d{1,2})[-.](\d{4})$/.exec(s))) return susun(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return susun(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{4})$/.exec(s))) {
    const b = BULAN[m[2].toLowerCase()];
    return b ? susun(+m[3], b, +m[1]) : null;
  }
  if ((m = /^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})$/.exec(s))) {
    const b = BULAN[m[1].toLowerCase()];
    return b ? susun(+m[3], b, +m[2]) : null;
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    const [a, b, t] = [+m[1], +m[2], +m[3]];
    if (a > 12 && b <= 12) return susun(t, b, a); // pasti hari/bulan/tahun
    if (b > 12 && a <= 12) return susun(t, a, b); // pasti bulan/hari/tahun
    return null; // ambigu (atau keduanya > 12)
  }
  return null;
}
