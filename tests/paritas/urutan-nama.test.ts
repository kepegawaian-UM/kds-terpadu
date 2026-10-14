/**
 * Paritas urutan nama: urutan daftar dari pembanding aplikasi harus identik dengan urutan
 * `ORDER BY nama` MySQL KDS2 (lewat oracle) untuk setiap snapshot nominatif. Tes ini tidak
 * mencetak nama pegawai.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { urutkanMenurutNama } from "@/lib/laporan/urutNama";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.KDS2_SALINAN_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

describe.skipIf(!jalan)("paritas urutan nama (data asli, lokal)", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("setiap bulan snapshot: urutan id identik dengan KDS2", async () => {
    const periode = await prisma.$queryRawUnsafe<{ bulan: number; tahun: number }[]>(
      `SELECT DISTINCT "bulan", "tahun" FROM "nominatif_bulanan" ORDER BY "tahun", "bulan"`
    );
    expect(periode.length).toBeGreaterThan(0);
    const h = await tanyaOracle(
      periode.map((p) => ({ id: `${p.tahun}-${p.bulan}`, laporan: "nominatif.index", params: { bulan: p.bulan, tahun: p.tahun } }))
    );
    for (const p of periode) {
      const oracle = hasil<{ baris: { id: number }[] }>(h, `${p.tahun}-${p.bulan}`).baris.map((r) => r.id);
      const rows = await prisma.$queryRawUnsafe<{ id: number; nama: string }[]>(
        `SELECT "id", "nama" FROM "nominatif_bulanan" WHERE "bulan" = ${p.bulan} AND "tahun" = ${p.tahun}`
      );
      const mine = urutkanMenurutNama(rows).map((r) => r.id);
      expect(mine.length, `jumlah baris ${p.tahun}-${p.bulan}`).toBe(oracle.length);
      const posisiBeda = oracle.reduce((n, id, i) => n + (id !== mine[i] ? 1 : 0), 0);
      expect(posisiBeda, `posisi berbeda pada ${p.tahun}-${p.bulan}`).toBe(0);
    }
  }, 300_000);
});

describe.skipIf(jalan)("paritas urutan nama (dilewati)", () => {
  it("KDS2_SALINAN_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas urutan nama dilewati: KDS2_SALINAN_DATABASE_URL/oracle tidak tersedia.");
  });
});
