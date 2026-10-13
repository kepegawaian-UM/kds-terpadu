import { describe, expect, it } from "vitest";

import { cakupanKoreksi } from "@/lib/domain/koreksi";
import { hitungTandai, periodeBulanBerjalan, urutkanTkTerbanyak } from "@/lib/laporan/rekapBulanan";

const tgl = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("cakupanKoreksi (port KoreksiRekapService::cakupan)", () => {
  const k = (mulai: string, selesai: string | null) => ({ tanggalMulai: tgl(mulai), tanggalSelesai: selesai ? tgl(selesai) : null });

  it("penuh: rentang menutupi seluruh bulan (dari tanggal 1 sampai akhir bulan)", () => {
    expect(cakupanKoreksi(k("2026-09-01", "2026-09-30"), 9, 2026)).toBe("penuh");
    expect(cakupanKoreksi(k("2026-08-15", "2026-10-02"), 9, 2026)).toBe("penuh");
    expect(cakupanKoreksi(k("2026-01-01", null), 9, 2026)).toBe("penuh"); // tanpa batas akhir
  });
  it("sebagian: mulai/selesai di tengah bulan", () => {
    expect(cakupanKoreksi(k("2026-09-02", null), 9, 2026)).toBe("sebagian");
    expect(cakupanKoreksi(k("2026-08-01", "2026-09-29"), 9, 2026)).toBe("sebagian");
    expect(cakupanKoreksi(k("2026-09-10", "2026-09-20"), 9, 2026)).toBe("sebagian");
  });
  it("di luar: seluruh rentang sebelum atau sesudah bulan", () => {
    expect(cakupanKoreksi(k("2026-10-01", null), 9, 2026)).toBe("di_luar");
    expect(cakupanKoreksi(k("2026-07-01", "2026-08-31"), 9, 2026)).toBe("di_luar");
  });
  it("tepi: Februari kabisat dan pergantian tahun", () => {
    expect(cakupanKoreksi(k("2028-02-01", "2028-02-29"), 2, 2028)).toBe("penuh");
    expect(cakupanKoreksi(k("2027-02-01", "2027-02-28"), 2, 2027)).toBe("penuh");
    expect(cakupanKoreksi(k("2026-12-01", "2026-12-31"), 12, 2026)).toBe("penuh");
    expect(cakupanKoreksi(k("2027-01-01", null), 12, 2026)).toBe("di_luar");
  });
});

describe("hitungTandai (logika sel berwarna di view bulanan)", () => {
  const koreksi = (dari: string, ke: string | null, alasan = "uji") => ({ id: 1, dari, ke, alasan });

  it("memindah TK -> TB: kedua sel ditandai bila bernilai > 0", () => {
    const t = hitungTandai([koreksi("TK", "TB")], { TK: "0", TB: "5" });
    expect(t).toEqual({ TB: "Dikoreksi: uji (TK → TB)" });
  });
  it("sel asal ditandai bila masih > 0 (koreksi sebagian) dan sel tujuan ditandai bila > 0", () => {
    const t = hitungTandai([koreksi("TK", "TB")], { TK: "2", TB: "3" });
    expect(Object.keys(t).sort()).toEqual(["TB", "TK"]);
  });
  it("tidak dihitung (ke = null): sel asal SELALU ditandai, teks 'dihapus'", () => {
    expect(hitungTandai([koreksi("TK", null)], { TK: "0" })).toEqual({ TK: "Dikoreksi: uji (TK → dihapus)" });
    expect(hitungTandai([koreksi("TK", null)], null)).toEqual({ TK: "Dikoreksi: uji (TK → dihapus)" });
  });
  it("pegawai tanpa rekap dan koreksi berpindah: tidak ada tanda", () => {
    expect(hitungTandai([koreksi("TK", "TB")], null)).toEqual({});
  });
  it("koreksi belakangan menimpa informasi komponen yang sama", () => {
    const t = hitungTandai([koreksi("TK", "TB", "pertama"), koreksi("S", "TB", "kedua")], { TK: "0", S: "0", TB: "4" });
    expect(t.TB).toBe("Dikoreksi: kedua (S → TB)");
  });
  it("tanpa koreksi: kosong", () => {
    expect(hitungTandai([], { TK: "1" })).toEqual({});
  });
});

describe("urutkanTkTerbanyak (sortByDesc stabil)", () => {
  it("TK terbanyak dulu; yang tanpa rekap dihitung 0; seri mempertahankan urutan asal", () => {
    const baris = [
      { nip: "a", tk: 0 },
      { nip: "b", tk: 5 },
      { nip: "c", tk: 5 },
      { nip: "d", tk: 9 },
      { nip: "e", tk: 0 },
    ];
    expect(urutkanTkTerbanyak(baris, (b) => b.tk).map((b) => b.nip)).toEqual(["d", "b", "c", "a", "e"]);
  });
  it("tidak mengubah daftar asal", () => {
    const baris = [{ tk: 1 }, { tk: 2 }];
    urutkanTkTerbanyak(baris, (b) => b.tk);
    expect(baris.map((b) => b.tk)).toEqual([1, 2]);
  });
});

describe("periodeBulanBerjalan (bawaan bulan ini, WIB; param ada walau kosong = (int))", () => {
  const sekarang = new Date("2026-10-31T20:00:00.000Z"); // 1 Nov 2026 03:00 WIB
  it("tanpa parameter: bulan/tahun sekarang menurut WIB", () => {
    expect(periodeBulanBerjalan({}, sekarang)).toEqual([11, 2026]);
  });
  it("parameter terisi dipakai; sebagian terisi: sisanya dari sekarang", () => {
    expect(periodeBulanBerjalan({ bulan: "3", tahun: "2025" }, sekarang)).toEqual([3, 2025]);
    expect(periodeBulanBerjalan({ bulan: "3" }, sekarang)).toEqual([3, 2026]);
  });
  it("parameter ada tapi kosong/ngawur menjadi 0 seperti (int) PHP", () => {
    expect(periodeBulanBerjalan({ bulan: "", tahun: "abc" }, sekarang)).toEqual([0, 0]);
  });
});
