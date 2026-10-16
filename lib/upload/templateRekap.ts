/**
 * Template Upload Rekap Kehadiran Bulanan, dibangkitkan (bukan berkas tetap: berkas .xlsx sengaja tidak masuk repo).
 * Susunan kolom = config/rekap_kehadiran.php KDS2: sistem membaca berdasarkan POSISI kolom, bukan teks header.
 */
import ExcelJS from "exceljs";

import { CONFIG_REKAP } from "@/lib/impor/konfigRekap";

export const HEADER_TEMPLATE_REKAP = [
  "NO", "NAMA", "UNIT", "GOLONGAN", "BULAN", "Σ HARI", "I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN",
  "TOTAL", "JUMLAH MASUK NYATA", "JENIS SHIFT", "NIP", "CUTI ANAK KE",
];

export async function buatTemplateRekap(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const data = wb.addWorksheet("Data");
  data.addRow(HEADER_TEMPLATE_REKAP).font = { bold: true };
  // contoh baris: NIP fiktif (jangan dipakai); TOTAL = Σ HARI dikurangi jumlah ketidakhadiran dan cuti
  data.addRow([1, "Nama Pegawai Contoh", "Unit Contoh", "III/a", "Januari", 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 22, 22, "-", "199001012020011001", "-"]);
  data.getColumn(CONFIG_REKAP.kolomNip).numFmt = "@"; // teks: 18 digit tidak boleh berubah menjadi angka ilmiah
  HEADER_TEMPLATE_REKAP.forEach((_, i) => (data.getColumn(i + 1).width = i === 1 ? 28 : i === 2 ? 22 : i === 20 ? 22 : 10));
  data.views = [{ state: "frozen", ySplit: 1 }];

  const komponen = CONFIG_REKAP.kolomKomponen.map(([posisi, kode]) => `${kode} (kolom ${posisi})`).join(", ");
  const petunjuk = wb.addWorksheet("Petunjuk Pengisian");
  petunjuk.getColumn(1).width = 28;
  petunjuk.getColumn(2).width = 100;
  [
    ["Petunjuk pengisian", ""],
    ["Susunan kolom", `Sistem membaca kolom menurut POSISI, bukan teks judul; jangan menggeser atau menyisipkan kolom. Komponen yang dibaca: ${komponen}.`],
    ["NIP (kolom 21)", "Wajib, 18 digit, format kolom Teks. Baris tanpa NIP berisi digit murni dilewati. NIP yang tidak ada di Nominatif dilaporkan sebagai gagal."],
    ["BULAN (kolom 5)", "Nama bulan (Januari..Desember). Bila tidak cocok dengan bulan yang dipilih saat upload, hanya menjadi peringatan."],
    ["Bulan sebelum TMT", "Baris ditolak bila bulan absensi lebih awal dari TMT pegawai; bulan TMT sendiri diterima."],
    ["Akademisi Luar UM", "Tidak masuk Absensi; barisnya ditolak."],
    ["TOTAL dan JUMLAH MASUK NYATA", "Seharusnya sama; bila berbeda hanya menjadi peringatan."],
    ["NIP ganda", "Bila satu NIP muncul lebih dari sekali, baris TERAKHIR yang dipakai."],
    ["Unggah ulang", "Mengunggah ulang bulan yang sama mengganti absensi bulan itu. Koreksi Absensi yang aktif diterapkan ulang otomatis."],
  ].forEach((b, i) => {
    const baris = petunjuk.addRow(b);
    baris.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (i === 0) baris.font = { bold: true };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
