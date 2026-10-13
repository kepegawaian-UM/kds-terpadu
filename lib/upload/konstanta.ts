/** Batas dan konstanta bersama untuk semua jenis upload (lihat docs/08-rancangan-upload-f4.md). */

/** Ukuran satu potongan dari browser. Batas body Vercel 4,5 MB; 3 MB menyisakan ruang untuk pembungkus form. */
export const UKURAN_POTONGAN = 3 * 1024 * 1024;
/** Batas keras satu potongan yang diterima server. */
export const MAKS_UKURAN_POTONGAN = 4 * 1024 * 1024;
/** Batas total berkas .xlsx (berkas mentah SIMPEGA 6,7 MB masih jauh di bawahnya). */
export const MAKS_UKURAN_BERKAS = 12 * 1024 * 1024;
export const MAKS_POTONGAN = Math.ceil(MAKS_UKURAN_BERKAS / UKURAN_POTONGAN) + 1;
/** Potongan yang lebih tua dari ini dianggap yatim (tab ditutup di tengah unggahan) dan dihapus. */
export const UMUR_POTONGAN_YATIM_JAM = 24;

/** Sama dengan PemeriksaFileExcel KDS2: berkas upload resmi 1-2 sheet; lebih = workbook kerja. */
export const MAKS_SHEET = 6;
/** Pegawai aktif ±2.000; lebih dari ini bukan data satu bulan. */
export const MAKS_BARIS = 15000;

export const POLA_UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kesalahan yang pesannya aman dan berguna ditampilkan langsung ke admin. */
export class KesalahanUpload extends Error {
  constructor(
    message: string,
    readonly bidang: "file" | "nama_sheet" = "file",
  ) {
    super(message);
    this.name = "KesalahanUpload";
  }
}
