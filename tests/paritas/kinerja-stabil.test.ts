/**
 * Regresi kinerja (data asli, lokal): waktu hitung laporan berat TIDAK boleh melonjak setelah dipanggil berkali-kali.
 * Penyebab yang pernah terjadi (F3.7): PostgreSQL beralih ke rencana generik pada prepared statement yang sama
 * setelah ±5 eksekusi dan kueri SUM menjadi ±3x lebih lambat (Rekap Tahunan 600 -> 1.600 ms, Dashboard
 * 930 -> 2.600 ms). Tes memakai rasio yang longgar (median eksekusi akhir < 2x median awal) agar tidak rapuh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { dataDashboard } from "@/lib/laporan/dashboard";
import { laporanRekapTahunan } from "@/lib/laporan/rekapTahunan";

const url = process.env.PARITAS_DATABASE_URL;

async function ukurBerulang(f: () => Promise<unknown>, kali = 14): Promise<{ awal: number; akhir: number; semua: number[] }> {
  const w: number[] = [];
  for (let i = 0; i < kali; i++) {
    const t0 = performance.now();
    await f();
    w.push(Math.round(performance.now() - t0));
  }
  // baseline = eksekusi tercepat dari lima awal; pembanding = eksekusi TERLAMBAT dari ke-7 dst (lonjakan
  // rencana generik bisa hanya mengenai sebagian eksekusi, jadi median akan menyamarkannya)
  return { awal: Math.min(...w.slice(0, 5)), akhir: Math.max(...w.slice(6)), semua: w };
}

describe.skipIf(!url)("kinerja stabil setelah banyak pemanggilan", () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("Rekap Tahunan 2026: eksekusi ke-10+ tidak lebih lambat dari 2x eksekusi awal", async () => {
    const r = await ukurBerulang(() => laporanRekapTahunan(db, 2026, { jenis: [], status: [], keaktifan: "aktif" }));
    console.info(`[ukur] Rekap Tahunan berulang (ms): ${r.semua.join(" ")}`);
    expect(r.akhir, `awal ${r.awal} ms, akhir ${r.akhir} ms`).toBeLessThan(r.awal * 2);
  }, 300_000);

  it("Dashboard: eksekusi ke-10+ tidak lebih lambat dari 2x eksekusi awal", async () => {
    const r = await ukurBerulang(() => dataDashboard(db, {}), 16);
    console.info(`[ukur] Dashboard berulang (ms): ${r.semua.join(" ")}`);
    expect(r.akhir, `awal ${r.awal} ms, akhir ${r.akhir} ms`).toBeLessThan(r.awal * 2);
  }, 300_000);
});
