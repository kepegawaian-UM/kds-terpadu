/**
 * Lapisan database Statistik Dosen/Tendik dengan data SINTETIS di kds_test: pengecualian unit UA-179,
 * INNER JOIN jabatan fungsional (dosen tanpa jabatan tidak dihitung), pengelompokan fakultas/jurusan.
 * Melengkapi paritas data asli (yang tidak memuat dosen tanpa jabatan fungsional).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { statistikDosen, statistikTendik } from "@/lib/laporan/statistik";
import { eksporStatistikDosen, eksporStatistikTendik } from "@/lib/laporan/statistikEkspor";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const ada = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!ada)("Statistik (sintetis)", () => {
  let prisma: PrismaClient;
  let batchId: number;
  let unitA: { kode: string; nama: string; fakultas: string };
  let unitB: { kode: string; nama: string; fakultas: string };
  let jabatan: { lektor: string; guruBesar: string };
  let n = 0;

  const tambah = async (o: {
    jenis: "DSN" | "TDK";
    unit: string;
    jabatanDosen?: string | null;
    jk?: string;
    status?: string;
    golongan?: string | null;
    pendidikan?: string | null;
  }) => {
    const nip = `9000000000000${String(++n).padStart(5, "0")}`;
    await prisma.pegawai.create({ data: { nip } });
    await prisma.nominatifBulanan.create({
      data: {
        pegawaiNip: nip, bulan: 9, tahun: 2026, nama: `Uji ${n}`, jenisKelamin: o.jk ?? "L", jenisPegawaiKode: o.jenis,
        statusKepegawaianKode: o.status ?? "PNS", golonganKode: o.golongan === undefined ? "III/c" : o.golongan,
        pendidikanTerakhir: o.pendidikan === undefined ? "S2" : o.pendidikan, unitAsalKode: o.unit,
        jabatanFungsionalDosenKode: o.jenis === "DSN" ? (o.jabatanDosen === undefined ? jabatan.lektor : o.jabatanDosen) : null,
        tanggalMulaiKerja: new Date("2020-01-31T00:00:00.000Z"), uploadBatchId: batchId,
      },
    });
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    const units = await prisma.unitAsal.findMany({
      where: { kode: { not: "UA-179" } },
      include: { unitInduk: true },
      orderBy: { kode: "asc" },
      take: 400,
    });
    // dua unit di FAKULTAS BERBEDA supaya pengelompokan dua level terlihat
    const a = units[0];
    const b = units.find((u) => u.unitIndukKode !== a.unitIndukKode)!;
    unitA = { kode: a.kode, nama: a.nama, fakultas: a.unitInduk.nama };
    unitB = { kode: b.kode, nama: b.nama, fakultas: b.unitInduk.nama };
    const jab = await prisma.jabatanFungsionalDosen.findMany({ orderBy: { urutanJenjang: "asc" } });
    jabatan = { lektor: jab[2].kode, guruBesar: jab[jab.length - 1].kode };
  });
  beforeEach(async () => {
    n = 0;
    await kosongkanDomain(prisma);
    batchId = (await prisma.uploadBatch.create({ data: { jenis: "nominatif_bulanan", namaFileAsli: "uji", diunggahOlehNama: "Uji" } })).id;
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("Dosen: unit UA-179 dikecualikan, dosen TANPA jabatan fungsional tidak dihitung sama sekali (INNER JOIN)", async () => {
    await tambah({ jenis: "DSN", unit: unitA.kode });
    await tambah({ jenis: "DSN", unit: unitA.kode, jk: "P" });
    await tambah({ jenis: "DSN", unit: unitA.kode, jabatanDosen: null }); // tanpa jabatan -> tidak ikut
    await tambah({ jenis: "DSN", unit: "UA-179" }); // placeholder -> tidak ikut
    const r = await statistikDosen(prisma, 9, 2026);
    expect(r.total.jumlah).toBe(2);
    expect(r.laporan).toHaveLength(1);
    expect(r.laporan[0].subtotal).toMatchObject({ unit: unitA.fakultas, jumlah: 2 });
    expect(r.laporan[0].jurusan.map((j) => j.unit)).toEqual([unitA.nama]);
  });

  it("Dosen: dua fakultas, kolom jabatan x golongan dinamis, hitungan L/P dan pendidikan", async () => {
    await tambah({ jenis: "DSN", unit: unitA.kode, jk: "L", golongan: "III/c", pendidikan: "S3" });
    await tambah({ jenis: "DSN", unit: unitA.kode, jk: "P", golongan: "III/c", pendidikan: " S2 " });
    await tambah({ jenis: "DSN", unit: unitB.kode, jabatanDosen: jabatan.guruBesar, golongan: "IV/e", pendidikan: null });
    await tambah({ jenis: "DSN", unit: unitB.kode, golongan: null });
    const r = await statistikDosen(prisma, 9, 2026);
    expect(r.laporan.map((f) => f.subtotal.unit).sort()).toEqual([unitA.fakultas, unitB.fakultas].sort());
    expect(r.kolom.map((k) => k.golongan)).toEqual(["IV/e", "III/c", null]); // guru besar dulu; lektor: golongan lalu kosong
    expect(r.total).toMatchObject({ jumlah: 4, kol_0_L: 1, kol_1_L: 1, kol_1_P: 1, kol_2_L: 1, pend_S3: 1, pend_S2: 2, pend_none: 1 }); // baris ke-4 memakai pendidikan bawaan S2
  });

  it("Dosen: bulan tanpa data dosen menghasilkan laporan kosong", async () => {
    const r = await statistikDosen(prisma, 1, 2020);
    expect(r.laporan).toEqual([]);
    expect(r.kolom).toEqual([]);
    expect(r.total.jumlah).toBe(0);
  });

  it("Tendik: UA-179 dikecualikan; dikelompokkan per unit induk; status x jenis kelamin; golongan dan pendidikan", async () => {
    await tambah({ jenis: "TDK", unit: unitA.kode, status: "PNS", jk: "L", golongan: "III/a", pendidikan: "S1" });
    await tambah({ jenis: "TDK", unit: unitA.kode, status: "PTT", jk: "P", golongan: null, pendidikan: "SLTA" });
    await tambah({ jenis: "TDK", unit: unitB.kode, status: "PNS", jk: "P", golongan: "III/a", pendidikan: null });
    await tambah({ jenis: "TDK", unit: "UA-179", status: "PNS" }); // placeholder -> tidak ikut
    await tambah({ jenis: "DSN", unit: unitA.kode }); // dosen tidak ikut statistik tendik
    const r = await statistikTendik(prisma, 9, 2026);
    expect(r.statistik).toHaveLength(2);
    expect(r.total).toMatchObject({
      unit: "TOTAL", jumlah: 3, status_PNS_L: 1, status_PNS_P: 1, status_PTT_P: 1, "gol_III/a": 2, gol_none: 1, pend_S1: 1, pend_SLTA: 1, pend_none: 1,
    });
    const a = r.statistik.find((s) => s.unit === unitA.fakultas)!;
    expect(a).toMatchObject({ jumlah: 2, status_PNS_L: 1, status_PTT_P: 1 });
  });

  it("Ekspor Dosen: satu baris judul rata, baris fakultas + jurusan + total, angka berupa angka", async () => {
    await tambah({ jenis: "DSN", unit: unitA.kode, jk: "L", golongan: "III/c", pendidikan: "S3" });
    await tambah({ jenis: "DSN", unit: unitA.kode, jk: "P", golongan: "III/c", pendidikan: "S2" });
    await tambah({ jenis: "DSN", unit: unitB.kode, jabatanDosen: jabatan.guruBesar, golongan: "IV/e", pendidikan: null });
    const e = await eksporStatistikDosen(prisma, 9, 2026);
    expect(e.namaFile).toBe("Statistik Dosen September 2026");
    const r = await statistikDosen(prisma, 9, 2026);
    expect(e.headings.slice(0, 2)).toEqual(["Fakultas", "Jurusan"]);
    expect(e.headings).toContain("Jumlah");
    expect(e.headings).toContain("Pendidikan S3");
    expect(e.headings.filter((h) => / [LP]$/.test(h) && !h.startsWith("Pendidikan")).length).toBe(r.kolom.length * 2);
    const total = e.rows[e.rows.length - 1];
    expect(total[0]).toBe("TOTAL");
    expect(total[e.headings.indexOf("Jumlah")]).toBe(3);
    expect(total[e.headings.indexOf("Pendidikan S3")]).toBe(1);
    expect(e.rows.every((row) => row.length === e.headings.length)).toBe(true);
    expect(e.rows.filter((row) => row[1] === "(Jumlah fakultas)")).toHaveLength(2); // dua fakultas
    expect(typeof total[2]).toBe("number");
    expect((await eksporStatistikDosen(prisma, 1, 2020)).rows).toEqual([]); // tanpa data: hanya judul
  });

  it("Ekspor Tendik: baris per unit induk + total, isi sama dengan tabel", async () => {
    await tambah({ jenis: "TDK", unit: unitA.kode, status: "PNS", jk: "L", golongan: "III/a", pendidikan: "S1" });
    await tambah({ jenis: "TDK", unit: unitB.kode, status: "PTT", jk: "P", golongan: null, pendidikan: "SLTA" });
    const e = await eksporStatistikTendik(prisma, 9, 2026);
    expect(e.namaFile).toBe("Statistik Tendik September 2026");
    expect(e.rows).toHaveLength(3); // dua unit induk + total
    expect(e.rows.every((row) => row.length === e.headings.length)).toBe(true);
    const total = e.rows[2];
    expect(total[e.headings.indexOf("Jumlah")]).toBe(2);
    expect(total[e.headings.indexOf("PNS L")]).toBe(1);
    expect(total[e.headings.indexOf("PTT P")]).toBe(1);
    expect(total[e.headings.indexOf("Golongan III/a")]).toBe(1);
    expect(total[e.headings.indexOf("Golongan (kosong)")]).toBe(1);
  });
});
