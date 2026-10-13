/**
 * Penulis .xlsx untuk ekspor laporan (khusus server: memuat exceljs). Mengikuti ekspor KDS2
 * (maatwebsite): satu sheet, baris pertama judul kolom, nilai ditulis apa adanya - teks tetap
 * teks (mis. NIP, total dalam string), angka tetap angka.
 */
import ExcelJS from "exceljs";

import { headerUnduhan, MIME_XLSX, type Sel } from "./ekspor";

export async function buatXlsx(judul: string[], baris: Sel[][], namaSheet = "Sheet1"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(namaSheet);
  ws.addRow(judul);
  for (const b of baris) ws.addRow(b.map((v) => (v === undefined ? null : v)));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Respons unduhan .xlsx untuk Route Handler, dengan nama file sesuai tab + filter. */
export async function responXlsx(namaTanpaEkstensi: string, judul: string[], baris: Sel[][]): Promise<Response> {
  const isi = await buatXlsx(judul, baris, namaTanpaEkstensi.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return new Response(new Uint8Array(isi), {
    headers: {
      "Content-Type": MIME_XLSX,
      "Content-Disposition": headerUnduhan(namaTanpaEkstensi, "xlsx"),
      "Cache-Control": "no-store",
    },
  });
}
