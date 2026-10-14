/**
 * Template Upload Nominatif Bulanan, dibangkitkan (bukan berkas tetap: berkas .xlsx sengaja tidak masuk repo).
 * Susunan kolom = KontrakNominatif KDS2 (dibaca menurut POSISI; header diperiksa: kolom bergeser = berkas ditolak).
 */
import ExcelJS from "exceljs";

export const HEADER_TEMPLATE_NOMINATIF = [
  "NIP", "Nama", "Jenis Kelamin", "Tanggal Lahir", "Pendidikan Terakhir", "Agama (tidak dipakai, kosongkan)", "Jenis Pegawai", "Status Kepegawaian", "Golongan",
  "Jabatan Fungsional/Fungsi Umum", "Kategori Akademisi Luar", "Unit Kerja", "Tanggal Mulai Kerja (TMT)", "Jabatan Tambahan 1", "Unit/Prodi 1",
  "Status Pengangkatan 1", "Jabatan Tambahan 2", "Unit/Prodi 2", "Status Pengangkatan 2", "Jabatan Tambahan 3", "Unit/Prodi 3", "Status Pengangkatan 3",
];

export async function buatTemplateNominatif(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const data = wb.addWorksheet("Nominatif Bulanan");
  data.addRow(HEADER_TEMPLATE_NOMINATIF).font = { bold: true };
  // baris contoh dengan NIP fiktif (jangan dipakai); nama master harus persis seperti di master data
  data.addRow(["199001012020011001", "Nama Dosen Contoh", "L", "1990-01-01", "S3", "", "Dosen", "PNS", "III/b", "Lektor", "", "Fakultas Ilmu Pendidikan", "2020-01-01", ...Array(9).fill("")]);
  data.addRow(["199205052021012002", "Nama Tendik Contoh", "P", "1992-05-05", "S1", "", "Tendik", "PNS", "III/a", "", "", "Fakultas Ilmu Pendidikan", "2021-01-01", ...Array(9).fill("")]);
  data.getColumn(1).numFmt = "@"; // teks: 18 digit tidak boleh berubah menjadi angka ilmiah
  HEADER_TEMPLATE_NOMINATIF.forEach((_, i) => (data.getColumn(i + 1).width = i === 0 ? 22 : i === 1 ? 28 : i === 11 ? 30 : 16));
  data.views = [{ state: "frozen", ySplit: 1 }];

  const petunjuk = wb.addWorksheet("Petunjuk Pengisian");
  petunjuk.getColumn(1).width = 30;
  petunjuk.getColumn(2).width = 100;
  [
    ["Petunjuk pengisian", ""],
    ["Susunan kolom", "Kolom dibaca menurut POSISI. Header baris 1 diperiksa; bila ada kolom yang bergeser atau header berubah, seluruh berkas ditolak. Blok Jabatan Tambahan 3 (kolom 20-22) opsional."],
    ["NIP", "Wajib, digit murni, format kolom Teks. Baris tanpa NIP digit murni (mis. catatan kaki) dilewati. NIP yang belum pernah ada otomatis menjadi pegawai baru."],
    ["Kolom master", "Jenis Pegawai, Status Kepegawaian, Golongan, Jabatan Fungsional, Kategori Akademisi Luar, Unit Kerja, dan Jabatan Tambahan dicocokkan menurut NAMA atau KODE (huruf besar/kecil dan koma diabaikan). Bila tidak cocok, barisnya dilewati dan dilaporkan."],
    ["Golongan", "Wajib untuk status kategori ASN. Non-ASN (PTNA/CPTNA) opsional dan disimpan bila kodenya valid; PTT dan Akademisi Luar dikosongkan."],
    ["Kategori Akademisi Luar", "Hanya diisi untuk Jenis Pegawai Akademisi Luar UM."],
    ["Tanggal", "Tanggal Lahir dan TMT: pakai yyyy-mm-dd (disarankan), dd-mm-yyyy, atau sel tanggal Excel. Format a/b/yyyy yang bisa berarti dua hal ditolak."],
    ["Jabatan Tambahan", "Maksimal 3 slot. Status Pengangkatan harus persis Definitif, Plt, atau Pjs. Slot yang bermasalah dilewati dan hanya menjadi peringatan."],
    ["Kolom Agama", "Kolom ke-6 hanya penanda posisi (kompatibel dengan format KDS2) dan TIDAK dibaca maupun disimpan: kosongkan. Aplikasi ini sengaja tidak menyimpan agama pegawai."],
    ["NIP ganda", "Bila satu NIP muncul lebih dari sekali, baris TERAKHIR yang valid dipakai."],
    ["Snapshot bulanan", "Berkas mencerminkan SELURUH pegawai aktif bulan itu: NIP yang tidak ada dianggap tidak aktif. Mengunggah ulang bulan yang sama mengganti datanya."],
  ].forEach((b, i) => {
    const baris = petunjuk.addRow(b);
    baris.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (i === 0) baris.font = { bold: true };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
