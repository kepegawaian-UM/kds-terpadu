/**
 * Membaca satu sheet menjadi larik baris (indeks 0 = baris Excel 1), sel kosong = null. Padanan
 * Excel::toCollection(CalculatedFormulaImport) / BacaSheetExcel di KDS2: sel berumus dibaca sebagai HASIL
 * hitungnya (bukan teks rumus), teks kaya digabung, tautan diambil teksnya, galat sel menjadi null.
 */
import ExcelJS from "exceljs";

import { KesalahanUpload } from "./konstanta";

export type NilaiSel = string | number | boolean | Date | null;
export type BarisSheet = NilaiSel[];

function normalisasi(v: ExcelJS.CellValue | undefined): NilaiSel {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v !== "object") return v;
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("formula" in v || "sharedFormula" in v) {
    const hasil = (v as { result?: ExcelJS.CellValue }).result;
    if (hasil && typeof hasil === "object" && "error" in hasil) return null;
    return normalisasi(hasil);
  }
  if ("hyperlink" in v) return normalisasi((v as { text?: ExcelJS.CellValue }).text);
  return null; // galat sel (#N/A dst.) dan tipe lain
}

/**
 * @param namaSheet nama sheet persis (sudah dinormalkan oleh periksaBerkas), atau null untuk sheet pertama
 * @param jumlahKolom banyak kolom yang diambil per baris (kolom di luar itu diabaikan)
 */
export async function bacaSheet(berkas: Buffer, namaSheet: string | null, jumlahKolom: number): Promise<BarisSheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(berkas as unknown as ArrayBuffer);
  } catch {
    throw new KesalahanUpload("File Excel tidak bisa dibaca. Pastikan formatnya .xlsx dan tidak rusak.");
  }
  const ws = namaSheet === null ? wb.worksheets[0] : wb.getWorksheet(namaSheet);
  if (!ws) throw new KesalahanUpload("Sheet data tidak ditemukan di file.", "nama_sheet");

  const hasil: BarisSheet[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const baris = ws.getRow(r);
    const nilai: BarisSheet = [];
    for (let c = 1; c <= jumlahKolom; c++) nilai.push(normalisasi(baris.getCell(c).value));
    hasil.push(nilai);
  }
  return hasil;
}
