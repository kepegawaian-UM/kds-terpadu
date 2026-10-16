/** Dashboard Kinerja dipisah per jenis (data SINTETIS di kds_test): Dosen + Tendik = Semua, dan tiap jenis hanya menghitung pegawainya sendiri. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { dataDashboard } from "@/lib/laporan/dashboard";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();

describe.skipIf(!ada)("Dashboard Kinerja per jenis", () => {
  beforeAll(async () => {
    await kosongkanDomain(prisma);
    const nom = (nip: string, jenis: string) => ({ nip, bulan: 12, tahun: 2026, jenis, tmt: "2015-01-01" });
    const rek = (nip: string, bulan: number, TK: string, I = "0") => ({ nip, bulan, tahun: 2026, komponen: { TK, I, SIGMA_HARI: "20", JUMLAH_MASUK_NYATA: "18" } });
    await muatKeadaan(prisma, {
      nominatif: [nom("900000000000000001", "DSN"), nom("900000000000000002", "DSN"), nom("900000000000000003", "TDK")],
      rekap: [rek("900000000000000001", 1, "2"), rek("900000000000000002", 2, "3", "1"), rek("900000000000000003", 1, "5", "4"), rek("900000000000000003", 3, "1")],
    });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  const kpi = (k: { kpi: { label: string; value: unknown }[] }, label: string) => k.kpi.find((x) => x.label === label)!.value;

  it("tiap jenis hanya menghitung pegawainya; Dosen + Tendik = Semua", async () => {
    const d = await dataDashboard(prisma, { tahun_kinerja: "2026" });
    const { DSN, TDK } = d.kinerjaPerJenis;
    expect(kpi(DSN, "Pegawai tercover absensi")).toBe(2);
    expect(kpi(TDK, "Pegawai tercover absensi")).toBe(1);
    expect(kpi(d.dashboardKinerja, "Pegawai tercover absensi")).toBe(3);
    expect(kpi(DSN, "Total TK setahun")).toBe(5); // 2 + 3
    expect(kpi(TDK, "Total TK setahun")).toBe(6); // 5 + 1
    expect(Number(kpi(DSN, "Total TK setahun")) + Number(kpi(TDK, "Total TK setahun"))).toBe(Number(kpi(d.dashboardKinerja, "Total TK setahun")));
    const izin = (k: typeof DSN) => Object.fromEntries(k.chartKategoriIzin.labels.map((l, i) => [l, k.chartKategoriIzin.data[i]]));
    expect(Object.values(izin(TDK)).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(DSN.chartTren.series.find((s) => s.kode === "TK")!.data.slice(0, 3)).toEqual([2, 3, 0]);
    expect(TDK.chartTren.series.find((s) => s.kode === "TK")!.data.slice(0, 3)).toEqual([5, 0, 1]);
  });
});
