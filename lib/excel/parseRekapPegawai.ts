import ExcelJS from "exceljs";

import { ColumnMappingError, type ParseRawNominatifResult, type RawNominatifRow } from "./types";

/**
 * Format tarikan SIMPEGA BARU (mulai Okt 2026, nama file biasanya "REKAP_PEGAWAI...") - beda
 * total dari format "Nominatif" lama: 1 sheet datar 1 baris header, setiap kolom nama UNIK
 * (tidak ada duplikat perlu disambiguasi urutan-kemunculan spt format lama), tapi teks selnya
 * ditempeli karakter tak-terlihat (mis. U+200C zero-width non-joiner) di depan setiap nilai.
 */

/** Karakter kontrol tak-terlihat yang ditempel di depan SETIAP nilai teks file ini - dibuang
 *  sebelum diproses lebih lanjut, bukan cuma di-trim (trim tidak membuang karakter ini). */
function stripInvisible(s: string): string {
  return s.replace(/[​-‏﻿]/g, "");
}

function cellStr(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "richText" in v) {
    return stripInvisible((v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("")).trim();
  }
  if (typeof v === "object" && "result" in v) {
    return stripInvisible(String((v as ExcelJS.CellFormulaValue).result ?? "")).trim();
  }
  return stripInvisible(String(v)).trim();
}

/** Tanggal di file ini pernah terlihat dalam 2 gaya berbeda antar kolom (ISO "2025-01-01" utk
 *  Tanggal Masuk, "DD-MM-YYYY" utk TMT lain) - dicoba dua-duanya, gagal keduanya -> null. */
function parseDateFlexible(s: string): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const [, d, mo, y] = dmy;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  return null;
}

function cellDate(row: ExcelJS.Row, col: number): Date | null {
  const v = row.getCell(col).value;
  if (v instanceof Date) return v;
  return parseDateFlexible(cellStr(row, col));
}

const KOLOM_WAJIB = [
  "NIP",
  "Nama Lengkap (Tanpa Gelar)",
  "Nama Lengkap (Dengan Gelar)",
  "Jenis Kelamin",
  "Agama",
  "Status Pegawai",
  "Kelompok Jabatan",
  "Jenis Pegawai",
  "Tanggal Masuk",
  "Golongan",
  "Jabatan Fungsional",
  "Jabatan Tambahan",
  "Unit Kerja Jabatan Tambahan",
  "Jenjang Pendidikan",
  "Unit Kerja",
  "Unit Kerja Induk",
  "Unit Kerja Induk (Level Atas)",
] as const;
// Tanggal Lahir SENGAJA tidak wajib - tarikan ini terkonfirmasi tidak pernah mengisinya
// (keputusan user), tapi tetap dipetakan kalau kolomnya ada & suatu saat terisi.
const KOLOM_OPSIONAL = ["Tanggal Lahir"] as const;

type ColumnMapRekapPegawai = Record<(typeof KOLOM_WAJIB)[number], number> &
  Partial<Record<(typeof KOLOM_OPSIONAL)[number], number>>;

/** Deteksi format ini: sheet mana pun yang baris pertamanya punya SEMUA kolom wajib di atas. */
export function detectRekapPegawaiSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  for (const sheet of workbook.worksheets) {
    const header = sheet.getRow(1);
    const names = new Set<string>();
    for (let c = 1; c <= sheet.columnCount; c++) {
      const v = header.getCell(c).value;
      if (typeof v === "string") names.add(stripInvisible(v).trim());
    }
    if (KOLOM_WAJIB.every((k) => names.has(k))) return sheet;
  }
  return null;
}

function buildColumnMap(sheet: ExcelJS.Worksheet): ColumnMapRekapPegawai {
  const header = sheet.getRow(1);
  const byName = new Map<string, number>();
  for (let c = 1; c <= sheet.columnCount; c++) {
    const v = header.getCell(c).value;
    if (typeof v === "string") byName.set(stripInvisible(v).trim(), c);
  }

  const map = {} as ColumnMapRekapPegawai;
  for (const k of KOLOM_WAJIB) {
    const col = byName.get(k);
    if (!col) {
      throw new ColumnMappingError(
        `Kolom wajib "${k}" tidak ditemukan di header sheet "${sheet.name}". Format REKAP_PEGAWAI mungkin berubah lagi - periksa manual sebelum lanjut.`
      );
    }
    map[k] = col;
  }
  for (const k of KOLOM_OPSIONAL) {
    const col = byName.get(k);
    if (col) map[k] = col;
  }
  return map;
}

function extractRow(sheet: ExcelJS.Worksheet, rowNumber: number, map: ColumnMapRekapPegawai): RawNominatifRow | null {
  const row = sheet.getRow(rowNumber);
  const nip = cellStr(row, map.NIP);
  if (!/^\d+$/.test(nip)) return null; // baris kosong/bukan data pegawai riil

  return {
    nip,
    namaDenganGelar: cellStr(row, map["Nama Lengkap (Dengan Gelar)"]),
    namaTanpaGelar: cellStr(row, map["Nama Lengkap (Tanpa Gelar)"]),
    jenisKelaminRaw: cellStr(row, map["Jenis Kelamin"]),
    tanggalLahir: map["Tanggal Lahir"] ? cellDate(row, map["Tanggal Lahir"]) : null,
    agamaRaw: cellStr(row, map.Agama),
    statusPegawaiRaw: cellStr(row, map["Status Pegawai"]),
    jenisPegawaiRaw: cellStr(row, map["Jenis Pegawai"]),
    kelompokJabatanRaw: cellStr(row, map["Kelompok Jabatan"]) || null,
    // Format ini pisah "Golongan" ("IV/e"/"X" utk PPPK) dari "Pangkat" (nama jabatan pangkatnya)
    // - kode golongan/jenjang PPPK-nya sendiri sudah persis di kolom "Golongan", tidak perlu
    // diekstrak lagi dari gabungan teks spt format lama.
    golonganPangkatRaw: cellStr(row, map.Golongan),
    jabatanFungsionalRaw: cellStr(row, map["Jabatan Fungsional"]),
    jabatanTambahanRaw: cellStr(row, map["Jabatan Tambahan"]),
    pendidikanRaw: cellStr(row, map["Jenjang Pendidikan"]),
    subagUnitKerjaRaw: cellStr(row, map["Unit Kerja"]),
    unitKerjaIndukRaw: cellStr(row, map["Unit Kerja Induk"]),
    direktoratFakultasRaw: cellStr(row, map["Unit Kerja Induk (Level Atas)"]),
    unitStatistikRaw: "", // tidak ada padanan di format ini
    tanggalMasuk: cellDate(row, map["Tanggal Masuk"]),
    unitKerjaJabatanTambahanRaw: cellStr(row, map["Unit Kerja Jabatan Tambahan"]),
  };
}

export function parseRekapPegawai(sheet: ExcelJS.Worksheet): ParseRawNominatifResult {
  const map = buildColumnMap(sheet);

  const rows: RawNominatifRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const extracted = extractRow(sheet, r, map);
    if (extracted) rows.push(extracted);
  }

  const petaKolomTerdeteksi: Record<string, number | null> = { ...map };
  return { rows, totalBarisSheet: sheet.rowCount - 1, petaKolomTerdeteksi };
}
