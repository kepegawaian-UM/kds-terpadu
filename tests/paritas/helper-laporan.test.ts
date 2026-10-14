/**
 * Paritas pembantu laporan (data asli, lokal): hasil fungsi TypeScript harus sama dengan kode
 * KDS2 yang sebenarnya (oracle) - nama file, penguraian filter, NIP non-aktif, periode bawaan,
 * dan urutan status dropdown.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { jenisStatusDari, keaktifanDari, labelFileKeaktifan, nipNonaktif, urutanKodeStatus } from "@/lib/laporan/filter";
import { buatNamaFile } from "@/lib/laporan/namaFile";
import { resolveBulanTahun } from "@/lib/laporan/periode";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.KDS2_SALINAN_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

describe.skipIf(!jalan)("paritas pembantu laporan KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("urutan kode status dropdown identik", async () => {
    const h = await tanyaOracle([{ id: "u", laporan: "master.urutanStatus" }]);
    expect(await urutanKodeStatus(db)).toEqual(hasil<string[]>(h, "u"));
  }, 120_000);

  it("nama file unduhan identik untuk berbagai kombinasi", async () => {
    const urutanStatus = await urutanKodeStatus(db);
    const jenisList = [[], ["DSN"], ["TDK"], ["DSN", "TDK"], ["TDK", "DSN"]];
    const statusList = [[], ["PNS"], ["PPPK", "PNS"], ["PTT", "CPNS", "PTNA"]];
    const keaktifanList = [null, "Aktif", "Non-aktif"];
    const periodeList = ["2026", "Maret 2026", "Oktober 2026"];
    const kasus: { id: string; jenis: string[]; status: string[]; keaktifan: string | null; periode: string }[] = [];
    for (const jenis of jenisList)
      for (const status of statusList)
        for (const keaktifan of keaktifanList)
          for (const periode of periodeList) kasus.push({ id: `k${kasus.length}`, jenis, status, keaktifan, periode });

    const h = await tanyaOracle(
      kasus.map((k) => ({
        id: k.id,
        laporan: "namaFileUnduhan",
        params: { tab: "Rekap Kehadiran Tahunan", jenis: k.jenis, status: k.status, periode: k.periode, urutanStatus, keaktifan: k.keaktifan },
      }))
    );
    for (const k of kasus) {
      expect(buatNamaFile("Rekap Kehadiran Tahunan", k.jenis, k.status, k.periode, urutanStatus, k.keaktifan), k.id).toBe(
        hasil<string>(h, k.id)
      );
    }
  }, 120_000);

  it("penguraian filter Jenis/Status/Keaktifan identik (termasuk masukan aneh)", async () => {
    const statusSah = await urutanKodeStatus(db);
    const masukan: Record<string, unknown>[] = [
      {},
      { jenis: "DSN" },
      { jenis: ["DSN", "TDK"], status: ["PNS", "PTT"] },
      { jenis: ["AKL", "DSN"], status: ["TIDAK-ADA", "PNS"] },
      { jenis: ["TDK", "DSN", "TDK"] },
      { status: "PPPK" },
      { jenis: [], status: [] },
      { jenis: "", status: "" },
      { keaktifan: "nonaktif" },
      { keaktifan: "semua" },
      { keaktifan: "ngawur" },
    ];
    // Sengaja berbeda: ?keaktifan[]=semua membuat KDS2 galat (PHP "Array to string conversion",
    // halaman 500); KDS Terpadu kembali ke "aktif". Dicatat di tes unit, bukan dibandingkan di sini.
    const h = await tanyaOracle([
      ...masukan.map((m, i) => ({ id: `js${i}`, laporan: "filterJenisStatus.dariRequest", params: m })),
      ...masukan.map((m, i) => ({ id: `ka${i}`, laporan: "filterKeaktifan.dariRequest", params: m })),
    ]);
    masukan.forEach((m, i) => {
      const { jenis, status } = jenisStatusDari(m as never, statusSah);
      expect({ jenis, status }, `js${i}`).toEqual(hasil(h, `js${i}`));
      expect(keaktifanDari(m.keaktifan as never), `ka${i}`).toBe(hasil<string>(h, `ka${i}`));
    });
    expect(labelFileKeaktifan("aktif")).toBe("Aktif");
  }, 120_000);

  it("daftar NIP non-aktif identik untuk setiap tahun (termasuk tahun tanpa data)", async () => {
    const tahun = [2024, 2025, 2026, 2027];
    const h = await tanyaOracle(tahun.map((t) => ({ id: `t${t}`, laporan: "filterKeaktifan.nipNonaktif", params: { tahun: t } })));
    for (const t of tahun) {
      const oracle = [...hasil<string[]>(h, `t${t}`)].sort();
      const mine = [...(await nipNonaktif(db, t))].sort();
      expect(mine.length, `jumlah non-aktif ${t}`).toBe(oracle.length);
      expect(mine.filter((n, i) => n !== oracle[i]).length, `isi non-aktif ${t}`).toBe(0);
    }
  }, 120_000);

  it("periode bawaan (tanpa parameter) = snapshot terbaru, dan parameter terisi dipakai apa adanya", async () => {
    const h = await tanyaOracle([
      { id: "default", laporan: "periode.bawaan.nominatif", params: {} },
      { id: "isi", laporan: "periode.bawaan.nominatif", params: { bulan: 3, tahun: 2026 } },
      { id: "setengah", laporan: "periode.bawaan.nominatif", params: { bulan: 3 } },
    ]);
    const d = hasil<{ bulan: number; tahun: number }>(h, "default");
    expect(await resolveBulanTahun(db, {})).toEqual([d.bulan, d.tahun]);
    expect(await resolveBulanTahun(db, { bulan: "3", tahun: "2026" })).toEqual([3, 2026]);
    const s = hasil<{ bulan: number; tahun: number }>(h, "setengah");
    expect(await resolveBulanTahun(db, { bulan: "3" })).toEqual([s.bulan, s.tahun]);
    expect(hasil<{ bulan: number }>(h, "isi").bulan).toBe(3);
  }, 120_000);
});

describe.skipIf(jalan)("paritas pembantu laporan (dilewati)", () => {
  it("KDS2_SALINAN_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas pembantu laporan dilewati: KDS2_SALINAN_DATABASE_URL/oracle tidak tersedia.");
  });
});
