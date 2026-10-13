/**
 * Prasyarat paritas F3: oracle (kode KDS2 asli) harus berjalan, terhubung ke kds2_produksi,
 * berzona WIB, dan sesi MySQL-nya benar-benar hanya-baca.
 */
import { describe, expect, it } from "vitest";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const ada = await oracleTersedia();

describe.skipIf(!ada)("oracle paritas KDS2", () => {
  it("berjalan terhadap kds2_produksi dengan zona waktu Asia/Jakarta", async () => {
    const h = await tanyaOracle([{ id: "p", laporan: "ping" }]);
    expect(hasil<{ db: string; tz: string }>(h, "p")).toMatchObject({ db: "kds2_produksi", tz: "Asia/Jakarta" });
  }, 120_000);

  it("sesi MySQL oracle menolak penulisan (hanya-baca)", async () => {
    const h = await tanyaOracle([{ id: "t", laporan: "tulisDiblokir" }]);
    expect(hasil<{ diblokir: boolean }>(h, "t").diblokir).toBe(true);
  }, 120_000);

  it("melaporkan galat per permintaan tanpa menggagalkan yang lain", async () => {
    const h = await tanyaOracle([
      { id: "a", laporan: "tidak-ada" },
      { id: "b", laporan: "ping" },
    ]);
    expect(() => hasil(h, "a")).toThrow(/tidak dikenal/);
    expect(hasil<{ db: string }>(h, "b").db).toBe("kds2_produksi");
  }, 120_000);

  it("banyak permintaan sekali jalan (Laravel di-boot sekali)", async () => {
    const t0 = Date.now();
    const h = await tanyaOracle(
      Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, laporan: "nominatif.index", params: { bulan: 10, tahun: 2026 } }))
    );
    const lima = Array.from({ length: 5 }, (_, i) => hasil<{ baris: unknown[] }>(h, `n${i}`).baris.length);
    expect(new Set(lima).size).toBe(1);
    expect(lima[0]).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(60_000);
  }, 120_000);
});

describe.skipIf(ada)("oracle paritas (dilewati)", () => {
  it("PHP/KDS2/MySQL tidak tersedia", () => {
    console.warn("Oracle dilewati: php, folder KDS2 (KDS2_PATH), atau MySQL kds2_produksi tidak tersedia.");
  });
});
