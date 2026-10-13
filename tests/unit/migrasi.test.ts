import { describe, expect, it } from "vitest";

import { bagi, BATAS_PARAMETER, TABEL_DOMAIN, ukuranChunk } from "../../scripts/migrasi/tabel";
import { epochKeDate, konversiNilai, tanggalKeDate } from "../../scripts/migrasi/sumber";

const jumlahParameter = (t: (typeof TABEL_DOMAIN)[number]) =>
  t.kolom.length + Object.keys(t.tambahan ?? {}).length;

describe("bagi / ukuranChunk", () => {
  it("memecah daftar menjadi potongan", () => {
    expect(bagi([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(bagi([], 3)).toEqual([]);
  });
  it("menolak ukuran tidak sah", () => {
    expect(() => bagi([1], 0)).toThrow();
    expect(() => bagi([1], 1.5)).toThrow();
  });
  it("tidak pernah melewati batas parameter bind PostgreSQL (65.535) untuk tabel manapun", () => {
    for (const t of TABEL_DOMAIN) {
      const baris = ukuranChunk(jumlahParameter(t));
      expect(baris).toBeGreaterThanOrEqual(1);
      expect(baris * jumlahParameter(t)).toBeLessThanOrEqual(BATAS_PARAMETER);
    }
  });
});

describe("definisi tabel", () => {
  it("setiap tabel punya kolom kunci yang terdaftar", () => {
    for (const t of TABEL_DOMAIN) {
      expect(t.kolom.map((c) => c.pg)).toContain(t.kunci);
    }
  });
  it("urutan memenuhi foreign key (induk sebelum anak)", () => {
    const urut = TABEL_DOMAIN.map((t) => t.mysql);
    const sebelum = (a: string, b: string) => expect(urut.indexOf(a)).toBeLessThan(urut.indexOf(b));
    sebelum("pegawai", "nominatif_bulanan");
    sebelum("upload_batch", "nominatif_bulanan");
    sebelum("nominatif_bulanan", "nominatif_bulanan_jabatan_tambahan");
    sebelum("rekap_kehadiran_bulanan", "rekap_kehadiran_detail");
    sebelum("upload_batch", "upload_error_rows");
    sebelum("pegawai", "koreksi_rekap");
  });
});

describe("konversi nilai MySQL -> JavaScript", () => {
  it("epoch detik -> instan UTC persis", () => {
    // 2026-10-13 09:53:50 WIB = 02:53:50 UTC
    expect(epochKeDate(1_791_860_030)?.toISOString()).toBe("2026-10-13T02:53:50.000Z");
    expect(epochKeDate(null)).toBeNull();
  });
  it("tanggal murni -> tengah malam UTC (tidak bergeser oleh zona waktu)", () => {
    expect(tanggalKeDate("2026-01-31")?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(tanggalKeDate(null)).toBeNull();
  });
  it("konversiNilai per tipe, null tetap null", () => {
    expect(konversiNilai("int", "12")).toBe(12);
    expect(konversiNilai("str", 5)).toBe("5");
    expect(konversiNilai("str", null)).toBeNull();
    expect(konversiNilai("int", null)).toBeNull();
    expect((konversiNilai("ts", 0) as Date).toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });
  it("menolak tanggal yang bukan YYYY-MM-DD (mis. nol-MySQL)", () => {
    expect(() => tanggalKeDate("0000-00-00")).toThrow(/tanggal tidak sah/i);
    expect(() => tanggalKeDate("13/10/2026")).toThrow(/tanggal tidak sah/i);
  });
});
