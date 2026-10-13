import { describe, expect, it } from "vitest";

import { cocokLike, judulSheetMassal, persen, type LaporanIndividual } from "@/lib/laporan/rekapIndividual";

describe("persen (number_format(masuk / sigma * 100, 1, ',', '') . '%')", () => {
  it.each([
    [17, 20, "85,0%"], [20, 20, "100,0%"], [0, 22, "0,0%"], [1, 3, "33,3%"], [2, 3, "66,7%"], [1, 8, "12,5%"], [1, 16, "6,3%"], [1, 6, "16,7%"],
    [199, 200, "99,5%"], [1, 400, "0,3%"], [1, 800, "0,1%"], [264, 240, "110,0%"], [1234, 10, "12340,0%"],
  ])("%d / %d -> %s", (m, s, hasil) => expect(persen(m, s)).toBe(hasil));
  it("sigma 0 atau negatif -> '-'", () => {
    expect(persen(5, 0)).toBe("-");
    expect(persen(5, -3)).toBe("-");
  });
});

describe("cocokLike (LIKE MySQL kolasi _ci: tanpa huruf besar/kecil dan aksen)", () => {
  it("potongan, huruf besar/kecil, aksen", () => {
    expect(cocokLike("Budi Santoso", "santo")).toBe(true);
    expect(cocokLike("Budi Santoso", "BUDI")).toBe(true);
    expect(cocokLike("José Álvarez", "jose alv")).toBe(true);
    expect(cocokLike("Budi", "bud x")).toBe(false);
  });
  it("wildcard % dan _ adalah pola; backslash meloloskannya (default MySQL)", () => {
    expect(cocokLike("budi_x", "i_")).toBe(true);
    expect(cocokLike("abc", "a_c")).toBe(true);
    expect(cocokLike("abc", "a%c")).toBe(true);
    expect(cocokLike("abc", "%")).toBe(true);
    expect(cocokLike("50%diskon", "50\\%")).toBe(true);
    expect(cocokLike("500diskon", "50\\%")).toBe(false);
    expect(cocokLike("a_c", "a\\_c")).toBe(true);
    expect(cocokLike("abc", "a\\_c")).toBe(false);
  });
  it("karakter regex literal tidak merusak pola", () => {
    expect(cocokLike("a.b(c)", ".b(")).toBe(true);
    expect(cocokLike("axb", "a.b")).toBe(false);
  });
});

describe("judulSheetMassal (RekapIndividualMassalExport::sheets)", () => {
  const l = (nama: string, nip: string) => ({ nip, identitas: { nama } }) as unknown as LaporanIndividual;
  it("judul = 20 huruf nama + 6 digit akhir NIP; karakter terlarang diganti spasi", () => {
    expect(judulSheetMassal([l("Budi Santoso", "198001012005011234")])).toEqual(["Budi Santoso 011234"]);
    expect(judulSheetMassal([l("A/B:C*D?[E]", "198001012005019999")])).toEqual(["A B C D  E 019999".replace("  ", "  ")].map((x) => x));
  });
  it("nama panjang dipotong 20 dan di-rtrim", () => {
    expect(judulSheetMassal([l("Muhammad Abdurrahman Wahid", "198001012005011234")])).toEqual(["Muhammad Abdurrahman 011234"]);
    expect(judulSheetMassal([l("Muhammad Abdurrahma W", "198001012005011234")])).toEqual(["Muhammad Abdurrahma 011234"]);
  });
  it("judul kembar (huruf besar/kecil diabaikan) diberi akhiran -2, -3 dengan nama 18 huruf", () => {
    const hasil = judulSheetMassal([l("Siti Aminah Rahayuningsih", "198001012005011234"), l("SITI AMINAH RAHAYUNINGSIH", "198001012005011234"), l("siti aminah rahayuningsih", "198001012005011234")]);
    expect(hasil[0]).toBe("Siti Aminah Rahayuni 011234");
    expect(hasil[1]).toBe("SITI AMINAH RAHAYU 011234-2");
    expect(hasil[2]).toBe("siti aminah rahayu 011234-3");
  });
});
