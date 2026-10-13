import { kunciKamus } from "./matching";

/**
 * NIP placeholder yang dibuat SIMPEGA SENDIRI saat ekspor, khusus utk Akademisi Luar UM yang
 * tidak punya NIP pemerintah asli - formatnya "<tahun><bulan>" (4+2 digit) diulang 2x di awal,
 * diikuti sisa digit, 18 digit total. TIDAK STABIL antar ekstraksi: orang yang sama bisa dapat
 * placeholder BERBEDA tiap kali data ditarik ulang dari SIMPEGA, walau bulan laporannya sama.
 * Dikonfirmasi dari data riil: 273 baris lintas 6 bulan (Okt 2025-Sep 2026), 100% kategori AKL,
 * 0% di luar AKL - jadi aman dideteksi general (tidak perlu syarat tambahan jenis pegawai).
 */
export function isNipPlaceholderTidakStabil(nip: string, bulan: number, tahun: number): boolean {
  const prefix = `${tahun}${String(bulan).padStart(2, "0")}`;
  return nip.length === 18 && nip.startsWith(prefix + prefix);
}

export const JENIS_FIELD_IDENTITAS_EKSTERNAL = "IdentitasEksternalTidakStabil";

/**
 * Normalisasi KHUSUS identitas - lebih keras dari `normalize()` umum di matching.ts (yang cuma
 * rapikan spasi+lowercase). Di sini semua tanda baca & spasi dibuang total, supaya variasi kecil
 * penulisan gelar antar ekstraksi ("Dr." vs "Dr", koma hilang, dst - terbukti terjadi di data
 * riil) tetap dianggap nama yang sama. Risikonya (2 orang beda dgn nama identik persis setelah
 * dibersihkan) diterima - utk nama akademisi internasional yang panjang, tabrakan seperti itu
 * sangat jarang, jauh lebih jarang drpd masalah yang mau diselesaikan (identitas terus "lahir
 * ulang" tiap bulan).
 */
export function normalisasiNamaIdentitas(nama: string): string {
  return nama.toLowerCase().replace(/[^a-z]/g, "");
}

export function kunciIdentitasEksternal(nama: string): string {
  return kunciKamus(normalisasiNamaIdentitas(nama));
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.substring(i, i + 2);
    m.set(bg, (m.get(bg) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient (bigram) - CUMA dipakai utk MENYARANKAN kandidat ke admin di halaman review,
 * tidak pernah utk auto-memutuskan identitas (konsisten dgn prinsip "no-fuzzy-auto-match" di
 * matching.ts - keputusan akhir selalu manusia). */
function diceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const mapA = bigrams(a);
  const mapB = bigrams(b);
  let intersection = 0;
  for (const [bg, count] of mapA) {
    const inB = mapB.get(bg);
    if (inB) intersection += Math.min(count, inB);
  }
  const totalA = [...mapA.values()].reduce((s, c) => s + c, 0);
  const totalB = [...mapB.values()].reduce((s, c) => s + c, 0);
  if (totalA + totalB === 0) return 0;
  return (2 * intersection) / (totalA + totalB);
}

export type KandidatIdentitas = { nip: string; nama: string; skor: number };

export function cariKandidatIdentitasMirip(
  namaMentah: string,
  daftar: { nip: string; nama: string }[],
  maksimal = 3
): KandidatIdentitas[] {
  const target = normalisasiNamaIdentitas(namaMentah);
  return daftar
    .map((d) => ({ nip: d.nip, nama: d.nama, skor: diceCoefficient(target, normalisasiNamaIdentitas(d.nama)) }))
    .filter((d) => d.skor >= 0.4)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, maksimal);
}
