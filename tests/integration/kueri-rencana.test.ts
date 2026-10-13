/**
 * kueriRencanaKustom: kueri mentah dijalankan dengan rencana "custom" (parameter sebenarnya) di dalam transaksi,
 * dan pengaturan TIDAK bocor ke koneksi lain (SET LOCAL). Alasan: rencana generik PostgreSQL (setelah ±5 eksekusi
 * prepared statement yang sama) membuat kueri SUM laporan ±3x lebih lambat - lihat docs/05-f3-laporan.md.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { kueriRencanaKustom } from "@/lib/laporan/kueri";

const ada = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!ada)("kueriRencanaKustom", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = new PrismaClient();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("menjalankan kueri dengan plan_cache_mode = force_custom_plan di dalam transaksi", async () => {
    const r = await kueriRencanaKustom<{ plan_cache_mode: string }[]>(prisma, "SHOW plan_cache_mode");
    expect(r[0].plan_cache_mode).toBe("force_custom_plan");
  });

  it("pengaturan tidak bocor: kueri biasa sesudahnya tetap memakai bawaan (auto)", async () => {
    await kueriRencanaKustom(prisma, "SELECT 1");
    for (let i = 0; i < 5; i++) {
      const r = await prisma.$queryRawUnsafe<{ plan_cache_mode: string }[]>("SHOW plan_cache_mode");
      expect(r[0].plan_cache_mode).toBe("auto");
    }
  });

  it("meneruskan parameter dan mengembalikan hasil; galat SQL diteruskan (transaksi dibatalkan)", async () => {
    const r = await kueriRencanaKustom<{ n: number }[]>(prisma, "SELECT $1::int + $2::int AS n", 2, 3);
    expect(r[0].n).toBe(5);
    await expect(kueriRencanaKustom(prisma, "SELECT * FROM tabel_yang_tidak_ada")).rejects.toThrow();
    // koneksi tetap sehat sesudah galat
    expect((await kueriRencanaKustom<{ n: number }[]>(prisma, "SELECT 1 AS n"))[0].n).toBe(1);
  });
});
