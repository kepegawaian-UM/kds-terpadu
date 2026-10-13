import type { PrismaClient } from "@prisma/client";

/** Nilai parameter URL: string, daftar string (?a[]=1), atau tidak ada. */
export type Param = string | string[] | undefined | null;

/** Indeks 1-12 = nama bulan (indeks 0 tidak dipakai), sama dengan config/rekap_kehadiran.php. */
export const NAMA_BULAN = [
  "",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export function namaBulan(bulan: number): string {
  return NAMA_BULAN[bulan] || String(bulan);
}

/** Meniru `(int) $nilai` di PHP: awalan angka dipakai, selain itu 0; array = 1 bila tak kosong. */
export function keInt(nilai: Param): number {
  if (Array.isArray(nilai)) return nilai.length > 0 ? 1 : 0;
  if (nilai === undefined || nilai === null) return 0;
  const n = Number.parseInt(String(nilai).trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Meniru `$request->filled()` Laravel: ada, bukan string kosong/spasi, bukan daftar kosong. */
export function parameterTerisi(nilai: Param): boolean {
  if (nilai === undefined || nilai === null) return false;
  if (Array.isArray(nilai)) return nilai.length > 0;
  return String(nilai).trim() !== "";
}

/** Bulan dan tahun sekarang menurut zona waktu WIB (Asia/Jakarta). */
export function bulanTahunSekarang(sekarang: Date = new Date()): [number, number] {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "numeric" });
  const bagian = Object.fromEntries(f.formatToParts(sekarang).map((p) => [p.type, p.value]));
  return [Number(bagian.month), Number(bagian.year)];
}

/**
 * Periode laporan: parameter bulan+tahun bila keduanya terisi; kalau tidak, snapshot nominatif
 * TERBARU; kalau belum ada snapshot sama sekali, bulan/tahun sekarang (WIB). Sama dengan
 * `resolveBulanTahun` di controller KDS2 (Nominatif, Belum Upload, Statistik).
 */
export async function resolveBulanTahun(
  db: Pick<PrismaClient, "nominatifBulanan">,
  params: { bulan?: Param; tahun?: Param },
  sekarang: Date = new Date()
): Promise<[number, number]> {
  if (parameterTerisi(params.bulan) && parameterTerisi(params.tahun)) {
    return [keInt(params.bulan), keInt(params.tahun)];
  }
  const terbaru = await db.nominatifBulanan.findFirst({
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
    select: { bulan: true, tahun: true },
  });
  if (terbaru) return [terbaru.bulan, terbaru.tahun];
  return bulanTahunSekarang(sekarang);
}
