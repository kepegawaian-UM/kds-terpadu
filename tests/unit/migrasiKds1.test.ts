/** Terjemahan Kamus Koreksi KDS1 ke master KDS Terpadu (F4.5c). Master sintetis; tidak ada data pegawai. */
import { describe, expect, it } from "vitest";

import { buatPenerjemah, type KamusKds1, type MasterLengkap } from "@/lib/migrasi/kds1";

const kosong: MasterLengkap = { golongan: [], status: [], dosen: [], tendik: [], umum: [], kategori: [], unit: [], prodi: [], role: [] };
const asal: MasterLengkap = {
  ...kosong,
  status: [{ kode: "ST-1", nama: "Pegawai Negeri Sipil" }],
  dosen: [{ kode: "DSN-00", nama: "Tenaga Pengajar" }, { kode: "DSN-02", nama: "Lektor" }, { kode: "DSN-99", nama: "Belum Diketahui" }],
  unit: [
    { kode: "UA-001", nama: "Fakultas A" },
    { kode: "UA-100", nama: "Fakultas Geser" }, // kode sama di tujuan, tetapi nama berbeda
    { kode: "UA-206", nama: "Asrama X" }, // hanya di KDS1
    { kode: "UA-214", nama: "S1 Pendidikan Y" }, // prodi yang dulu disimpan sebagai unit
  ],
  prodi: [{ kode: "PRD-001", nama: "S1 Pendidikan Y" }],
  role: [{ kode: "JBT-01", nama: "Dekan" }],
};
const tujuan: MasterLengkap = {
  ...kosong,
  status: [{ kode: "ST-1", nama: "Pegawai Negeri Sipil" }],
  dosen: [{ kode: "DSN-00", nama: "Tenaga Dosen" }, { kode: "DSN-02", nama: "Lektor" }],
  unit: [{ kode: "UA-001", nama: "Fakultas A" }, { kode: "UA-100", nama: "Unit Lain" }, { kode: "UA-050", nama: "Fakultas Geser" }],
  prodi: [{ kode: "PRD-009", nama: "S1 Pendidikan Y" }],
  role: [{ kode: "JBT-01", nama: "Dekan" }],
};
const terjemah = buatPenerjemah(asal, tujuan);
const entri = (jenisField: string, nilaiResolusi: string): KamusKds1 => ({ id: "x", jenisField, kunciMentah: "kunci", nilaiResolusi, catatan: null, dibuatPada: new Date("2026-01-02T03:04:05Z") });
const hasil = (jenisField: string, nilai: string) => {
  const t = terjemah(entri(jenisField, nilai));
  return t.ok ? t.hasil.nilaiResolusi : `TOLAK: ${t.alasan}`;
};

describe("terjemahan kamus KDS1", () => {
  it("kode dan nama sama dipakai apa adanya; kode sama tetapi nama beda diterjemahkan lewat nama", () => {
    expect(hasil("StatusKepegawaian", "ST-1")).toBe("ST-1");
    expect(hasil("UnitKerja", "UA-001")).toBe("UA-001");
    expect(hasil("UnitKerja", "UA-100")).toBe("UA-050");
  });

  it("nama jabatan dosen yang diganti (Tenaga Pengajar menjadi Tenaga Dosen) dipetakan; yang tak punya padanan ditolak dengan alasan", () => {
    expect(hasil("JabatanFungsionalDosen", "DSN-00")).toBe("DSN-00");
    expect(hasil("JabatanFungsionalDosen", "DSN-99")).toMatch(/^TOLAK: .*tidak punya padanan nama/);
    expect(hasil("UnitKerja", "UA-206")).toMatch(/^TOLAK: .*"UA-206".*tidak punya padanan/);
    expect(hasil("UnitKerja", "UA-999")).toMatch(/^TOLAK: kode UA-999 tidak ada/);
  });

  it("jabatan tambahan: semua slot diterjemahkan, NONE dipertahankan, unit yang dulu program studi dialihkan ke PRODI", () => {
    expect(hasil("JabatanTambahan", "JBT-01|UNIT:UA-100|Definitif;JBT-01|NONE|Plt")).toBe("JBT-01|UNIT:UA-050|Definitif;JBT-01|NONE|Plt");
    expect(hasil("JabatanTambahan", "JBT-01|UNIT:UA-214|Pjs")).toBe("JBT-01|PRODI:PRD-009|Pjs");
    expect(hasil("JabatanTambahan", "JBT-01|PRODI:PRD-001|Definitif")).toBe("JBT-01|PRODI:PRD-009|Definitif");
  });

  it("jabatan tambahan yang rusak atau tak bisa diterjemahkan ditolak utuh (tidak ada slot parsial)", () => {
    expect(hasil("JabatanTambahan", "JBT-01|UNIT:UA-001")).toMatch(/^TOLAK: bentuk/);
    expect(hasil("JabatanTambahan", "JBT-01|UNIT:UA-001|Definitif;JBT-01|UNIT:UA-206|Plt")).toMatch(/^TOLAK: /);
    expect(hasil("JabatanTambahan", "JBT-77|NONE|Definitif")).toMatch(/^TOLAK: kode JBT-77/);
    expect(hasil("JabatanTambahan", "JBT-01|LAIN:1|Definitif")).toMatch(/^TOLAK: target/);
  });

  it("klasifikasi hanya menerima tiga kelompok, jenis dikecualikan permanen disalin, jenis tak dikenal ditolak; metadata terbawa", () => {
    expect(hasil("Klasifikasi", "Dosen")).toBe("Dosen");
    expect(hasil("Klasifikasi", "Lain")).toMatch(/^TOLAK: kelompok/);
    expect(hasil("PegawaiDikecualikanPermanen", "Dikecualikan permanen")).toBe("Dikecualikan permanen");
    expect(hasil("JenisBaru", "x")).toMatch(/^TOLAK: jenis/);
    const t = terjemah({ ...entri("StatusKepegawaian", "ST-1"), catatan: "cat" });
    expect(t.ok && t.hasil).toMatchObject({ jenisField: "StatusKepegawaian", kunciMentah: "kunci", catatan: "cat", dibuatPada: new Date("2026-01-02T03:04:05Z") });
  });
});
