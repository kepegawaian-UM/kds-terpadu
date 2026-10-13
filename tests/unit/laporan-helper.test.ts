import { describe, expect, it } from "vitest";

import { buatNamaFile } from "@/lib/laporan/namaFile";
import { NAMA_BULAN, namaBulan, parameterTerisi, keInt } from "@/lib/laporan/periode";
import { keaktifanDari, jenisStatusDari, labelFileKeaktifan } from "@/lib/laporan/filter";
import { KOLOM_KOMPONEN } from "@/lib/laporan/komponen";

const URUTAN_STATUS = ["CPNS", "CPTNA", "PNS", "PPPK", "PTNA", "PTT"]; // contoh urutan dropdown

describe("periode", () => {
  it("nama bulan Indonesia 1-12; di luar rentang jatuh ke angka", () => {
    expect(NAMA_BULAN).toHaveLength(13);
    expect(namaBulan(1)).toBe("Januari");
    expect(namaBulan(12)).toBe("Desember");
    expect(namaBulan(13)).toBe("13");
    expect(namaBulan(0)).toBe("0");
  });
  it("keInt meniru (int) PHP", () => {
    expect(keInt("10")).toBe(10);
    expect(keInt(" 7")).toBe(7);
    expect(keInt("12abc")).toBe(12);
    expect(keInt("abc")).toBe(0);
    expect(keInt(undefined)).toBe(0);
  });
  it("parameterTerisi meniru filled() Laravel (bukan null, bukan string kosong/spasi)", () => {
    expect(parameterTerisi("10")).toBe(true);
    expect(parameterTerisi("")).toBe(false);
    expect(parameterTerisi("   ")).toBe(false);
    expect(parameterTerisi(undefined)).toBe(false);
    expect(parameterTerisi(null)).toBe(false);
    expect(parameterTerisi("0")).toBe(true);
  });
});

describe("filter Jenis/Status", () => {
  const sah = ["CPNS", "PNS", "PPPK", "PTT"];
  it("hanya DSN/TDK dan status sah; kosong = semua", () => {
    expect(jenisStatusDari({}, sah)).toEqual({ jenis: [], status: [] });
    expect(jenisStatusDari({ jenis: ["DSN", "AKL", "TDK"], status: ["PNS", "XX"] }, sah)).toEqual({ jenis: ["DSN", "TDK"], status: ["PNS"] });
  });
  it("nilai tunggal (tautan lama ?jenis=DSN) dikenali", () => {
    expect(jenisStatusDari({ jenis: "DSN", status: "PNS" }, sah)).toEqual({ jenis: ["DSN"], status: ["PNS"] });
  });
  it("mempertahankan urutan dan duplikat masukan seperti array_intersect", () => {
    expect(jenisStatusDari({ jenis: ["TDK", "DSN", "TDK"] }, sah).jenis).toEqual(["TDK", "DSN", "TDK"]);
  });
});

describe("filter Keaktifan", () => {
  it("bawaan aktif; nilai tak dikenal kembali ke aktif", () => {
    expect(keaktifanDari(undefined)).toBe("aktif");
    expect(keaktifanDari("nonaktif")).toBe("nonaktif");
    expect(keaktifanDari("semua")).toBe("semua");
    expect(keaktifanDari("lain")).toBe("aktif");
    expect(keaktifanDari(["semua"])).toBe("aktif"); // (string) array di PHP = "Array"
  });
  it("label nama file: Semua tidak diberi label", () => {
    expect(labelFileKeaktifan("aktif")).toBe("Aktif");
    expect(labelFileKeaktifan("nonaktif")).toBe("Non-aktif");
    expect(labelFileKeaktifan("semua")).toBeNull();
  });
});

describe("buatNamaFile (contoh dari dokumentasi KDS2)", () => {
  it("Tahunan Dosen PNS-PPPK 2026", () => {
    expect(buatNamaFile("Rekap Kehadiran Tahunan", ["DSN"], ["PNS", "PPPK"], "2026", URUTAN_STATUS)).toBe(
      "Rekap Kehadiran Tahunan Dosen PNS-PPPK 2026"
    );
  });
  it("Bulanan Dosen dan Tendik PNS Maret 2026", () => {
    expect(buatNamaFile("Rekap Kehadiran Bulanan", ["TDK", "DSN"], ["PNS"], "Maret 2026", URUTAN_STATUS)).toBe(
      "Rekap Kehadiran Bulanan Dosen dan Tendik PNS Maret 2026"
    );
  });
  it("filter kosong dihilangkan; keaktifan disisipkan sebelum periode", () => {
    expect(buatNamaFile("Detail Pegawai", [], [], "Oktober 2026", [])).toBe("Detail Pegawai Oktober 2026");
    expect(buatNamaFile("Rekap Kehadiran Tahunan", ["DSN"], ["PNS"], "2026", URUTAN_STATUS, "Aktif")).toBe(
      "Rekap Kehadiran Tahunan Dosen PNS Aktif 2026"
    );
  });
  it("status digabung mengikuti urutan dropdown, bukan urutan pilihan", () => {
    expect(buatNamaFile("X", [], ["PTT", "CPNS"], "2026", URUTAN_STATUS)).toBe("X CPNS-PTT 2026");
  });
  it("membuang karakter terlarang nama file dan merapikan spasi", () => {
    expect(buatNamaFile("A/B:C", [], [], "  2026 ", [])).toBe("A B C 2026");
  });
});

describe("urutan komponen", () => {
  it("16 komponen mengikuti config/rekap_kehadiran.php", () => {
    expect(KOLOM_KOMPONEN).toEqual([
      "SIGMA_HARI", "I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN",
      "TOTAL", "JUMLAH_MASUK_NYATA", "JENIS_SHIFT", "CUTI_ANAK_KE",
    ]);
  });
});
