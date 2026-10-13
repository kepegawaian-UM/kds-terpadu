/**
 * Aturan murni Koreksi Rekap (port dari KoreksiRekapService::cakupan, KDS2).
 * Koreksi jenis "periode" memindahkan komponen untuk SELURUH bulan yang tertutup rentangnya;
 * bulan yang hanya sebagian tertutup tidak diubah (dilaporkan "sebagian"), dan rentang di luar
 * bulan tidak berpengaruh.
 */
export type CakupanKoreksi = "penuh" | "sebagian" | "di_luar";

type Rentang = { tanggalMulai: Date; tanggalSelesai: Date | null };

/** Nomor hari (UTC) dari tanggal murni; menghindari perbandingan jam/zona waktu. */
const hari = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);

export function cakupanKoreksi(k: Rentang, bulan: number, tahun: number): CakupanKoreksi {
  const awalBulan = Math.floor(Date.UTC(tahun, bulan - 1, 1) / 86_400_000);
  const akhirBulan = Math.floor(Date.UTC(tahun, bulan, 0) / 86_400_000); // hari terakhir bulan itu
  const mulai = hari(k.tanggalMulai);
  const selesai = k.tanggalSelesai ? hari(k.tanggalSelesai) : null;

  if (mulai > akhirBulan || (selesai !== null && selesai < awalBulan)) return "di_luar";
  if (mulai <= awalBulan && (selesai === null || selesai >= akhirBulan)) return "penuh";
  return "sebagian";
}
