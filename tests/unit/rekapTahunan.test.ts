import { describe, expect, it } from "vitest";

import { nilaiEksporTahunan, nilaiTampilTahunan } from "@/lib/laporan/rekapTahunan";

describe("nilaiTampilTahunan (sel di halaman: teks kosong '-', angka kosong '0')", () => {
  it("memakai total bila ada", () => {
    expect(nilaiTampilTahunan({ TK: "12" }, "TK", "integer")).toBe("12");
    expect(nilaiTampilTahunan({ TK: "0" }, "TK", "integer")).toBe("0");
  });
  it("komponen angka yang tidak punya total -> '0'", () => {
    expect(nilaiTampilTahunan({}, "TK", "integer")).toBe("0");
  });
  it("komponen teks yang tidak punya total -> '-'", () => {
    expect(nilaiTampilTahunan({}, "JENIS_SHIFT", "teks")).toBe("-");
    expect(nilaiTampilTahunan({ TK: "1" }, "CUTI_ANAK_KE", "teks")).toBe("-");
  });
});

describe("nilaiEksporTahunan (ekspor Excel: semua yang kosong '0', termasuk komponen teks)", () => {
  it("berbeda dari tampilan: komponen teks kosong tetap '0' di berkas Excel (seperti KDS2)", () => {
    expect(nilaiEksporTahunan({}, "JENIS_SHIFT")).toBe("0");
    expect(nilaiEksporTahunan({}, "TK")).toBe("0");
    expect(nilaiEksporTahunan({ TK: "7" }, "TK")).toBe("7");
  });
});
