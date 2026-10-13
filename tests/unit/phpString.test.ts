import { describe, expect, it } from "vitest";

import { phpLtrim, phpRtrim, phpSamaTanpaHuruf, phpTrim, strLimit } from "@/lib/impor/phpString";

describe("padanan fungsi string PHP", () => {
  it("trim PHP hanya membuang spasi, tab, CR/LF, NUL, VT (bukan spasi tak-putus)", () => {
    expect(phpTrim(" \t\r\n\0\x0B abc \x0B")).toBe("abc");
    expect(phpTrim(" abc ")).toBe(" abc ");
    expect(phpTrim("   ")).toBe("");
    expect(phpRtrim("ab \n")).toBe("ab");
    expect(phpLtrim("''12'", "'")).toBe("12'");
  });

  it("strcasecmp melipat hanya huruf ASCII", () => {
    expect(phpSamaTanpaHuruf("SEPTEMBER", "September")).toBe(true);
    expect(phpSamaTanpaHuruf("Sep", "September")).toBe(false);
    expect(phpSamaTanpaHuruf("É", "é")).toBe(false); // bukan ASCII: tidak dilipat
  });

  it("Str::limit memotong menurut lebar tampilan lalu rtrim", () => {
    expect(strLimit("abc", 5)).toBe("abc");
    expect(strLimit("abcdef", 3)).toBe("abc");
    expect(strLimit("ab  cd", 4)).toBe("ab"); // dipotong "ab  " lalu rtrim
    expect(strLimit("漢字漢字", 5)).toBe("漢字"); // lebar 2 per karakter: 4 muat, 6 tidak
    expect(strLimit("x".repeat(300), 255)).toHaveLength(255);
  });
});
