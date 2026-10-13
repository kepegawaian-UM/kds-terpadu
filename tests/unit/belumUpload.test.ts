import { describe, expect, it } from "vitest";

import { bandingkanPhp, urutkanNamaPhp } from "@/lib/laporan/urutPhp";
import { belumMulaiKerja, ringkasPerUnit, urutkanUntukTampilan, type BarisBelum } from "@/lib/laporan/belumUpload";

describe("bandingkanPhp (sortBy PHP: byte, angka murni numerik)", () => {
  it("huruf besar sebelum kecil (urut byte, bukan kolasi)", () => {
    expect(bandingkanPhp("Zed", "andi")).toBeLessThan(0);
    expect(bandingkanPhp("andi", "Zed")).toBeGreaterThan(0);
  });
  it("tanda baca urut ASCII: spasi < koma < titik < angka < huruf", () => {
    const urut = ["b", "a", "1", ".", ",", " ", "-"].sort(bandingkanPhp);
    expect(urut).toEqual([" ", ",", "-", ".", "1", "a", "b"]);
  });
  it("awalan lebih pendek lebih dulu; sama = 0", () => {
    expect(bandingkanPhp("Ani", "Ani B")).toBeLessThan(0);
    expect(bandingkanPhp("Ani", "Ani")).toBe(0);
  });
  it("dua string angka dibandingkan numerik (PHP 8 SORT_REGULAR)", () => {
    expect(bandingkanPhp("10", "9")).toBeGreaterThan(0);
    expect(bandingkanPhp("10", "9a")).toBeLessThan(0); // salah satu bukan angka -> byte
  });
  it("urut byte UTF-8, bukan UTF-16 (karakter di luar BMP sesudah U+FFFF-an)", () => {
    // U+FF5E (3 byte UTF-8) < U+1F600 (4 byte) pada byte; UTF-16 juga demikian di sini, tapi
    // pembanding harus memakai byte: pastikan hasilnya konsisten dengan Buffer.compare.
    const a = "～";
    const b = "\u{1F600}";
    expect(Math.sign(bandingkanPhp(a, b))).toBe(Math.sign(Buffer.compare(Buffer.from(a), Buffer.from(b))));
  });
  it("urutkanNamaPhp stabil: nama sama mempertahankan urutan asal", () => {
    const daftar = [
      { nama: "b", id: 1 },
      { nama: "a", id: 2 },
      { nama: "a", id: 3 },
    ];
    expect(urutkanNamaPhp(daftar).map((x) => x.id)).toEqual([2, 3, 1]);
  });
});

describe("belumMulaiKerja (TMT setelah bulan laporan)", () => {
  const tmt = (s: string) => new Date(`${s}T00:00:00.000Z`);
  it("TMT di bulan laporan sendiri dianggap sudah mulai (bukan belum TMT)", () => {
    expect(belumMulaiKerja(tmt("2026-10-15"), 10, 2026)).toBe(false);
    expect(belumMulaiKerja(tmt("2026-10-01"), 10, 2026)).toBe(false);
  });
  it("bulan atau tahun TMT lebih akhir = belum mulai", () => {
    expect(belumMulaiKerja(tmt("2026-11-01"), 10, 2026)).toBe(true);
    expect(belumMulaiKerja(tmt("2027-01-01"), 12, 2026)).toBe(true);
  });
  it("TMT lebih awal = sudah mulai", () => {
    expect(belumMulaiKerja(tmt("2026-09-30"), 10, 2026)).toBe(false);
    expect(belumMulaiKerja(tmt("2025-12-31"), 1, 2026)).toBe(false);
  });
});

const baris = (o: Partial<BarisBelum>): BarisBelum => ({
  nip: "1", nama: "x", jenis: "Dosen", unit: "-", tmt: "01-01-2020", belumTmt: false, keterangan: null, ...o,
});

describe("ringkasPerUnit (yang perlu ditindaklanjuti, urut jumlah menurun, seri = urutan kemunculan)", () => {
  it("mengecualikan belum-TMT dan yang sudah ber-keterangan", () => {
    const hasil = ringkasPerUnit([
      baris({ unit: "A" }),
      baris({ unit: "A", belumTmt: true }),
      baris({ unit: "B", keterangan: "Pensiun" }),
      baris({ unit: "C" }),
      baris({ unit: "C" }),
      baris({ unit: "B" }),
    ]);
    expect(hasil).toEqual([["C", 2], ["A", 1], ["B", 1]]);
  });
  it("kosong bila tidak ada yang perlu ditindaklanjuti", () => {
    expect(ringkasPerUnit([baris({ belumTmt: true })])).toEqual([]);
  });
});

describe("urutkanUntukTampilan (urutan awal DataTables: Unit Kerja naik, huruf kecil, seri = urutan asal)", () => {
  it("mengurut unit tanpa peka huruf besar/kecil dan mempertahankan urutan nama untuk unit sama", () => {
    const hasil = urutkanUntukTampilan([
      baris({ nama: "n1", unit: "b unit" }),
      baris({ nama: "n2", unit: "A unit" }),
      baris({ nama: "n3", unit: "a unit" }),
      baris({ nama: "n4", unit: "B Unit" }),
    ]);
    expect(hasil.map((b) => b.nama)).toEqual(["n2", "n3", "n1", "n4"]);
  });
});
