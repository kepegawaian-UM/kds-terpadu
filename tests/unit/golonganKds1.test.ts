/** Perencanaan koreksi golongan Non-ASN dari riwayat KDS1 (lib/migrasi/golonganKds1.ts): data sintetis. */
import { describe, expect, it } from "vitest";

import { type BarisKds1, type BarisTarget, rencanakanKoreksiGolongan } from "@/lib/migrasi/golonganKds1";

const ctx = { kategoriStatus: new Map([["PNS", "ASN"], ["PTNA", "Non-ASN"], ["CPTNA", "Non-ASN"], ["PTT", "Non-ASN"], ["AKL", "Non-ASN"]]), golonganMaster: new Set(["II/a", "II/b", "III/a", "III/b"]) };
const k = (nip: string, status: string, golongan: string | null, bulan = 9): BarisKds1 => ({ nip, bulan, tahun: 2026, status, golongan });
let id = 0;
const t = (nip: string, status: string, golongan: string | null, bulan = 9): BarisTarget => ({ id: ++id, nip, bulan, tahun: 2026, status, golongan });

describe("rencanakanKoreksiGolongan", () => {
  it("Non-ASN yang beda diubah mengikuti KDS1 (termasuk kosong menjadi isi); yang sama dihitung; ASN tidak disentuh", () => {
    const r = rencanakanKoreksiGolongan(
      [k("1", "PTNA", "II/b"), k("2", "CPTNA", "III/b"), k("3", "PTNA", "II/a"), k("4", "PNS", "III/b")],
      [t("1", "PTNA", "II/a"), t("2", "CPTNA", null), t("3", "PTNA", "II/a"), t("4", "PNS", "III/a")],
      ctx,
    );
    expect(r.perubahan.map((p) => [p.lama, p.baru])).toEqual([["II/a", "II/b"], [null, "III/b"]]);
    expect(r.sudahSama).toBe(1);
    expect(r.perBulan.get("2026-09")).toEqual({ diubah: 2, kosongMenjadiIsi: 1 });
    expect([...r.pasangan.entries()]).toEqual([["II/a -> II/b", 1], ["kosong -> III/b", 1]]);
    expect(r.dilewati.size).toBe(0);
  });

  it("dilewati dengan alasan: status beda, golongan KDS1 kosong atau tak sah, tidak ada di KDS1; tidak pernah dikosongkan", () => {
    const r = rencanakanKoreksiGolongan(
      [k("1", "PTNA", "II/b"), k("2", "PTNA", null), k("3", "PTNA", "X/z"), k("5", "PTNA", "  ")],
      [t("1", "CPTNA", "II/a"), t("2", "PTNA", "II/a"), t("3", "PTNA", "II/a"), t("4", "PTNA", "II/a"), t("5", "PTNA", "II/a")],
      ctx,
    );
    expect(r.perubahan).toEqual([]);
    expect(Object.fromEntries(r.dilewati)).toEqual({
      "status kepegawaian beda antara KDS1 dan target": 1,
      "golongan KDS1 kosong (target tidak dikosongkan)": 2,
      "golongan KDS1 tidak ada di master": 1,
      "tidak ada di KDS1 untuk bulan itu": 1,
    });
  });

  it("pencocokan per bulan dan tahun: NIP yang sama di bulan lain tidak tertukar", () => {
    const r = rencanakanKoreksiGolongan([k("1", "PTNA", "II/b", 8), k("1", "PTNA", "III/a", 9)], [t("1", "PTNA", "II/a", 8), t("1", "PTNA", "II/a", 9)], ctx);
    expect(r.perubahan.map((p) => [p.bulan, p.baru])).toEqual([[8, "II/b"], [9, "III/a"]]);
  });

  it("menjalankan ulang setelah koreksi: tidak ada perubahan lagi", () => {
    const awal = [t("1", "PTNA", "II/a")];
    const r1 = rencanakanKoreksiGolongan([k("1", "PTNA", "II/b")], awal, ctx);
    const sesudah = awal.map((b) => ({ ...b, golongan: r1.perubahan.find((p) => p.id === b.id)?.baru ?? b.golongan }));
    const r2 = rencanakanKoreksiGolongan([k("1", "PTNA", "II/b")], sesudah, ctx);
    expect(r2.perubahan).toEqual([]);
    expect(r2.sudahSama).toBe(1);
  });
});
