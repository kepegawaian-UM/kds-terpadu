import type { PrismaClient } from "@prisma/client";

/**
 * Menjalankan kueri mentah dengan rencana "custom" PostgreSQL: `SET LOCAL plan_cache_mode = force_custom_plan`
 * di dalam transaksi (hanya berlaku untuk transaksi itu; aman dengan pooler transaksi).
 *
 * Alasan (ditemukan di F3.7): Prisma memakai prepared statement bernama dan PostgreSQL beralih ke rencana
 * GENERIK setelah ±5 eksekusi statement yang sama. Untuk kueri SUM laporan (join detail rekap + `nip = ANY($n)`),
 * rencana generik ±3x lebih lambat (Rekap Tahunan 600 -> 1.600 ms, Dashboard 930 -> 2.600 ms) karena tidak
 * melihat bahwa filter tahun memilih hampir seluruh tabel. Pakai pembantu ini untuk kueri agregat berat yang
 * parameternya sangat menentukan rencana.
 */
export async function kueriRencanaKustom<T = unknown>(
  db: Pick<PrismaClient, "$transaction">,
  sql: string,
  ...params: unknown[]
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL plan_cache_mode = force_custom_plan");
    return tx.$queryRawUnsafe<T>(sql, ...params);
  });
}
