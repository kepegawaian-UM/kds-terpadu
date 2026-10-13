/**
 * Template Impor Koreksi Rekap, dibangkitkan program (berkas .xlsx sengaja tidak masuk repo). Isi petunjuk mengikuti
 * KoreksiRekapImporter::buatTemplate (KDS2). Kolom dibaca menurut NAMA header, bukan posisi.
 */
import ExcelJS from "exceljs";

import { HEADER_KOREKSI } from "./impor";
import { komponenTersedia, type Db } from "./layanan";

export async function buatTemplateKoreksi(db: Db): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const data = wb.addWorksheet("Koreksi");
  data.addRow(HEADER_KOREKSI).font = { bold: true };
  data.getColumn(1).numFmt = "@"; // teks: 18 digit tidak boleh berubah menjadi angka ilmiah
  data.getColumn(5).numFmt = "yyyy-mm-dd";
  data.getColumn(6).numFmt = "yyyy-mm-dd";
  HEADER_KOREKSI.forEach((_, i) => (data.getColumn(i + 1).width = i === 0 ? 22 : i === 9 ? 30 : 16));

  const komponen = (await komponenTersedia(db)).map((k) => `${k.kode} = ${k.nama}`).join("; ");
  const petunjuk = wb.addWorksheet("Petunjuk");
  petunjuk.getColumn(1).width = 28;
  petunjuk.getColumn(2).width = 110;
  [
    ["Petunjuk pengisian"],
    ["NIP", "Wajib. Format kolom Teks supaya 18 digit tidak berubah. NIP harus sudah ada di data pegawai."],
    ["Jenis", 'Kosong atau "periode" = berlaku untuk semua bulan yang SELURUHNYA masuk rentang tanggal. "angka" = pindahkan sejumlah hari pada SATU bulan (isi Bulan, Tahun, Jumlah Hari).'],
    ["Dari Komponen", `Wajib. Kode: ${komponen}`],
    ["Ke Komponen", 'Kode komponen tujuan. Kosongkan (atau tulis HAPUS) untuk "tidak dihitung" (pensiun/resign/meninggal).'],
    ["Tanggal Mulai", "Wajib untuk jenis periode. Format tanggal (yyyy-mm-dd atau dd-mm-yyyy)."],
    ["Tanggal Selesai", "Boleh kosong = tanpa batas akhir. Tidak boleh sebelum Tanggal Mulai."],
    ["Bulan / Tahun / Jumlah Hari", "Hanya untuk jenis angka. Bulan 1-12, Jumlah Hari 1-31."],
    ["Alasan", 'Wajib (maks 255 karakter), mis. "Tugas Belajar".'],
    ["Sumber", 'Opsional (maks 150 karakter), mis. "SK perpanjangan 2026".'],
    ["Catatan", "Setelah unggah, Anda melihat pratinjau per baris dan harus konfirmasi dulu sebelum apa pun disimpan. Baris yang sama persis dengan koreksi aktif dilewati sebagai duplikat."],
  ].forEach((b, i) => {
    const baris = petunjuk.addRow(b);
    baris.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (i === 0) baris.font = { bold: true };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
