import { describe, expect, it } from "vitest";

import { parseTanggalNominatif as p } from "@/lib/impor/tanggal";

describe("parseTanggalNominatif: format yang diterima KDS2 (hasil sama, dibuktikan paritas)", () => {
  it.each([
    ["2018-03-04", "2018-03-04"], ["2018-03-04 10:30:00", "2018-03-04"], ["2018-3-4", "2018-03-04"], ["2018/03/04", "2018-03-04"],
    ["04-03-2018", "2018-03-04"], ["04.03.2018", "2018-03-04"], ["20180304", "2018-03-04"], ["4 January 2018", "2018-01-04"],
    ["4-Jan-2018", "2018-01-04"], ["Jan 4, 2018", "2018-01-04"], [" 2018-03-04 ", "2018-03-04"],
  ])("%s -> %s", (masuk, keluar) => expect(p(masuk)).toBe(keluar));

  it("kosong -> null", () => {
    expect(p(null)).toBeNull();
    expect(p("")).toBeNull();
    expect(p("   ")).toBeNull();
  });
});

describe("parseTanggalNominatif: PENGERASAN sengaja dibanding Carbon::parse KDS2", () => {
  it("teks sembarang ditolak (KDS2 diam-diam menyimpan TANGGAL HARI INI)", () => {
    for (const s of ["x", "2018", "besok", "12:30", "n/a", "-"]) expect(p(s), s).toBeNull();
  });

  it("tanggal yang tidak ada ditolak (KDS2 menggesernya: 2018-02-30 -> 2018-03-02)", () => {
    for (const s of ["2018-02-30", "2021-02-29", "31-04-2018", "0000-00-00", "2018-13-01", "2018-00-10"]) expect(p(s), s).toBeNull();
    expect(p("2020-02-29")).toBe("2020-02-29"); // tahun kabisat
  });

  it("d/m/Y atau m/d/Y hanya bila tak ambigu; ambigu ditolak (KDS2 membaca 01/02/1990 sebagai 2 Januari)", () => {
    expect(p("31/12/2018")).toBe("2018-12-31"); // KDS2 menolak
    expect(p("12/31/2018")).toBe("2018-12-31"); // KDS2 menolak
    expect(p("01/02/1990")).toBeNull();
    expect(p("13/13/1990")).toBeNull();
  });

  it("nama bulan Indonesia diterima (KDS2 menolak)", () => {
    expect(p("5 Januari 2018")).toBe("2018-01-05");
    expect(p("17 Agustus 1945")).toBe("1945-08-17");
    expect(p("1-Des-2020")).toBe("2020-12-01");
  });

  it("sel tanggal Excel (Date) diterima (KDS2 menolaknya karena membaca nomor seri); angka polos tetap ditolak", () => {
    expect(p(new Date(Date.UTC(2018, 2, 4)))).toBe("2018-03-04");
    expect(p(43163)).toBeNull();
    expect(p(true)).toBeNull();
    expect(p(new Date("tidak"))).toBeNull();
  });
});
