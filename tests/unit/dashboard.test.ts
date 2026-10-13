import { describe, expect, it } from "vitest";

import {
  chartGolongan,
  chartJabatanDosen,
  chartKategoriAkademisiLuar,
  chartPendidikan,
  chartSebaranUnitInduk,
  chartStatusKepegawaian,
  periodeDashboard,
  persen,
  type RowUmum,
} from "@/lib/laporan/dashboard";

const r = (o: Partial<RowUmum> = {}): RowUmum => ({
  unitIndukNama: "Fakultas A",
  golonganKode: "III/a",
  pendidikan: "S2",
  jabatanDosenKode: null,
  statusKode: "PNS",
  kategoriKode: null,
  ...o,
});

describe("persen (round 1 desimal ala PHP, 0.0 bila total 0)", () => {
  it("membulatkan satu desimal setengah ke atas", () => {
    expect(persen(1, 3)).toBe(33.3);
    expect(persen(2, 3)).toBe(66.7);
    expect(persen(1, 16)).toBe(6.3); // 6.25 -> 6.3 (PHP round, setengah menjauhi nol)
    expect(persen(1, 8)).toBe(12.5);
  });
  it("total 0 menghasilkan 0", () => {
    expect(persen(0, 0)).toBe(0);
    expect(persen(5, 0)).toBe(0);
  });
  it("nilai penuh", () => {
    expect(persen(7, 7)).toBe(100);
    expect(persen(0, 7)).toBe(0);
  });
});

describe("chartGolongan", () => {
  it("urutan tetap dari IV/e ke I/a; golongan null dilewati; golongan di luar daftar menyusul menurut kemunculan", () => {
    const hasil = chartGolongan([
      r({ golonganKode: "III/a" }),
      r({ golonganKode: null }),
      r({ golonganKode: "X" }),
      r({ golonganKode: "IV/a" }),
      r({ golonganKode: "III/a" }),
      r({ golonganKode: "II" }),
    ]);
    expect(hasil).toEqual({ labels: ["IV/a", "III/a", "X", "II"], data: [1, 2, 1, 1] });
  });
});

describe("chartPendidikan", () => {
  it("hanya yang ada di daftar dan > 0, urutan tetap, trim, huruf besar/kecil dibedakan", () => {
    const hasil = chartPendidikan([r({ pendidikan: " S1 " }), r({ pendidikan: "S3" }), r({ pendidikan: "s1" }), r({ pendidikan: null }), r({ pendidikan: "Profesi" })]);
    expect(hasil).toEqual({ labels: ["S3", "Profesi", "S1"], data: [1, 1, 1] });
  });
});

describe("chartSebaranUnitInduk (enam terbesar, seri menurut kemunculan)", () => {
  it("mengurut menurun dan memotong enam", () => {
    const rows = [
      ...Array(3).fill(0).map(() => r({ unitIndukNama: "C" })),
      ...Array(5).fill(0).map(() => r({ unitIndukNama: "A" })),
      r({ unitIndukNama: "B" }),
      r({ unitIndukNama: "D" }),
      ...["E", "F", "G"].map((u) => r({ unitIndukNama: u })),
    ];
    const hasil = chartSebaranUnitInduk(rows);
    expect(hasil.labels).toEqual(["A", "C", "B", "D", "E", "F"]); // B,D,E,F,G seri 1 -> urutan kemunculan; G terpotong
    expect(hasil.data).toEqual([5, 3, 1, 1, 1, 1]);
  });
});

describe("chartJabatanDosen", () => {
  const urutan = [
    { kode: "D4", nama: "Guru Besar" },
    { kode: "D3", nama: "Lektor Kepala" },
    { kode: "D2", nama: "Lektor" },
  ];
  it("urutan jenjang master (tertinggi dulu), hanya yang ada", () => {
    const hasil = chartJabatanDosen([r({ jabatanDosenKode: "D2" }), r({ jabatanDosenKode: "D4" }), r({ jabatanDosenKode: "D2" })], urutan);
    expect(hasil).toEqual({ labels: ["Guru Besar", "Lektor"], data: [1, 2] });
  });
});

describe("chartStatusKepegawaian", () => {
  const nama = new Map([["PNS", "Pegawai Negeri Sipil"], ["PTT", "Pegawai Tidak Tetap"], ["ZZ", "Status Baru"]]);
  it("urutan tetap PNS,CPNS,PPPK,PTNA,CPTNA,PTT; status baru menyusul; nama dari master atau kode", () => {
    const hasil = chartStatusKepegawaian([r({ statusKode: "PTT" }), r({ statusKode: "PNS" }), r({ statusKode: "ZZ" }), r({ statusKode: "QQ" }), r({ statusKode: "PNS" })], nama);
    expect(hasil).toEqual({ labels: ["Pegawai Negeri Sipil", "Pegawai Tidak Tetap", "Status Baru", "QQ"], data: [2, 1, 1, 1] });
  });
});

describe("chartKategoriAkademisiLuar (enam teratas + Lainnya)", () => {
  const nama = new Map(Array.from({ length: 8 }, (_, i) => [`K${i}`, `Kategori ${i}`] as [string, string]));
  it("mengelompokkan sisanya menjadi 'Lainnya' dan kategori kosong berlabel '-'", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => Array(8 - i).fill(0).map(() => r({ kategoriKode: `K${i}` }))).flat(),
      r({ kategoriKode: null }),
    ];
    const hasil = chartKategoriAkademisiLuar(rows, nama);
    expect(hasil.labels).toEqual(["Kategori 0", "Kategori 1", "Kategori 2", "Kategori 3", "Kategori 4", "Kategori 5", "Lainnya"]);
    expect(hasil.data).toEqual([8, 7, 6, 5, 4, 3, 2 + 1 + 1]); // K6=2, K7=1, kosong=1
  });
  it("tanpa sisa tidak menambah 'Lainnya'", () => {
    const hasil = chartKategoriAkademisiLuar([r({ kategoriKode: "K0" }), r({ kategoriKode: null })], nama);
    expect(hasil.labels).toEqual(["Kategori 0", "-"]);
  });
});

describe("periodeDashboard", () => {
  const terbaru = { bulan: 10, tahun: 2026 };
  const sekarang = new Date("2026-10-13T03:00:00.000Z");
  it("bawaan: snapshot terbaru untuk pegawai; kinerja = tahun snapshot terbaru", () => {
    expect(periodeDashboard({}, terbaru, sekarang)).toEqual({ bulanPegawai: 10, tahunPegawai: 2026, tahunKinerja: 2026 });
  });
  it("parameter pegawai harus terisi keduanya; tahun_kinerja boleh sendiri", () => {
    expect(periodeDashboard({ bulan_pegawai: "3", tahun_pegawai: "2025", tahun_kinerja: "2025" }, terbaru, sekarang)).toEqual({
      bulanPegawai: 3, tahunPegawai: 2025, tahunKinerja: 2025,
    });
    expect(periodeDashboard({ bulan_pegawai: "3" }, terbaru, sekarang)).toMatchObject({ bulanPegawai: 10, tahunPegawai: 2026 });
  });
  it("tanpa snapshot sama sekali: pegawai null, kinerja memakai tahun sekarang (WIB)", () => {
    expect(periodeDashboard({}, null, sekarang)).toEqual({ bulanPegawai: null, tahunPegawai: null, tahunKinerja: 2026 });
  });
});
