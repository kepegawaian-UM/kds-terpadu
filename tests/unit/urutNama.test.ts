import { describe, expect, it } from "vitest";

import { bandingkanNama, kunciNama, urutkanMenurutNama } from "@/lib/laporan/urutNama";

const urut = (nama: string[]) => nama.map((n, i) => ({ id: i + 1, nama: n })).sort((a, b) => bandingkanNama(a.nama, b.nama) || a.id - b.id).map((x) => x.nama);

describe("bandingkanNama (meniru MySQL utf8mb4_unicode_ci)", () => {
  it("tidak peka huruf besar/kecil dan aksen pada perbandingan utama", () => {
    expect(urut(["budi", "Andi", "ÉMIL", "carla"])).toEqual(["Andi", "budi", "carla", "ÉMIL"]);
    expect(kunciNama("Édith  ")).toBe("edith");
  });

  it("tanda baca < angka < huruf", () => {
    expect(urut(["a1", "a-", "aa", "a."])).toEqual(["a-", "a.", "a1", "aa"]);
  });

  it("urutan tanda baca mengikuti bobot MySQL (` dan ^ tepat setelah spasi, sebelum _)", () => {
    const mysql = " `^_-,;:!?.'\"()[]{}@*/\\&#%+<=>|~$".split("");
    const acak = [...mysql].reverse();
    expect(urut(acak)).toEqual(mysql);
  });

  it("spasi di ujung diabaikan (PAD SPACE)", () => {
    expect(bandingkanNama("Ani", "Ani   ")).toBeLessThanOrEqual(0);
    expect(kunciNama("Ani  ")).toBe(kunciNama("Ani"));
  });

  it("awalan lebih pendek lebih dulu", () => {
    expect(urut(["Ani Budi", "Ani"])).toEqual(["Ani", "Ani Budi"]);
  });

  it("seri menurut kolasi: byte nama asli (huruf besar dulu), lalu id", () => {
    const daftar = [
      { id: 5, nama: "ani" },
      { id: 2, nama: "Ani" },
      { id: 9, nama: "Ani" },
    ];
    expect(urutkanMenurutNama(daftar).map((x) => x.id)).toEqual([2, 9, 5]);
  });

  it("tidak mengubah daftar asal", () => {
    const daftar = [{ id: 1, nama: "b" }, { id: 2, nama: "a" }];
    urutkanMenurutNama(daftar);
    expect(daftar.map((x) => x.id)).toEqual([1, 2]);
  });
});
