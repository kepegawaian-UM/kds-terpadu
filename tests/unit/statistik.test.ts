import { describe, expect, it } from "vitest";

import {
  hitungStatistikDosen,
  hitungStatistikTendik,
  type RowDosen,
  type RowTendik,
  susunKolomJabatanGolongan,
} from "@/lib/laporan/statistik";

const tdk = (o: Partial<RowTendik> = {}): RowTendik => ({
  unitIndukNama: "Fakultas A",
  jenisKelamin: "L",
  statusKode: "PNS",
  golonganKode: "III/a",
  pendidikan: "S1",
  ...o,
});

describe("hitungStatistikTendik", () => {
  it("menghitung per unit induk: jumlah, status x jenis kelamin, golongan, pendidikan", () => {
    const { statistik } = hitungStatistikTendik([
      tdk(),
      tdk({ jenisKelamin: "P" }),
      tdk({ statusKode: "PPPK", golonganKode: "X", pendidikan: "S2" }),
    ]);
    expect(statistik).toHaveLength(1);
    expect(statistik[0]).toMatchObject({
      unit: "Fakultas A",
      jumlah: 3,
      status_PNS_L: 1,
      status_PNS_P: 1,
      status_PPPK_L: 1,
      status_PPPK_P: 0,
      "gol_III/a": 2,
      gol_none: 0, // golongan "X" (PPPK romawi) tidak ada di daftar tetap dan bukan null
      pend_S1: 2,
      pend_S2: 1,
      pend_none: 0,
    });
  });

  it("golongan null -> gol_none; pendidikan kosong/null -> pend_none; trim pendidikan; huruf besar/kecil dibedakan", () => {
    const { statistik } = hitungStatistikTendik([
      tdk({ golonganKode: null, pendidikan: null }),
      tdk({ pendidikan: "  S1 " }),
      tdk({ pendidikan: "s1" }), // tidak cocok daftar dan bukan kosong -> hanya masuk jumlah
      tdk({ pendidikan: "   " }),
    ]);
    expect(statistik[0]).toMatchObject({ jumlah: 4, gol_none: 1, pend_S1: 1, pend_none: 2 });
  });

  it("status di luar daftar hanya masuk jumlah", () => {
    const { statistik } = hitungStatistikTendik([tdk({ statusKode: "AKL" })]);
    expect(statistik[0].jumlah).toBe(1);
    expect(statistik[0].status_PNS_L).toBe(0);
  });

  it("unit diurut menurut urut PHP (byte): huruf besar sebelum kecil", () => {
    const { statistik } = hitungStatistikTendik([tdk({ unitIndukNama: "fakultas b" }), tdk({ unitIndukNama: "Zeta" }), tdk({ unitIndukNama: "Alfa" })]);
    expect(statistik.map((s) => s.unit)).toEqual(["Alfa", "Zeta", "fakultas b"]);
  });

  it("total = jumlah semua kolom; kosong menghasilkan total tanpa kolom selain unit (seperti KDS2)", () => {
    const { total } = hitungStatistikTendik([tdk(), tdk({ unitIndukNama: "Fakultas B", jenisKelamin: "P" })]);
    expect(total).toMatchObject({ unit: "TOTAL", jumlah: 2, status_PNS_L: 1, status_PNS_P: 1, "gol_III/a": 2 });
    expect(hitungStatistikTendik([]).total).toEqual({ unit: "TOTAL" });
    expect(hitungStatistikTendik([]).statistik).toEqual([]);
  });
});

const dsn = (o: Partial<RowDosen> = {}): RowDosen => ({
  unitIndukNama: "Fakultas A",
  unitAsalNama: "Jurusan 1",
  jabatanNama: "Lektor",
  urutanJenjang: 2,
  jenisKelamin: "L",
  golonganKode: "III/c",
  pendidikan: "S3",
  ...o,
});

describe("susunKolomJabatanGolongan", () => {
  it("jabatan dari jenjang tertinggi; golongan yang dipakai saja, tertinggi dulu; PPPK sesudah PNS; kosong terakhir", () => {
    const kolom = susunKolomJabatanGolongan([
      dsn({ jabatanNama: "Lektor", urutanJenjang: 2, golonganKode: "III/b" }),
      dsn({ jabatanNama: "Lektor", urutanJenjang: 2, golonganKode: "IV/a" }),
      dsn({ jabatanNama: "Lektor", urutanJenjang: 2, golonganKode: "X" }), // PPPK (romawi)
      dsn({ jabatanNama: "Lektor", urutanJenjang: 2, golonganKode: null }),
      dsn({ jabatanNama: "Guru Besar", urutanJenjang: 4, golonganKode: "IV/e" }),
      dsn({ jabatanNama: "Asisten Ahli", urutanJenjang: 1, golonganKode: "III/b" }),
    ]);
    expect(kolom).toEqual([
      { jabatan: "Guru Besar", golongan: "IV/e" },
      { jabatan: "Lektor", golongan: "IV/a" },
      { jabatan: "Lektor", golongan: "III/b" },
      { jabatan: "Lektor", golongan: "X" },
      { jabatan: "Lektor", golongan: null },
      { jabatan: "Asisten Ahli", golongan: "III/b" },
    ]);
  });

  it("golongan tak dikenal diurut setelah PPPK, urutan kemunculan dipertahankan; jabatan seri jenjang mengikuti kemunculan", () => {
    const kolom = susunKolomJabatanGolongan([
      dsn({ jabatanNama: "B", urutanJenjang: 1, golonganKode: "ZZ" }),
      dsn({ jabatanNama: "A", urutanJenjang: 1, golonganKode: "QQ" }),
      dsn({ jabatanNama: "B", urutanJenjang: 1, golonganKode: "II" }), // PPPK II
      dsn({ jabatanNama: "B", urutanJenjang: 1, golonganKode: "II/a" }), // PNS
    ]);
    expect(kolom).toEqual([
      { jabatan: "B", golongan: "II/a" },
      { jabatan: "B", golongan: "II" },
      { jabatan: "B", golongan: "ZZ" },
      { jabatan: "A", golongan: "QQ" },
    ]);
  });

  it("tanpa baris -> tanpa kolom", () => {
    expect(susunKolomJabatanGolongan([])).toEqual([]);
  });
});

describe("hitungStatistikDosen", () => {
  const baris = [
    dsn({ unitIndukNama: "Fakultas B", unitAsalNama: "Jurusan Z", jenisKelamin: "P" }),
    dsn({ unitIndukNama: "Fakultas A", unitAsalNama: "Jurusan 2", pendidikan: "S2" }),
    dsn({ unitIndukNama: "Fakultas A", unitAsalNama: "Jurusan 1", golonganKode: null, pendidikan: null }),
    dsn({ unitIndukNama: "Fakultas A", unitAsalNama: "Jurusan 1", jabatanNama: "Guru Besar", urutanJenjang: 4, golonganKode: "IV/e", jenisKelamin: "P" }),
  ];

  it("dua level: fakultas (subtotal) -> jurusan, diurut nama; kolom dinamis dan jumlah L/P", () => {
    const r = hitungStatistikDosen(baris);
    expect(r.laporan.map((f) => f.subtotal.unit)).toEqual(["Fakultas A", "Fakultas B"]);
    expect(r.laporan[0].jurusan.map((j) => j.unit)).toEqual(["Jurusan 1", "Jurusan 2"]);
    expect(r.kolom.map((k) => `${k.jabatan}|${k.golongan}`)).toEqual(["Guru Besar|IV/e", "Lektor|III/c", "Lektor|null"]);
    // Fakultas A: GB IV/e P=1; Lektor III/c L=1 (Jurusan 2); Lektor kosong L=1 (Jurusan 1)
    expect(r.laporan[0].subtotal).toMatchObject({ jumlah: 3, kol_0_L: 0, kol_0_P: 1, kol_1_L: 1, kol_1_P: 0, kol_2_L: 1, kol_2_P: 0 });
    expect(r.laporan[1].subtotal).toMatchObject({ jumlah: 1, kol_1_P: 1 });
  });

  it("pendidikan: dihitung per daftar (Sp1 ada, Profesi tidak), null/kosong = pend_none", () => {
    const r = hitungStatistikDosen(baris);
    expect(r.total).toMatchObject({ unit: "TOTAL", jumlah: 4, pend_S3: 2, pend_S2: 1, pend_none: 1 });
    expect(Object.keys(r.total).filter((k) => k.startsWith("pend_")).sort()).toEqual(
      ["pend_D1", "pend_D3", "pend_D4", "pend_S1", "pend_S2", "pend_S3", "pend_SD", "pend_SLTA", "pend_SLTP", "pend_Sp1", "pend_none"].sort()
    );
  });

  it("jurusan dengan nama sama di satu fakultas digabung (pengelompokan menurut nama, seperti KDS2)", () => {
    const r = hitungStatistikDosen([dsn({ unitAsalNama: "Sama" }), dsn({ unitAsalNama: "Sama", jenisKelamin: "P" })]);
    expect(r.laporan[0].jurusan).toHaveLength(1);
    expect(r.laporan[0].jurusan[0].jumlah).toBe(2);
  });

  it("tanpa baris: laporan kosong dan total dengan jumlah 0", () => {
    const r = hitungStatistikDosen([]);
    expect(r.laporan).toEqual([]);
    expect(r.kolom).toEqual([]);
    expect(r.total).toMatchObject({ unit: "TOTAL", jumlah: 0 });
  });
});
