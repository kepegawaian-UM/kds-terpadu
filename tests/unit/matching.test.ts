import { describe, expect, it } from "vitest";

import { exactMatch, normalize, prefixOrExactMatch } from "@/lib/domain/matching";

describe("normalize", () => {
  it("merapikan spasi dan huruf besar/kecil", () => {
    expect(normalize("  Lektor   Kepala ")).toBe("lektor kepala");
  });
});

describe("exactMatch", () => {
  const master = [{ nama: "Lektor Kepala" }, { nama: "Lektor" }];
  it("cocok persis, abaikan huruf besar/kecil", () => {
    expect(exactMatch(master, (m) => m.nama, "LEKTOR")).toEqual({ nama: "Lektor" });
  });
  it("tidak menebak (tanpa fuzzy)", () => {
    expect(exactMatch(master, (m) => m.nama, "Lektr")).toBeUndefined();
  });
});

describe("prefixOrExactMatch", () => {
  const master = [{ nama: "AF - Adjunct Faculty" }];
  it("cocok lewat kode pendek di depan nama", () => {
    expect(prefixOrExactMatch(master, (m) => m.nama, "af")).toBeDefined();
  });
});
