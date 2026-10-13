import ExcelJS from "exceljs";

import { buildColumnMap, type ColumnMap } from "./columnMap";
import { detectRekapPegawaiSheet, parseRekapPegawai } from "./parseRekapPegawai";
import { ColumnMappingError, type ParseRawNominatifResult, type RawNominatifRow } from "./types";

const SHEET_NAME = "Nominatif";
const MAX_HEADER_SCAN_ROWS = 10;

function cellValue(row: ExcelJS.Row, col: number): ExcelJS.CellValue {
  return row.getCell(col).value;
}

function cellStr(row: ExcelJS.Row, col: number): string {
  const v = cellValue(row, col);
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
  }
  if (typeof v === "object" && "result" in v) {
    return String((v as ExcelJS.CellFormulaValue).result ?? "");
  }
  return String(v).trim();
}

function cellDate(row: ExcelJS.Row, col: number): Date | null {
  const v = cellValue(row, col);
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.trim()) {
    // Sebagian sel tanggal di file sumber tersimpan sebagai teks format DD-MM-YYYY.
    const m = v.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return new Date(Number(y), Number(mo) - 1, Number(d));
    }
  }
  return null;
}

function findHeaderRowNumber(sheet: ExcelJS.Worksheet): number {
  for (let r = 1; r <= MAX_HEADER_SCAN_ROWS; r++) {
    const row = sheet.getRow(r);
    const firstCell = row.getCell(1).value;
    if (typeof firstCell === "string" && firstCell.trim() === "#") return r;
    if (typeof firstCell === "number" && firstCell === 1 && r > 1) break;
  }
  throw new ColumnMappingError(
    `Baris header (kolom pertama = "#") tidak ditemukan dalam ${MAX_HEADER_SCAN_ROWS} baris pertama sheet "${SHEET_NAME}".`
  );
}

function headerRowToArray(sheet: ExcelJS.Worksheet, headerRowNumber: number): unknown[] {
  const row = sheet.getRow(headerRowNumber);
  const arr: unknown[] = [];
  const colCount = sheet.columnCount;
  for (let c = 1; c <= colCount; c++) {
    const v = row.getCell(c).value;
    arr[c - 1] = typeof v === "string" ? v : v instanceof Date ? v : v == null ? null : String(v);
  }
  return arr;
}

function extractRow(sheet: ExcelJS.Worksheet, rowNumber: number, map: ColumnMap): RawNominatifRow | null {
  const row = sheet.getRow(rowNumber);
  const nip = cellStr(row, map.nip).trim();
  if (!/^\d+$/.test(nip)) return null; // baris footer/kosong/contoh - bukan data pegawai riil

  return {
    nip,
    namaDenganGelar: cellStr(row, map.namaDenganGelar),
    namaTanpaGelar: cellStr(row, map.namaTanpaGelar),
    jenisKelaminRaw: cellStr(row, map.jenisKelamin),
    tanggalLahir: cellDate(row, map.tanggalLahir),
    agamaRaw: cellStr(row, map.agama),
    statusPegawaiRaw: cellStr(row, map.statusPegawai),
    jenisPegawaiRaw: cellStr(row, map.jenisPegawai),
    kelompokJabatanRaw: map.kelompokJabatan ? cellStr(row, map.kelompokJabatan) || null : null,
    golonganPangkatRaw: cellStr(row, map.golonganPangkat),
    jabatanFungsionalRaw: cellStr(row, map.jabatanFungsional),
    jabatanTambahanRaw: cellStr(row, map.jabatanTambahan),
    pendidikanRaw: cellStr(row, map.pendidikan),
    subagUnitKerjaRaw: cellStr(row, map.subagUnitKerja),
    unitKerjaIndukRaw: cellStr(row, map.unitKerjaInduk),
    direktoratFakultasRaw: cellStr(row, map.direktoratFakultas),
    unitStatistikRaw: cellStr(row, map.unitStatistik),
    tanggalMasuk: cellDate(row, map.tanggalMasuk),
    unitKerjaJabatanTambahanRaw: "", // tidak ada di format lama ini
  };
}

/**
 * Format "Nominatif" LAMA (sheet bernama persis "Nominatif", header multi-blok dgn kolom
 * duplikat spt TMT x3) - dipertahankan apa adanya utk kompatibilitas file lama, TIDAK dipakai
 * lagi utk tarikan SIMPEGA baru (lihat parseRekapPegawai.ts & dispatcher di bawah).
 */
function parseNominatifLama(workbook: ExcelJS.Workbook): ParseRawNominatifResult {
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new ColumnMappingError(`Sheet "${SHEET_NAME}" tidak ditemukan di file yang diupload.`);
  }

  const headerRowNumber = findHeaderRowNumber(sheet);
  const headerArray = headerRowToArray(sheet, headerRowNumber);
  const map = buildColumnMap(headerArray);

  const rows: RawNominatifRow[] = [];
  const lastRow = sheet.rowCount;
  for (let r = headerRowNumber + 1; r <= lastRow; r++) {
    const extracted = extractRow(sheet, r, map);
    if (extracted) rows.push(extracted);
  }

  const petaKolomTerdeteksi: Record<string, number | null> = { ...map };

  return { rows, totalBarisSheet: lastRow - headerRowNumber, petaKolomTerdeteksi };
}

/**
 * Dispatcher: coba format "Nominatif" lama dulu (sheet persis bernama "Nominatif"), kalau tidak
 * ada baru coba format REKAP_PEGAWAI baru (dideteksi dari header, bukan nama sheet - nama sheet
 * tarikan ini generik "Worksheet"). Kalau dua-duanya tidak cocok, GAGAL KERAS dgn pesan jelas -
 * konsisten dgn kebijakan "tidak menebak diam-diam" utk perubahan format yang belum dikenali.
 */
export async function parseRawNominatif(buffer: Buffer): Promise<ParseRawNominatifResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  if (workbook.getWorksheet(SHEET_NAME)) {
    return parseNominatifLama(workbook);
  }

  const sheetBaru = detectRekapPegawaiSheet(workbook);
  if (sheetBaru) {
    return parseRekapPegawai(sheetBaru);
  }

  throw new ColumnMappingError(
    `Format file tidak dikenali - tidak ada sheet "${SHEET_NAME}" (format Nominatif lama) maupun sheet dengan kolom-kolom REKAP_PEGAWAI (format baru). Periksa manual sebelum lanjut.`
  );
}
