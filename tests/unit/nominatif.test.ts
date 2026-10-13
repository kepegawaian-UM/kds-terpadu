import { describe, expect, it } from "vitest";

import { dasarRemunerasi } from "@/lib/domain/dasarRemunerasi";
import { formatTanggal } from "@/lib/laporan/format";
import { namaFileNominatif } from "@/lib/laporan/nominatif";

const kosong = {
  jenisPegawaiKode: "DSN",
  jabatanTambahan: [],
  jabatanFungsionalDosen: null,
  jabatanFungsionalTendik: null,
  jabatanFungsiUmum: null,
};

describe("dasarRemunerasi (port DasarRemunerasiResolver)", () => {
  it("prioritas 1: Jabatan Tambahan slot pertama (id terkecil), walau ada jabatan fungsional", () => {
    const hasil = dasarRemunerasi({
      ...kosong,
      jabatanFungsionalDosen: { nama: "Lektor" },
      jabatanTambahan: [
        { id: 9, role: { namaRole: "Sekretaris Jurusan" } },
        { id: 4, role: { namaRole: "Ketua Jurusan" } },
      ],
    });
    expect(hasil).toEqual({ sumber: "Jabatan Tambahan", nama: "Ketua Jurusan" });
  });

  it("Jabatan Tambahan tanpa role tetap dipakai dengan nama null (seperti KDS2)", () => {
    expect(dasarRemunerasi({ ...kosong, jabatanTambahan: [{ id: 1, role: null }] })).toEqual({
      sumber: "Jabatan Tambahan",
      nama: null,
    });
  });

  it("prioritas 2: Jabatan Fungsional Dosen untuk DSN", () => {
    expect(dasarRemunerasi({ ...kosong, jabatanFungsionalDosen: { nama: "Lektor Kepala" } })).toEqual({
      sumber: "Jabatan Fungsional",
      nama: "Lektor Kepala",
    });
  });

  it("Tendik: fungsional 'pokok (jenjang)', lalu fungsi umum pelaksana", () => {
    const tdk = { ...kosong, jenisPegawaiKode: "TDK" };
    expect(dasarRemunerasi({ ...tdk, jabatanFungsionalTendik: { jabatanPokok: "Pustakawan", jenjang: "Ahli Madya" } })).toEqual({
      sumber: "Jabatan Fungsional",
      nama: "Pustakawan (Ahli Madya)",
    });
    expect(dasarRemunerasi({ ...tdk, jabatanFungsiUmum: { nama: "Pengadministrasi Perkantoran" } })).toEqual({
      sumber: "Jabatan Fungsi Umum Pelaksana",
      nama: "Pengadministrasi Perkantoran",
    });
  });

  it("jabatan fungsional dosen tidak dihitung untuk Tendik (dan sebaliknya)", () => {
    expect(dasarRemunerasi({ ...kosong, jenisPegawaiKode: "TDK", jabatanFungsionalDosen: { nama: "Lektor" } })).toBeNull();
    expect(
      dasarRemunerasi({ ...kosong, jenisPegawaiKode: "DSN", jabatanFungsionalTendik: { jabatanPokok: "X", jenjang: "Y" } })
    ).toBeNull();
  });

  it("Akademisi Luar tidak punya dasar remunerasi", () => {
    expect(dasarRemunerasi({ ...kosong, jenisPegawaiKode: "AKL", jabatanFungsionalDosen: { nama: "Lektor" } })).toBeNull();
  });
});

describe("formatTanggal", () => {
  it("dd-mm-yyyy dari tanggal murni (UTC), tanpa bergeser zona waktu", () => {
    expect(formatTanggal(new Date("2026-01-31T00:00:00.000Z"))).toBe("31-01-2026");
    expect(formatTanggal(new Date("1990-05-07T00:00:00.000Z"))).toBe("07-05-1990");
  });
  it("tahun dipadatkan 4 digit seperti 'Y' PHP (data sumber punya tanggal lahir bertahun < 1000)", () => {
    expect(formatTanggal(new Date("0999-01-01T00:00:00.000Z"))).toBe("01-01-0999");
    expect(formatTanggal(new Date("0099-12-31T00:00:00.000Z"))).toBe("31-12-0099");
  });
  it("null/undefined -> null", () => {
    expect(formatTanggal(null)).toBeNull();
    expect(formatTanggal(undefined)).toBeNull();
  });
});

describe("namaFileNominatif", () => {
  it("nama tab + periode, tanpa filter", () => {
    expect(namaFileNominatif(10, 2026)).toBe("Detail Pegawai Oktober 2026");
    expect(namaFileNominatif(3, 2025)).toBe("Detail Pegawai Maret 2025");
  });
});
