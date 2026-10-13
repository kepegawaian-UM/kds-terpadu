/**
 * Paritas Rekap Kehadiran Tahunan (data asli, lokal) terhadap RekapKehadiranReportController::tahunan
 * dan RekapKehadiranTahunanExport KDS2 lewat oracle: baris (snapshot terakhir per NIP lewat MAX(id)),
 * urutan TK setahun + seri, total tiap komponen, lencana, nama file, dan ekspor Excel. Tes ini juga
 * mengukur waktu hitung (SUM atas ratusan ribu baris detail). Tidak mencetak isi baris.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import type { Keaktifan } from "@/lib/laporan/filter";
import { eksporRekapTahunan, laporanRekapTahunan, periodeTahunBerjalan } from "@/lib/laporan/rekapTahunan";

import {
  bandingkanEkspor,
  bandingkanRekapTahunan,
  type FilterUji as Filter,
  type OracleTahunan as Oracle,
} from "../support/bandingkanRekap";
import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.PARITAS_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());


describe.skipIf(!jalan)("paritas Rekap Kehadiran Tahunan KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const bandingkan = (id: string, o: Oracle, filter: Filter, tahun: number) => bandingkanRekapTahunan(db, id, o, filter, tahun);

  it("tahun 2026 dengan filter bawaan: baris, urutan, total semua komponen, lencana, nama file", async () => {
    const h = await tanyaOracle([{ id: "t", laporan: "rekap.tahunan", params: { tahun: 2026 } }]);
    const o = hasil<Oracle>(h, "t");
    const t0 = Date.now();
    await bandingkan("t2026", o, { jenis: [], status: [], keaktifan: "aktif" }, 2026);
    const ms = Date.now() - t0;
    console.info(`[ukur] Rekap Tahunan 2026 (${o.baris.length} baris) dihitung + dibandingkan dalam ${ms} ms`);
    expect(o.baris.length).toBeGreaterThan(2000);
    expect(o.baris.some((b) => b.sel.some((v) => v !== "0" && v !== "-"))).toBe(true); // ada total nyata
  }, 300_000);

  it("keaktifan non-aktif dan semua, serta kombinasi Jenis x Status", async () => {
    const kasus: { id: string; filter: Filter }[] = [
      { id: "nonaktif", filter: { jenis: [], status: [], keaktifan: "nonaktif" } },
      { id: "semua", filter: { jenis: [], status: [], keaktifan: "semua" } },
      { id: "dsn", filter: { jenis: ["DSN"], status: [], keaktifan: "aktif" } },
      { id: "tdk-pns", filter: { jenis: ["TDK"], status: ["PNS"], keaktifan: "semua" } },
      { id: "dsn-tdk-pppk-ptt", filter: { jenis: ["DSN", "TDK"], status: ["PPPK", "PTT"], keaktifan: "aktif" } },
      { id: "status-saja", filter: { jenis: [], status: ["PTNA", "CPNS"], keaktifan: "semua" } },
    ];
    const h = await tanyaOracle(kasus.map((k) => ({ id: k.id, laporan: "rekap.tahunan", params: { tahun: 2026, ...k.filter } })));
    let adaBelum = 0;
    for (const k of kasus) {
      const o = hasil<Oracle>(h, k.id);
      await bandingkan(k.id, o, k.filter, 2026);
      adaBelum += o.baris.filter((b) => b.badge?.[0] === "belum").length;
    }
    expect(adaBelum).toBeGreaterThan(0);
  }, 300_000);

  it("tahun tanpa data (2025) kosong dan tahun bawaan tanpa parameter = tahun sekarang", async () => {
    const h = await tanyaOracle([
      { id: "kosong", laporan: "rekap.tahunan", params: { tahun: 2025 } },
      { id: "bawaan", laporan: "rekap.tahunan", params: {} },
    ]);
    const kosong = hasil<Oracle>(h, "kosong");
    expect(kosong.baris).toHaveLength(0);
    await bandingkan("kosong", kosong, { jenis: [], status: [], keaktifan: "aktif" }, 2025);
    const bawaan = hasil<Oracle>(h, "bawaan");
    expect(periodeTahunBerjalan({})).toBe(bawaan.tahun);
    await bandingkan("bawaan", bawaan, { jenis: [], status: [], keaktifan: "aktif" }, bawaan.tahun);
  }, 120_000);

  it("ekspor Excel: judul kolom dan baris identik (nol untuk yang kosong, urut nama)", async () => {
    const unit = (
      await db.$queryRawUnsafe<{ unitAsalKode: string }[]>(
        `SELECT "unitAsalKode" FROM "nominatif_bulanan" WHERE "tahun" = 2026 GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1`
      )
    )[0].unitAsalKode;
    const kasus = [
      { id: "e1", params: { tahun: 2026 }, filter: { jenis: [], status: [], keaktifan: "aktif" as Keaktifan }, ekstra: {} },
      { id: "e2", params: { tahun: 2026, keaktifan: "semua" }, filter: { jenis: [], status: [], keaktifan: "semua" as Keaktifan }, ekstra: {} },
      { id: "e3", params: { tahun: 2026, jenis: ["DSN"], status: ["PNS"] }, filter: { jenis: ["DSN"], status: ["PNS"], keaktifan: "aktif" as Keaktifan }, ekstra: {} },
      { id: "e4", params: { tahun: 2026, jenis_pegawai_kode: "TDK", keaktifan: "nonaktif" }, filter: { jenis: [], status: [], keaktifan: "nonaktif" as Keaktifan }, ekstra: { jenisPegawaiKode: "TDK" } },
      { id: "e5", params: { tahun: 2026, unit_asal_kode: unit, keaktifan: "semua" }, filter: { jenis: [], status: [], keaktifan: "semua" as Keaktifan }, ekstra: { unitAsalKode: unit } },
    ];
    const h = await tanyaOracle(kasus.map((k) => ({ id: k.id, laporan: "rekap.tahunan.export", params: k.params })));
    for (const k of kasus) {
      const o = hasil<{ headings: string[]; rows: unknown[][] }>(h, k.id);
      const s = await eksporRekapTahunan(db, 2026, k.filter, k.ekstra);
      bandingkanEkspor(k.id, o, s);
    }
  }, 300_000);

  it("kinerja: Rekap Tahunan 2026 (semua pegawai) dihitung dalam batas wajar", async () => {
    const ukur: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await laporanRekapTahunan(db, 2026, { jenis: [], status: [], keaktifan: "semua" });
      ukur.push(Math.round(performance.now() - t0));
    }
    console.info(`[ukur] laporanRekapTahunan(2026, semua) 3 kali: ${ukur.join(" / ")} ms`);
    expect(Math.min(...ukur)).toBeLessThan(2000); // target F3.4: <= 2 detik
  }, 120_000);
});

describe.skipIf(jalan)("paritas Rekap Tahunan (dilewati)", () => {
  it("PARITAS_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas Rekap Tahunan dilewati: PARITAS_DATABASE_URL/oracle tidak tersedia.");
  });
});
