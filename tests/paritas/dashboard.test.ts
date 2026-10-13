/**
 * Paritas Dashboard (data asli, lokal) terhadap DashboardController KDS2 lewat oracle: kartu jumlah
 * pegawai, status upload bulan berjalan, tiga dashboard pegawai (KPI + empat grafik per jenis) untuk semua
 * bulan, dan Dashboard Kinerja (KPI + tiga grafik). Tes tidak mencetak isi data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { dataDashboard } from "@/lib/laporan/dashboard";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.PARITAS_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

type Oracle = Awaited<ReturnType<typeof dataDashboard>>;
const JENIS = ["DSN", "TDK", "AKL"] as const;

describe.skipIf(!jalan)("paritas Dashboard KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  let periode: { bulan: number; tahun: number }[];

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    periode = await db.$queryRawUnsafe(`SELECT DISTINCT "bulan", "tahun" FROM "nominatif_bulanan" ORDER BY "tahun", "bulan"`);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("bawaan tanpa parameter: kartu, status upload bulan berjalan, dashboard pegawai dan kinerja identik", async () => {
    const h = await tanyaOracle([{ id: "d", laporan: "dashboard", params: {} }]);
    const o = hasil<Oracle>(h, "d");
    const s = await dataDashboard(db, {});
    expect(s.jumlahPerJenis).toEqual(o.jumlahPerJenis);
    expect({ b: s.bulanTerbaru, t: s.tahunTerbaru }).toEqual({ b: o.bulanTerbaru, t: o.tahunTerbaru });
    expect({
      n: s.nominatifSudahUpload, nw: s.nominatifTerakhirDiupload, r: s.rekapSudahUpload, rw: s.rekapTerakhirDiupload,
    }).toEqual({ n: o.nominatifSudahUpload, nw: o.nominatifTerakhirDiupload, r: o.rekapSudahUpload, rw: o.rekapTerakhirDiupload });
    expect({ b: s.bulanPegawai, t: s.tahunPegawai, k: s.tahunKinerja }).toEqual({ b: o.bulanPegawai, t: o.tahunPegawai, k: o.tahunKinerja });
    for (const j of JENIS) expect(s.dashboardPegawai![j], `pegawai ${j}`).toEqual(o.dashboardPegawai![j]);
    expect(s.dashboardKinerja).toEqual(o.dashboardKinerja);
  }, 120_000);

  it("dashboard pegawai untuk SEMUA bulan snapshot: KPI dan empat grafik per jenis identik", async () => {
    const h = await tanyaOracle(periode.map((p) => ({ id: `m${p.bulan}`, laporan: "dashboard", params: { bulan_pegawai: p.bulan, tahun_pegawai: p.tahun } })));
    for (const p of periode) {
      const o = hasil<Oracle>(h, `m${p.bulan}`);
      const s = await dataDashboard(db, { bulan_pegawai: String(p.bulan), tahun_pegawai: String(p.tahun) });
      for (const j of JENIS) {
        const a = s.dashboardPegawai![j];
        const b = o.dashboardPegawai![j];
        expect(a.kpi, `KPI ${j} ${p.bulan}`).toEqual(b.kpi);
        expect(a.total, `total ${j} ${p.bulan}`).toEqual(b.total);
        expect(a.chartDistribusiUtama, `grafik utama ${j} ${p.bulan}`).toEqual(b.chartDistribusiUtama);
        expect(a.chartSebaranUnit, `sebaran unit ${j} ${p.bulan}`).toEqual(b.chartSebaranUnit);
        expect(a.chartGolongan, `golongan ${j} ${p.bulan}`).toEqual(b.chartGolongan);
        expect(a.chartPendidikan, `pendidikan ${j} ${p.bulan}`).toEqual(b.chartPendidikan);
      }
    }
  }, 300_000);

  it("dashboard kinerja: tahun 2026, tahun tanpa data (2025), dan nilai ngawur identik", async () => {
    const tahunList = [2026, 2025, 2027];
    const h = await tanyaOracle(tahunList.map((t) => ({ id: `k${t}`, laporan: "dashboard", params: { tahun_kinerja: t } })));
    for (const t of tahunList) {
      const o = hasil<Oracle>(h, `k${t}`);
      const s = await dataDashboard(db, { tahun_kinerja: String(t) });
      expect(s.tahunKinerja).toBe(o.tahunKinerja);
      expect(s.dashboardKinerja.kpi, `KPI kinerja ${t}`).toEqual(o.dashboardKinerja.kpi);
      expect(s.dashboardKinerja.chartKategoriIzin, `kategori izin ${t}`).toEqual(o.dashboardKinerja.chartKategoriIzin);
      expect(s.dashboardKinerja.chartUnitTk, `unit TK ${t}`).toEqual(o.dashboardKinerja.chartUnitTk);
      expect(s.dashboardKinerja.chartTren, `tren ${t}`).toEqual(o.dashboardKinerja.chartTren);
    }
    const kinerja2026 = hasil<Oracle>(h, "k2026").dashboardKinerja;
    expect(Number(kinerja2026.kpi[2].value)).toBeGreaterThan(0); // total TK setahun: data nyata tidak kosong
  }, 300_000);
});

describe.skipIf(jalan)("paritas Dashboard (dilewati)", () => {
  it("PARITAS_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas Dashboard dilewati: PARITAS_DATABASE_URL/oracle tidak tersedia.");
  });
});
