/**
 * Paritas Statistik Dosen dan Tendik (data asli, lokal) terhadap StatistikDosenController dan
 * StatistikTendikController KDS2 lewat oracle: setiap sel, kolom dinamis jabatan x golongan, urutan
 * fakultas/jurusan, subtotal, dan total, untuk semua bulan snapshot. Tidak mencetak isi data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { statistikDosen, statistikTendik } from "@/lib/laporan/statistik";
import { resolveBulanTahun } from "@/lib/laporan/periode";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.PARITAS_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

type Baris = Record<string, string | number>;

describe.skipIf(!jalan)("paritas Statistik KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  let periode: { bulan: number; tahun: number }[];

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    periode = await db.$queryRawUnsafe(`SELECT DISTINCT "bulan", "tahun" FROM "nominatif_bulanan" ORDER BY "tahun", "bulan"`);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("Statistik Tendik: setiap baris unit dan total identik untuk semua bulan", async () => {
    const h = await tanyaOracle(periode.map((p) => ({ id: `t${p.bulan}`, laporan: "statistik.tendik", params: { bulan: p.bulan, tahun: p.tahun } })));
    let totalTendik = 0;
    for (const p of periode) {
      const o = hasil<{ bulan: number; tahun: number; statistik: Baris[]; total: Baris }>(h, `t${p.bulan}`);
      const s = await statistikTendik(db, p.bulan, p.tahun);
      expect(s.statistik.map((x) => x.unit), `urutan unit ${p.bulan}`).toEqual(o.statistik.map((x) => x.unit));
      expect(s.statistik, `statistik ${p.bulan}`).toEqual(o.statistik);
      expect(s.total, `total ${p.bulan}`).toEqual(o.total);
      totalTendik += Number(o.total.jumlah ?? 0);
    }
    expect(totalTendik).toBeGreaterThan(5000);
  }, 300_000);

  it("Statistik Dosen: kolom jabatan x golongan, fakultas/jurusan, subtotal, dan total identik untuk semua bulan", async () => {
    const h = await tanyaOracle(periode.map((p) => ({ id: `d${p.bulan}`, laporan: "statistik.dosen", params: { bulan: p.bulan, tahun: p.tahun } })));
    let totalDosen = 0;
    for (const p of periode) {
      const o = hasil<{ laporan: { subtotal: Baris; jurusan: Baris[] }[]; total: Baris; kolom: { jabatan: string; golongan: string | null }[]; jabatanGroups: Record<string, number> }>(h, `d${p.bulan}`);
      const s = await statistikDosen(db, p.bulan, p.tahun);
      expect(s.kolom, `kolom jabatan x golongan ${p.bulan}`).toEqual(o.kolom);
      expect(Object.entries(s.jabatanGroups), `jabatan (urutan dan jumlah kolom) ${p.bulan}`).toEqual(Object.entries(o.jabatanGroups));
      expect(s.laporan.map((f) => f.subtotal.unit), `urutan fakultas ${p.bulan}`).toEqual(o.laporan.map((f) => f.subtotal.unit));
      expect(s.laporan, `laporan ${p.bulan}`).toEqual(o.laporan);
      expect(s.total, `total ${p.bulan}`).toEqual(o.total);
      totalDosen += Number(o.total.jumlah ?? 0);
    }
    expect(totalDosen).toBeGreaterThan(3000);
  }, 300_000);

  it("periode bawaan = snapshot terbaru, sama dengan KDS2", async () => {
    const h = await tanyaOracle([
      { id: "t", laporan: "statistik.tendik", params: {} },
      { id: "d", laporan: "statistik.dosen", params: {} },
    ]);
    const t = hasil<{ bulan: number; tahun: number }>(h, "t");
    const d = hasil<{ bulan: number; tahun: number }>(h, "d");
    expect(await resolveBulanTahun(db, {})).toEqual([t.bulan, t.tahun]);
    expect([d.bulan, d.tahun]).toEqual([t.bulan, t.tahun]);
  }, 120_000);
});

describe.skipIf(jalan)("paritas Statistik (dilewati)", () => {
  it("PARITAS_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas Statistik dilewati: PARITAS_DATABASE_URL/oracle tidak tersedia.");
  });
});
