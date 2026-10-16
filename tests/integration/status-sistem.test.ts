/** Status Sistem: ambang peringatan, perkiraan sisa bulan, dan pembacaan ukuran/hitungan per bulan dari database (data SINTETIS di kds_test). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { BAHAYA_MB, dataStatusSistem, perkiraanSisaBulan, PERINGATAN_MB, tingkatPeringatan } from "@/lib/laporan/statusSistem";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

describe("ambang dan perkiraan", () => {
  it("tingkat peringatan tepat di batas 400 dan 480 MB", () => {
    expect([0, 399.9, PERINGATAN_MB, 479.9, BAHAYA_MB, 600].map(tingkatPeringatan)).toEqual(["aman", "aman", "peringatan", "peringatan", "bahaya", "bahaya"]);
  });
  it("sisa bulan dibulatkan ke bawah; tanpa pertumbuhan tidak diperkirakan; tidak pernah negatif", () => {
    expect(perkiraanSisaBulan(112, 5)).toBe(80); // (512 - 112) / 5
    expect(perkiraanSisaBulan(75.8, 5.4)).toBe(80);
    expect(perkiraanSisaBulan(100, 0)).toBeNull();
    expect(perkiraanSisaBulan(100, -1)).toBeNull();
    expect(perkiraanSisaBulan(600, 5)).toBe(0);
  });
});

const ada = Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!ada)("dataStatusSistem (database)", () => {
  const prisma = new PrismaClient();
  beforeAll(async () => {
    await kosongkanDomain(prisma);
    await muatKeadaan(prisma, {
      nominatif: [
        { nip: "900000000000000001", bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2015-01-01" },
        { nip: "900000000000000001", bulan: 9, tahun: 2026, jenis: "DSN", tmt: "2015-01-01" },
        { nip: "900000000000000002", bulan: 9, tahun: 2026, jenis: "TDK", tmt: "2015-01-01" },
      ],
      rekap: [{ nip: "900000000000000001", bulan: 9, tahun: 2026, komponen: { TK: "1" } }],
    });
    await prisma.uploadBatch.updateMany({ where: { jenis: "nominatif_bulanan" }, data: { bulan: 9, tahun: 2026 } }); // batch unggahan bulan September
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("ukuran database terbaca, hitungan per bulan benar dan urut terbaru dulu, tabel terbesar berisi nama tabel", async () => {
    const d = await dataStatusSistem(prisma);
    expect(d.ukuranMb).toBeGreaterThan(0);
    expect(d.persen).toBeCloseTo((d.ukuranMb / 512) * 100, 5);
    expect(d.tingkat).toBe("aman");
    expect(d.perBulan.map((b) => [b.tahun, b.bulan, b.nominatif, b.absensi])).toEqual([[2026, 9, 2, 1], [2026, 8, 1, 0]]);
    expect(d.perBulan[0].terakhirDiunggah).toBeInstanceOf(Date);
    expect(d.perBulan[1].terakhirDiunggah).toBeNull(); // Agustus tidak punya batch ber-periode
    expect(d.tabelTerbesar.length).toBeGreaterThan(0);
    expect(d.tabelTerbesar.length).toBeLessThanOrEqual(6);
    expect(d.tabelTerbesar.every((t) => typeof t.nama === "string" && t.mb >= 0)).toBe(true);
    expect(d.pertumbuhanMbPerBulan === null || d.pertumbuhanMbPerBulan > 0).toBe(true);
  });

  it("tanpa data: tidak ada baris bulanan dan pertumbuhan tidak diperkirakan", async () => {
    await kosongkanDomain(prisma);
    const d = await dataStatusSistem(prisma);
    expect(d.perBulan).toEqual([]);
    expect(d.pertumbuhanMbPerBulan).toBeNull();
    expect(d.sisaBulan).toBeNull();
  });
});
