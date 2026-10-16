// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DokumenRekapIndividual } from "@/components/rekap/DokumenRekapIndividual";
import { PilihanMassal } from "@/components/rekap/PilihanMassal";
import type { KandidatMassal, LaporanIndividual } from "@/lib/laporan/rekapIndividual";

afterEach(cleanup);

const kandidat = (n: number): KandidatMassal[] =>
  Array.from({ length: n }, (_, i) => ({ nip: `${100 + i}`, nama: `Orang ${i}`, jenis: "Dosen", status: "PNS", unit: "Unit", tk: 50 - i, sigma: 200, persen: "25,0%" }));

describe("PilihanMassal", () => {
  const tampil = (n: number, maks = 3) =>
    render(<PilihanMassal kandidat={kandidat(n)} maks={maks} tahun={2026} minTk={20} keaktifan="aktif" jenis={["DSN"]} status={[]} />);

  it("memilih otomatis maks teratas; tautan memuat NIP terpilih dan filter", () => {
    tampil(5);
    expect(screen.getByText(/5/, { selector: "b" }).textContent).toBe("5");
    const cetak = screen.getByRole("link", { name: /Cetak Semua/ }) as HTMLAnchorElement;
    const q = new URL(cetak.href).searchParams;
    expect(q.getAll("nip")).toEqual(["100", "101", "102"]);
    expect(q.get("tahun")).toBe("2026");
    expect(q.get("min_tk")).toBe("20");
    expect(q.get("keaktifan")).toBe("aktif");
    expect(q.getAll("jenis")).toEqual(["DSN"]);
    expect(cetak.target).toBe("_blank");
    expect((screen.getByRole("link", { name: /Unduh Excel/ }) as HTMLAnchorElement).href).toContain("/massal/excel?");
  });

  it("mencentang melebihi batas menonaktifkan tombol; tanpa pilihan juga nonaktif", () => {
    tampil(5);
    fireEvent.click(screen.getByLabelText("Pilih Orang 3"));
    fireEvent.click(screen.getByLabelText("Pilih Orang 4"));
    expect(screen.getByText(/maksimal 3 per cetak/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Cetak Semua/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("Pilih semua")); // semua (5) tercentang -> klik mengosongkan
    expect(screen.queryByRole("link", { name: /Unduh Excel/ })).toBeNull();
    expect(screen.getByText("Dipilih:", { exact: false }).textContent).toMatch(/Dipilih: 0/);
  });

  it("daftar kosong menampilkan petunjuk", () => {
    tampil(0);
    expect(screen.getByText(/Tidak ada pegawai yang memenuhi kriteria/)).toBeTruthy();
  });
});

describe("DokumenRekapIndividual", () => {
  const bulan = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [i + 1, i === 0 ? { ada: true, nama: "Januari", sigma: 20, masuk: 17, persen: "85,0%", nilai: { TD: 3, TK: 0 }, tanda: {} } : { ada: false, nama: `Bulan ${i + 1}` }]),
  );
  const laporan = {
    nip: "198001012005011234", tahun: 2026,
    identitas: { nama: "Budi Santoso", nip: "198001012005011234", jenis: "Dosen", status: "PNS", golongan: "III/a", jabatan: "Lektor", unit: "Fakultas Ilmu Pendidikan", unitInduk: "Fakultas" },
    statusKeluar: "Pensiun", bulan, total: { SIGMA_HARI: 20, JUMLAH_MASUK_NYATA: 17, I: 0, S: 0, SD: 0, TD: 3, TB: 0, TK: 0, CTH: 0, CTM: 0, CTB: 0, CAP: 0, CTLN: 0 },
    persenTotal: "85,0%", bulanTerekam: 1, keteranganKoreksi: ["Januari 2026: seluruh TK dipindahkan ke TB (uji)."],
  } as unknown as LaporanIndividual;

  it("memuat kop surat, identitas, baris bulan (ada/tidak ada), jumlah, ringkasan, dan keterangan", () => {
    const { container } = render(<DokumenRekapIndividual laporan={laporan} tanggalCetak="13 Oktober 2026" />);
    expect(screen.getByText("ABSENSI PEGAWAI TAHUN 2026")).toBeTruthy();
    expect(screen.getByText("UNIVERSITAS NEGERI MALANG (UM)")).toBeTruthy();
    expect(screen.getByAltText("Logo Universitas Negeri Malang")).toBeTruthy();
    expect(screen.getByText("Fakultas Ilmu Pendidikan, Fakultas")).toBeTruthy();
    expect(screen.getByText("Pensiun")).toBeTruthy(); // keterangan status keluar
    expect(screen.getByText("2026 (data absensi tersedia 1 dari 12 bulan)")).toBeTruthy();
    expect(screen.getAllByText("Belum ada absensi")).toHaveLength(11);
    const januari = screen.getByText("Januari").closest("tr")!;
    expect(within(januari).getByText("85,0%")).toBeTruthy();
    expect(within(januari).getAllByText("-").length).toBe(10); // 10 komponen bernilai 0 ditampilkan "-"
    expect(within(januari).getByText("3").className).toContain("tebal");
    expect(screen.getByText("Jumlah (1 bulan)")).toBeTruthy();
    expect(screen.getByText("Dicetak 13 Oktober 2026")).toBeTruthy();
    // seperti KDS2, keterangan koreksi TIDAK dicetak di dokumen resmi
    expect(container.textContent).not.toContain("seluruh TK dipindahkan");
  });

  it("tanpa catatan status keluar, baris Keterangan tidak ada", () => {
    render(<DokumenRekapIndividual laporan={{ ...laporan, statusKeluar: null }} tanggalCetak="x" />);
    expect(screen.queryByText("Keterangan", { selector: "td" })).toBeNull();
  });
});
