const NAMA_JENIS: [string, string][] = [
  ["DSN", "Dosen"],
  ["TDK", "Tendik"],
];

/** Buang karakter terlarang di nama file dan rapikan spasi (sama dengan NamaFileUnduhan::bersihkan). */
function bersihkan(nama: string): string {
  return nama
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/[ \t\n\r\f\v]+/g, " ")
    .trim();
}

/**
 * Nama file unduhan (tanpa ekstensi) yang mengikuti tab + filter aktif, mis.
 * "Rekap Kehadiran Tahunan Dosen PNS-PPPK 2026". Bagian yang filternya kosong ("Semua")
 * dihilangkan. Kode status digabung "-" mengikuti urutan dropdown (urutan nama status).
 * Port dari App\Support\NamaFileUnduhan::buat (KDS2).
 */
export function buatNamaFile(
  tab: string,
  jenis: string[],
  status: string[],
  periode: string,
  urutanStatus: string[],
  keaktifan?: string | null
): string {
  const namaJenis = NAMA_JENIS.filter(([kode]) => jenis.includes(kode))
    .map(([, nama]) => nama)
    .join(" dan ");
  const kodeStatus = urutanStatus.filter((k) => status.includes(k)).join("-");
  const bagian = [tab, namaJenis, kodeStatus, keaktifan ?? "", periode].filter((b) => b !== "");
  return bersihkan(bagian.join(" "));
}
