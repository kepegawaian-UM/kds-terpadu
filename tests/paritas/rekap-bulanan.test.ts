/**
 * Paritas Rekap Kehadiran Bulanan (data asli, lokal) terhadap RekapKehadiranReportController KDS2
 * lewat oracle: urutan baris (TK terbanyak + seri), nilai tiap sel, lencana status, sel koreksi
 * berwarna, nama file, koreksi yang berlaku, dan ekspor Excel. Tes tidak mencetak isi baris.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { eksporRekapBulanan, koreksiBerlaku, periodeBulanBerjalan } from "@/lib/laporan/rekapBulanan";
import type { Keaktifan } from "@/lib/laporan/filter";

import { bandingkanRekapBulanan, type FilterUji, type OracleBulanan as Oracle } from "../support/bandingkanRekap";
import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.PARITAS_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

const periodeKasus = (bulan: number, filter: { jenis?: string[]; status?: string[]; keaktifan?: Keaktifan } = {}) => ({
  bulan,
  tahun: 2026,
  ...filter,
});

describe.skipIf(!jalan)("paritas Rekap Kehadiran Bulanan KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const bandingkan = (id: string, o: Oracle, filter: FilterUji, bulan: number, tahun: number) =>
    bandingkanRekapBulanan(db, id, o, filter, bulan, tahun);

  it("semua bulan 2026 dengan filter bawaan (aktif): urutan, nilai, lencana, tanda koreksi, nama file", async () => {
    const kasus = Array.from({ length: 10 }, (_, i) => periodeKasus(i + 1));
    const h = await tanyaOracle(kasus.map((k) => ({ id: `b${k.bulan}`, laporan: "rekap.bulanan", params: { bulan: k.bulan, tahun: k.tahun } })));
    let totalDenganRekap = 0;
    let barisBertanda = 0;
    for (const k of kasus) {
      const o = hasil<Oracle>(h, `b${k.bulan}`);
      await bandingkan(`b${k.bulan}`, o, { jenis: [], status: [], keaktifan: "aktif" }, k.bulan, k.tahun);
      totalDenganRekap += o.baris.filter((b) => b.nilai).length;
      barisBertanda += o.baris.filter((b) => Object.keys(b.tandai ?? {}).length > 0).length;
    }
    expect(totalDenganRekap).toBeGreaterThan(10000);
    // Pastikan tes tidak lulus karena kosong: data nyata memuat sel koreksi berwarna.
    expect(barisBertanda).toBeGreaterThan(0);
  }, 600_000);

  it("keaktifan non-aktif dan semua (lencana 'Belum ada keterangan' muncul)", async () => {
    const kasus = [3, 6, 9].flatMap((bulan) => (["nonaktif", "semua"] as Keaktifan[]).map((keaktifan) => ({ bulan, keaktifan })));
    const h = await tanyaOracle(
      kasus.map((k) => ({ id: `${k.bulan}-${k.keaktifan}`, laporan: "rekap.bulanan", params: { bulan: k.bulan, tahun: 2026, keaktifan: k.keaktifan } }))
    );
    let adaLencanaBelum = 0;
    for (const k of kasus) {
      const o = hasil<Oracle>(h, `${k.bulan}-${k.keaktifan}`);
      await bandingkan(`${k.bulan}-${k.keaktifan}`, o, { jenis: [], status: [], keaktifan: k.keaktifan }, k.bulan, 2026);
      adaLencanaBelum += o.baris.filter((b) => b.badge?.[0] === "belum").length;
    }
    expect(adaLencanaBelum).toBeGreaterThan(0);
  }, 600_000);

  it("kombinasi filter Jenis x Status pada September", async () => {
    const kombinasi = [
      { jenis: ["DSN"], status: [] },
      { jenis: ["TDK"], status: [] },
      { jenis: ["DSN", "TDK"], status: ["PNS"] },
      { jenis: ["TDK"], status: ["PPPK", "PTT"] },
      { jenis: [], status: ["PTNA", "CPNS"] },
    ];
    const h = await tanyaOracle(
      kombinasi.map((k, i) => ({ id: `k${i}`, laporan: "rekap.bulanan", params: { bulan: 9, tahun: 2026, ...k, keaktifan: "semua" } }))
    );
    for (const [i, k] of kombinasi.entries()) {
      await bandingkan(`k${i}`, hasil<Oracle>(h, `k${i}`), { ...k, keaktifan: "semua" }, 9, 2026);
    }
  }, 300_000);

  it("koreksi yang berlaku (id, dari, ke, alasan, urutan) identik untuk setiap bulan", async () => {
    const bulan = Array.from({ length: 10 }, (_, i) => i + 1);
    const h = await tanyaOracle(bulan.map((b) => ({ id: `c${b}`, laporan: "koreksi.berlaku", params: { bulan: b, tahun: 2026 } })));
    let adaKoreksi = 0;
    for (const b of bulan) {
      const o = hasil<Record<string, unknown>>(h, `c${b}`);
      const s = await koreksiBerlaku(db, b, 2026);
      expect(JSON.stringify(Object.entries(s).sort()), `koreksi bulan ${b}`).toBe(JSON.stringify(Object.entries(Array.isArray(o) ? {} : o).sort()));
      adaKoreksi += Object.keys(s).length;
    }
    expect(adaKoreksi).toBeGreaterThan(0);
  }, 300_000);

  it("periode bawaan tanpa parameter (bulan berjalan) sama dengan KDS2", async () => {
    const h = await tanyaOracle([{ id: "d", laporan: "rekap.bulanan", params: {} }]);
    const o = hasil<Oracle>(h, "d");
    expect(periodeBulanBerjalan({})).toEqual([o.bulan, o.tahun]);
    await bandingkan("d", o, { jenis: [], status: [], keaktifan: "aktif" }, o.bulan, o.tahun);
  }, 120_000);

  it("ekspor Excel: judul kolom dan baris identik (bawaan, filter, dan parameter jenis/unit)", async () => {
    const unit = (
      await db.$queryRawUnsafe<{ unitAsalKode: string }[]>(
        `SELECT "unitAsalKode" FROM "nominatif_bulanan" WHERE "bulan" = 9 AND "tahun" = 2026 GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1`
      )
    )[0].unitAsalKode;
    const kasus = [
      { id: "e1", params: { bulan: 9, tahun: 2026 }, filter: { jenis: [], status: [], keaktifan: "aktif" as Keaktifan }, ekstra: {} },
      { id: "e2", params: { bulan: 9, tahun: 2026, keaktifan: "semua" }, filter: { jenis: [], status: [], keaktifan: "semua" as Keaktifan }, ekstra: {} },
      { id: "e3", params: { bulan: 6, tahun: 2026, jenis: ["DSN"], status: ["PNS"] }, filter: { jenis: ["DSN"], status: ["PNS"], keaktifan: "aktif" as Keaktifan }, ekstra: {} },
      { id: "e4", params: { bulan: 9, tahun: 2026, jenis_pegawai_kode: "TDK", keaktifan: "nonaktif" }, filter: { jenis: [], status: [], keaktifan: "nonaktif" as Keaktifan }, ekstra: { jenisPegawaiKode: "TDK" } },
      { id: "e5", params: { bulan: 9, tahun: 2026, unit_asal_kode: unit }, filter: { jenis: [], status: [], keaktifan: "aktif" as Keaktifan }, ekstra: { unitAsalKode: unit } },
    ];
    const h = await tanyaOracle(kasus.map((k) => ({ id: k.id, laporan: "rekap.bulanan.export", params: k.params })));
    for (const k of kasus) {
      const o = hasil<{ headings: string[]; rows: unknown[][] }>(h, k.id);
      const p = k.params as { bulan: number; tahun: number };
      const s = await eksporRekapBulanan(db, p.bulan, p.tahun, k.filter, k.ekstra);
      expect(s.headings, `judul ${k.id}`).toEqual(o.headings);
      expect(s.rows.length, `jumlah baris ${k.id}`).toBe(o.rows.length);
      const beda = o.rows.reduce<number>((n, r, i) => n + (JSON.stringify(r) === JSON.stringify(s.rows[i]) ? 0 : 1), 0);
      expect(beda, `baris ekspor berbeda ${k.id}`).toBe(0);
    }
  }, 300_000);
});

describe.skipIf(jalan)("paritas Rekap Bulanan (dilewati)", () => {
  it("PARITAS_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas Rekap Bulanan dilewati: PARITAS_DATABASE_URL/oracle tidak tersedia.");
  });
});
