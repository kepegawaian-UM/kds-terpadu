/**
 * Status Sistem: pantauan ringan agar batas paket gratis tidak terlewat tanpa disadari. Hanya membaca. Ukuran database dibandingkan dengan batas Neon Free
 * (512 MB; peringatan di 400 MB, sama dengan docs/07 §8), ditambah perkiraan sisa bulan dari rata-rata pertumbuhan per bulan data.
 */
import type { PrismaClient } from "@prisma/client";

export const BATAS_MB = 512;
export const PERINGATAN_MB = 400;
export const BAHAYA_MB = 480;

export type TingkatPeringatan = "aman" | "peringatan" | "bahaya";

export function tingkatPeringatan(mb: number): TingkatPeringatan {
  return mb >= BAHAYA_MB ? "bahaya" : mb >= PERINGATAN_MB ? "peringatan" : "aman";
}

/** Sisa bulan sebelum penuh bila pertumbuhan rata-rata per bulan tetap; null bila belum bisa diperkirakan. */
export function perkiraanSisaBulan(ukuranMb: number, pertumbuhanMbPerBulan: number): number | null {
  if (!(pertumbuhanMbPerBulan > 0)) return null;
  return Math.max(0, Math.floor((BATAS_MB - ukuranMb) / pertumbuhanMbPerBulan));
}

type Db = Pick<PrismaClient, "$queryRawUnsafe" | "nominatifBulanan" | "rekapKehadiranBulanan" | "uploadBatch">;

export type DataStatusSistem = {
  ukuranMb: number;
  persen: number;
  tingkat: TingkatPeringatan;
  pertumbuhanMbPerBulan: number | null;
  sisaBulan: number | null;
  tabelTerbesar: { nama: string; mb: number }[];
  perBulan: { bulan: number; tahun: number; nominatif: number; absensi: number; terakhirDiunggah: Date | null }[];
};

export async function dataStatusSistem(db: Db): Promise<DataStatusSistem> {
  const [u] = await db.$queryRawUnsafe<{ ukuran: bigint }[]>("SELECT pg_database_size(current_database()) AS ukuran");
  const ukuranMb = Number(u.ukuran) / 1048576;

  const tabel = await db.$queryRawUnsafe<{ nama: string; ukuran: bigint }[]>(
    "SELECT relname AS nama, pg_total_relation_size(relid) AS ukuran FROM pg_catalog.pg_statio_user_tables ORDER BY 2 DESC LIMIT 6",
  );
  const semuaTabel = await db.$queryRawUnsafe<{ nama: string; ukuran: bigint }[]>(
    "SELECT relname AS nama, pg_total_relation_size(relid) AS ukuran FROM pg_catalog.pg_statio_user_tables",
  );

  const nominatif = await db.nominatifBulanan.groupBy({ by: ["tahun", "bulan"], _count: { _all: true } });
  const absensi = await db.rekapKehadiranBulanan.groupBy({ by: ["tahun", "bulan"], _count: { _all: true } });
  const batch = await db.uploadBatch.groupBy({
    by: ["tahun", "bulan"],
    where: { bulan: { not: null }, tahun: { not: null }, status: { not: "Dibatalkan" } },
    _max: { diunggahPada: true },
  });
  const kunci = (t: number, b: number) => `${t}-${b}`;
  const nAbs = new Map(absensi.map((x) => [kunci(x.tahun, x.bulan), x._count._all]));
  const nUnggah = new Map(batch.map((x) => [kunci(x.tahun as number, x.bulan as number), x._max.diunggahPada]));
  const perBulan = nominatif
    .map((x) => ({
      bulan: x.bulan,
      tahun: x.tahun,
      nominatif: x._count._all,
      absensi: nAbs.get(kunci(x.tahun, x.bulan)) ?? 0,
      terakhirDiunggah: nUnggah.get(kunci(x.tahun, x.bulan)) ?? null,
    }))
    .sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan);

  // pertumbuhan: ukuran tabel data (nominatif + absensi + jejak) dibagi jumlah bulan yang punya data
  const besarData = semuaTabel.filter((t) => /nominatif|rekap_kehadiran|upload_error|audit/.test(t.nama)).reduce((a, t) => a + Number(t.ukuran), 0) / 1048576;
  const pertumbuhan = perBulan.length > 0 && besarData > 0 ? besarData / perBulan.length : null;

  return {
    ukuranMb,
    persen: (ukuranMb / BATAS_MB) * 100,
    tingkat: tingkatPeringatan(ukuranMb),
    pertumbuhanMbPerBulan: pertumbuhan,
    sisaBulan: pertumbuhan === null ? null : perkiraanSisaBulan(ukuranMb, pertumbuhan),
    tabelTerbesar: tabel.map((t) => ({ nama: t.nama, mb: Number(t.ukuran) / 1048576 })),
    perBulan,
  };
}
