/**
 * Pembersih berkas tarikan SIMPEGA (REKAP_PEGAWAI): membuat berkas BARU yang hanya memuat kolom di daftar putih (KOLOM_DIIZINKAN), supaya data
 * pribadi sensitif (NIK, No KK, NPWP, nama ibu kandung, alamat, email, no HP, rekening, data pasangan, gaji, dst.) tidak pernah sampai ke server.
 * Dijalankan di komputer pengguna lewat `npm run bersihkan`. Berkas baru dibangun dari nol (bukan menyunting yang asli) sehingga tidak membawa sheet
 * tersembunyi, komentar, gaya, maupun properti dokumen (nama pembuat, dsb.).
 */
import ExcelJS from "exceljs";

import { detectRekapPegawaiSheet, KOLOM_DIIZINKAN, KOLOM_WAJIB_REKAP, kolomDiLuarDaftar, stripInvisible } from "@/lib/excel/parseRekapPegawai";
import { parseRawNominatif } from "@/lib/excel/parseRawNominatif";

export type LaporanPembersihan = {
  namaSheet: string;
  kolomAsli: number;
  kolomDipertahankan: string[];
  /** hanya NAMA kolom (tidak pernah isinya) */
  kolomDibuang: string[];
  jumlahBaris: number;
};

export class BerkasBukanRekapPegawai extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BerkasBukanRekapPegawai";
  }
}

const teksSel = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "richText" in v) return stripInvisible(v.richText.map((t) => t.text).join("")).trim();
  if (typeof v === "object" && "result" in v) return stripInvisible(String(v.result ?? "")).trim();
  return stripInvisible(String(v)).trim();
};

/** Nilai sel yang dibawa ke berkas bersih: tanggal tetap tanggal, angka tetap angka, selebihnya teks tanpa karakter tak terlihat. */
function nilaiBersih(v: ExcelJS.CellValue): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return v;
  const t = teksSel(v);
  return t === "" ? null : t;
}

/** Berjalan di Node (alat `npm run bersihkan`) maupun di browser (halaman Bersihkan Berkas): hanya memakai Uint8Array, tanpa API khusus Node. */
export async function bersihkanRekapPegawai(asli: Uint8Array): Promise<{ buffer: Uint8Array; laporan: LaporanPembersihan }> {
  const wbAsli = new ExcelJS.Workbook();
  await wbAsli.xlsx.load(asli as unknown as ExcelJS.Buffer);
  const sheet = detectRekapPegawaiSheet(wbAsli);
  if (!sheet) {
    throw new BerkasBukanRekapPegawai(`Berkas ini bukan format REKAP_PEGAWAI: tidak ada sheet yang header-nya memuat semua kolom wajib (${KOLOM_WAJIB_REKAP.join(", ")}).`);
  }

  const header = sheet.getRow(1);
  const kolomAsli: { indeks: number; nama: string }[] = [];
  for (let c = 1; c <= sheet.columnCount; c++) {
    const nama = teksSel(header.getCell(c).value);
    if (nama) kolomAsli.push({ indeks: c, nama });
  }
  const dipertahankan = kolomAsli.filter((k) => KOLOM_DIIZINKAN.includes(k.nama));
  const dibuang = kolomAsli.filter((k) => !KOLOM_DIIZINKAN.includes(k.nama));
  const kolomNip = dipertahankan.find((k) => k.nama === "NIP")!;

  const wb = new ExcelJS.Workbook();
  wb.creator = "pembersih KDS Terpadu";
  wb.lastModifiedBy = "pembersih KDS Terpadu";
  const ws = wb.addWorksheet("Worksheet");
  ws.addRow(dipertahankan.map((k) => k.nama));
  let jumlahBaris = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const baris = sheet.getRow(r);
    if (!/^\d+$/.test(teksSel(baris.getCell(kolomNip.indeks).value))) continue; // sama dengan pembaca: baris tanpa NIP digit bukan data pegawai
    ws.addRow(dipertahankan.map((k) => nilaiBersih(baris.getCell(k.indeks).value)));
    jumlahBaris++;
  }
  const kolomNipBaru = dipertahankan.findIndex((k) => k.nama === "NIP") + 1;
  ws.getColumn(kolomNipBaru).numFmt = "@"; // NIP 18 digit tetap teks

  const buffer = new Uint8Array(await wb.xlsx.writeBuffer());
  // Pemeriksaan sendiri atas HASIL (bukan atas niat): baca ulang dan pastikan tidak ada kolom di luar daftar putih.
  const wbCek = new ExcelJS.Workbook();
  await wbCek.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const lain = wbCek.worksheets.length !== 1 ? ["(jumlah sheet bukan satu)"] : kolomDiLuarDaftar(wbCek.worksheets[0]);
  if (lain.length > 0) throw new Error(`Pembersihan gagal: berkas hasil masih memuat ${lain.join(", ")}. Berkas tidak dibuat.`);

  return {
    buffer,
    laporan: { namaSheet: sheet.name, kolomAsli: kolomAsli.length, kolomDipertahankan: dipertahankan.map((k) => k.nama), kolomDibuang: dibuang.map((k) => k.nama), jumlahBaris },
  };
}

/** Bukti bahwa pembersihan tidak mengubah apa yang dibaca aplikasi: baris hasil baca (tanpa tanggal lahir opsional yang sama) identik. */
export async function hasilBacaIdentik(asli: Uint8Array, bersih: Uint8Array): Promise<{ identik: boolean; barisAsli: number; barisBersih: number }> {
  const [a, b] = await Promise.all([parseRawNominatif(asli), parseRawNominatif(bersih)]);
  return { identik: JSON.stringify(a.rows) === JSON.stringify(b.rows), barisAsli: a.rows.length, barisBersih: b.rows.length };
}
