/**
 * PARITAS PENUH (opsional, lambat): semua kombinasi dimensi filter terhadap kode KDS2 asli lewat oracle,
 * bukan hanya tiap dimensi sendiri-sendiri seperti tes per-modul. Menangkap interaksi antar-filter
 * (mis. urutan seri Non-aktif x Jenis x Status). Dijalankan dengan:  npm run test:paritas-penuh
 * (menyetel PARITAS_PENUH=1). Tanpa itu, rangkaian ini dilewati supaya `npm test` tetap cepat.
 *
 *  - Rekap Bulanan : 10 bulan x 3 keaktifan x 3 jenis (semua/Dosen/Tendik) = 90, + 3 bulan x 6 status = 18
 *  - Rekap Tahunan : 3 keaktifan x 3 jenis x 7 status (semua + 6 tunggal) = 63
 *  - Ekspor Excel  : Bulanan 10 bulan x 3 keaktifan = 30; Tahunan 3 keaktifan x 3 jenis x 2 status = 18
 * Tes tidak mencetak isi baris.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { eksporRekapBulanan } from "@/lib/laporan/rekapBulanan";
import { eksporRekapTahunan } from "@/lib/laporan/rekapTahunan";
import type { Keaktifan } from "@/lib/laporan/filter";

import {
  bandingkanEkspor,
  bandingkanRekapBulanan,
  bandingkanRekapTahunan,
  type FilterUji,
  type OracleBulanan,
  type OracleTahunan,
} from "../support/bandingkanRekap";
import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.KDS2_SALINAN_DATABASE_URL;
const jalan = process.env.PARITAS_PENUH === "1" && Boolean(url) && (await oracleTersedia());

const KEAKTIFAN: Keaktifan[] = ["aktif", "nonaktif", "semua"];
const JENIS: string[][] = [[], ["DSN"], ["TDK"]];
const STATUS_TUNGGAL = ["PNS", "CPNS", "PPPK", "PTNA", "CPTNA", "PTT"];
const BULAN = Array.from({ length: 10 }, (_, i) => i + 1);
const UKURAN_BAGIAN = 8; // permintaan per sekali boot Laravel (membatasi memori)

function bagi<T>(daftar: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < daftar.length; i += n) out.push(daftar.slice(i, i + n));
  return out;
}

const namaKasus = (k: { bulan?: number; filter: FilterUji }) =>
  `${k.bulan ? `bln${k.bulan}` : "thn"}|${k.filter.keaktifan}|j:${k.filter.jenis.join("+") || "-"}|s:${k.filter.status.join("+") || "-"}`;

describe.skipIf(!jalan)("paritas PENUH semua kombinasi filter (KDS2 <-> KDS Terpadu)", () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("Rekap Bulanan: bulan x keaktifan x jenis, dan bulan x status tunggal", async () => {
    const kasus: { bulan: number; filter: FilterUji }[] = [];
    for (const bulan of BULAN) for (const keaktifan of KEAKTIFAN) for (const jenis of JENIS) kasus.push({ bulan, filter: { jenis, status: [], keaktifan } });
    for (const bulan of [2, 6, 9]) for (const status of STATUS_TUNGGAL) kasus.push({ bulan, filter: { jenis: [], status: [status], keaktifan: "semua" } });

    let barisDibandingkan = 0;
    for (const bagian of bagi(kasus, UKURAN_BAGIAN)) {
      const h = await tanyaOracle(
        bagian.map((k) => ({ id: namaKasus(k), laporan: "rekap.bulanan", params: { bulan: k.bulan, tahun: 2026, ...k.filter } }))
      );
      for (const k of bagian) {
        const o = hasil<OracleBulanan>(h, namaKasus(k));
        await bandingkanRekapBulanan(db, namaKasus(k), o, k.filter, k.bulan, 2026);
        barisDibandingkan += o.baris.length;
      }
    }
    console.info(`[penuh] Rekap Bulanan: ${kasus.length} kombinasi, ${barisDibandingkan.toLocaleString("id-ID")} baris identik`);
    expect(kasus).toHaveLength(108);
    expect(barisDibandingkan).toBeGreaterThan(100_000);
  }, 40 * 60_000);

  it("Rekap Tahunan: keaktifan x jenis x status", async () => {
    const kasus: { filter: FilterUji }[] = [];
    for (const keaktifan of KEAKTIFAN) for (const jenis of JENIS) for (const status of [[], ...STATUS_TUNGGAL.map((s) => [s])]) kasus.push({ filter: { jenis, status, keaktifan } });

    let barisDibandingkan = 0;
    for (const bagian of bagi(kasus, UKURAN_BAGIAN)) {
      const h = await tanyaOracle(bagian.map((k) => ({ id: namaKasus(k), laporan: "rekap.tahunan", params: { tahun: 2026, ...k.filter } })));
      for (const k of bagian) {
        const o = hasil<OracleTahunan>(h, namaKasus(k));
        await bandingkanRekapTahunan(db, namaKasus(k), o, k.filter, 2026);
        barisDibandingkan += o.baris.length;
      }
    }
    console.info(`[penuh] Rekap Tahunan: ${kasus.length} kombinasi, ${barisDibandingkan.toLocaleString("id-ID")} baris identik`);
    expect(kasus).toHaveLength(63);
    expect(barisDibandingkan).toBeGreaterThan(20_000);
  }, 40 * 60_000);

  it("Ekspor Excel: Rekap Bulanan (bulan x keaktifan) dan Rekap Tahunan (keaktifan x jenis x status)", async () => {
    type K = { id: string; params: Record<string, unknown>; filter: FilterUji; bulan?: number };
    const bulanan: K[] = [];
    for (const bulan of BULAN) for (const keaktifan of KEAKTIFAN) bulanan.push({ id: `eb${bulan}-${keaktifan}`, bulan, params: { bulan, tahun: 2026, keaktifan }, filter: { jenis: [], status: [], keaktifan } });
    const tahunan: K[] = [];
    for (const keaktifan of KEAKTIFAN) for (const jenis of JENIS) for (const status of [[], ["PNS"]]) {
      tahunan.push({ id: `et-${keaktifan}-${jenis.join("+") || "-"}-${status.join("+") || "-"}`, params: { tahun: 2026, keaktifan, jenis, status }, filter: { jenis, status, keaktifan } });
    }

    let baris = 0;
    for (const bagian of bagi(bulanan, UKURAN_BAGIAN)) {
      const h = await tanyaOracle(bagian.map((k) => ({ id: k.id, laporan: "rekap.bulanan.export", params: k.params })));
      for (const k of bagian) {
        const o = hasil<{ headings: string[]; rows: unknown[][] }>(h, k.id);
        bandingkanEkspor(k.id, o, await eksporRekapBulanan(db, k.bulan!, 2026, k.filter));
        baris += o.rows.length;
      }
    }
    for (const bagian of bagi(tahunan, UKURAN_BAGIAN)) {
      const h = await tanyaOracle(bagian.map((k) => ({ id: k.id, laporan: "rekap.tahunan.export", params: k.params })));
      for (const k of bagian) {
        const o = hasil<{ headings: string[]; rows: unknown[][] }>(h, k.id);
        bandingkanEkspor(k.id, o, await eksporRekapTahunan(db, 2026, k.filter));
        baris += o.rows.length;
      }
    }
    console.info(`[penuh] Ekspor Excel: ${bulanan.length + tahunan.length} berkas, ${baris.toLocaleString("id-ID")} baris identik`);
    expect(bulanan.length + tahunan.length).toBe(48);
    expect(baris).toBeGreaterThan(50_000);
  }, 40 * 60_000);
});

describe.skipIf(jalan)("paritas PENUH (dilewati)", () => {
  it("opsional: setel PARITAS_PENUH=1 (npm run test:paritas-penuh) dengan oracle dan kds_paritas tersedia", () => {
    expect(true).toBe(true);
  });
});
