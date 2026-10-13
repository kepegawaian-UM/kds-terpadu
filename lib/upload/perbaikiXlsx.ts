/**
 * Sebagian berkas .xlsx (mis. hasil .NET OpenXML SDK / pustaka lain, termasuk template resmi Upload Rekap KDS2) menulis
 * target relasi sebagai jalur ABSOLUT ("/xl/tables/table1.xml") alih-alih relatif ("../tables/table1.xml"). PhpSpreadsheet
 * (KDS2) membacanya tanpa masalah, tetapi `exceljs` gagal pada berkas bertabel ("Cannot read properties of undefined").
 * Fungsi ini menulis ulang target absolut menjadi relatif sebelum berkas dibaca. Berkas tanpa target absolut dikembalikan apa adanya.
 */
import { posix } from "node:path";

import JSZip from "jszip";

export async function perbaikiRelasiAbsolut(berkas: Buffer): Promise<Buffer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(berkas);
  } catch {
    return berkas; // bukan arsip yang valid: biarkan pembaca melaporkan galatnya
  }
  let berubah = false;
  for (const nama of Object.keys(zip.files)) {
    if (!nama.endsWith(".rels")) continue;
    const xml = await zip.file(nama)!.async("string");
    // bagian sumber relasi: "xl/worksheets/_rels/sheet1.xml.rels" -> "xl/worksheets"; "_rels/.rels" -> ""
    const folderSumber = posix.dirname(posix.dirname(nama));
    const baru = xml.replace(/(<Relationship\b[^>]*?\sTarget=")\/([^"]*)(")/g, (cocok, awal: string, jalur: string, akhir: string) => {
      if (/TargetMode="External"/i.test(cocok)) return cocok;
      berubah = true;
      return `${awal}${posix.relative(folderSumber === "." ? "" : folderSumber, jalur) || jalur}${akhir}`;
    });
    if (baru !== xml) zip.file(nama, baru);
  }
  if (!berubah) return berkas;
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
