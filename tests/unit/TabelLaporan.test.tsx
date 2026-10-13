// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TabelLaporan, type KolomLaporan } from "@/components/laporan/TabelLaporan";

type Baris = { id: number; nip: string; nama: string; tk: number };

// 25 baris sintetis; tk sengaja campuran supaya urutan angka (bukan teks) terlihat.
const DATA: Baris[] = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  nip: `9000000000000000${String(i + 1).padStart(2, "0")}`,
  nama: i === 4 ? "Ani Wijaya" : i === 7 ? "Budi Aniwati" : `Pegawai ${String.fromCharCode(65 + (i % 26))}${i}`,
  tk: [3, 10, 9, 0, 25, 2, 100, 1, 8, 7, 6, 5, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22][i],
}));

const KOLOM: KolomLaporan<Baris>[] = [
  { id: "nip", header: "NIP", nilai: (b) => b.nip },
  { id: "nama", header: "Nama", nilai: (b) => b.nama },
  { id: "tk", header: "TK", nilai: (b) => b.tk, numerik: true },
  { id: "aksi", header: "Aksi", nilai: () => "Koreksi", tanpaEkspor: true },
];

const isiTabel = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));

function pasang(props: Partial<React.ComponentProps<typeof TabelLaporan<Baris>>> = {}) {
  return render(
    <TabelLaporan kolom={KOLOM} data={DATA} kunciBaris={(b) => b.id} namaFile="Uji Laporan Oktober 2026" {...props} />
  );
}

afterEach(cleanup);

describe("TabelLaporan", () => {
  it("menampilkan 10 baris pertama menurut urutan dari server (tanpa urut awal) dan ringkasan jumlah", () => {
    pasang();
    const baris = isiTabel();
    expect(baris).toHaveLength(10);
    expect(baris[0][1]).toBe("9000000000000000" + "01"); // kolom 0 = nomor, kolom 1 = NIP
    expect(screen.getByText(/Menampilkan 1–10 dari 25/)).toBeTruthy();
  });

  it("nomor urut tetap mengikuti urutan data asal, bukan urutan tampilan", async () => {
    pasang();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: /^TK/ })); // urut naik: tk 0 lebih dulu
    const pertama = isiTabel()[0];
    expect(pertama[0]).toBe("4"); // baris asal ke-4 (tk = 0)
  });

  it("jumlah per halaman dapat diubah, termasuk Semua; ada navigasi halaman", async () => {
    pasang();
    const u = userEvent.setup();
    expect(screen.getByText(/Halaman 1 dari 3/)).toBeTruthy();
    await u.selectOptions(screen.getByLabelText(/Tampilkan/), "25");
    expect(isiTabel()).toHaveLength(25);
    await u.selectOptions(screen.getByLabelText(/Tampilkan/), "semua");
    expect(isiTabel()).toHaveLength(25);
    await u.selectOptions(screen.getByLabelText(/Tampilkan/), "10");
    await u.click(screen.getByRole("button", { name: "Berikutnya" }));
    expect(screen.getByText(/Menampilkan 11–20 dari 25/)).toBeTruthy();
  });

  it("pencarian: semua kata harus cocok, tidak peka huruf besar/kecil; ringkasan menyebut total", async () => {
    pasang();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Cari:"), "ANI w");
    const baris = isiTabel();
    expect(baris).toHaveLength(2); // "Ani Wijaya" dan "Budi Aniwati"
    expect(screen.getByText(/difilter dari 25/)).toBeTruthy();
  });

  it("pencarian tidak mencocokkan kolom yang tidak diekspor (Aksi)", async () => {
    pasang();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Cari:"), "koreksi");
    expect(screen.getByText(/Tidak ada data yang cocok/)).toBeTruthy();
  });

  it("urut angka secara numerik (9 sebelum 10) dan klik ulang membalik", async () => {
    pasang({ ukuranHalamanAwal: 25 });
    const u = userEvent.setup();
    const tombol = screen.getByRole("button", { name: /^TK/ });
    await u.click(tombol);
    const naik = isiTabel().map((r) => Number(r[3]));
    expect(naik).toEqual([...naik].sort((a, b) => a - b));
    expect(naik.indexOf(9)).toBeLessThan(naik.indexOf(10));
    await u.click(tombol);
    const turun = isiTabel().map((r) => Number(r[3]));
    expect(turun).toEqual([...naik].reverse());
  });

  it("urut teks mengikuti pembanding nama KDS2 (tanpa peka huruf besar/kecil)", async () => {
    pasang({
      data: [
        { id: 1, nip: "1", nama: "budi", tk: 0 },
        { id: 2, nip: "2", nama: "Andi", tk: 0 },
        { id: 3, nip: "3", nama: "Carla", tk: 0 },
      ],
    });
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: /^Nama/ }));
    expect(isiTabel().map((r) => r[2])).toEqual(["Andi", "budi", "Carla"]);
  });

  it("Salin: menyalin hasil terfilter+terurut, tanpa kolom Aksi dan tanpa kolom nomor", async () => {
    pasang();
    const u = userEvent.setup(); // memasang stub clipboard; pasang pengintai sesudahnya
    const salin = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await u.type(screen.getByLabelText("Cari:"), "aniwati");
    await u.click(screen.getByRole("button", { name: "Salin" }));
    const dipanggil = salin.mock.calls[0][0];
    const baris = dipanggil.split("\n");
    expect(baris[0]).toBe("NIP\tNama\tTK");
    expect(baris).toHaveLength(2);
    expect(baris[1]).toContain("Budi Aniwati");
    expect(dipanggil).not.toContain("Koreksi");
  });

  it("CSV: mengunduh semua baris hasil filter (lintas halaman) dengan nama file sesuai", async () => {
    let blobTeks = "";
    let namaUnduh = "";
    const urlBuat = vi.fn((b: Blob) => {
      void b.text().then((t) => (blobTeks = t));
      return "blob:uji";
    });
    Object.assign(URL, { createObjectURL: urlBuat, revokeObjectURL: vi.fn() });
    const klik = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      namaUnduh = this.download;
    });
    pasang();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "CSV" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(namaUnduh).toBe("Uji Laporan Oktober 2026.csv");
    expect(blobTeks.split("\r\n")).toHaveLength(26); // judul + 25 baris, bukan hanya halaman pertama
    klik.mockRestore();
  });

  it("Excel: tautan unduh server dengan href yang diberikan", () => {
    pasang({ urlExcel: "/nominatif/export?bulan=10&tahun=2026" });
    const a = screen.getByRole("link", { name: "Excel" });
    expect(a.getAttribute("href")).toBe("/nominatif/export?bulan=10&tahun=2026");
  });

  it("tanpa urlExcel, tidak ada tombol Excel", () => {
    pasang();
    expect(screen.queryByRole("link", { name: "Excel" })).toBeNull();
  });

  it("kelasBaris dan render kustom dipakai di sel", () => {
    pasang({
      kolom: [{ ...KOLOM[0], render: (b) => <b data-testid="tebal">{b.nip}</b> }, ...KOLOM.slice(1)],
      kelasBaris: (b) => (b.id === 1 ? "baris-khusus" : ""),
    });
    expect(screen.getAllByTestId("tebal")).toHaveLength(10);
    expect(document.querySelector("tr.baris-khusus")).not.toBeNull();
  });

  it("data kosong menampilkan pesan, tanpa galat", () => {
    pasang({ data: [] });
    expect(screen.getByText(/Tidak ada data/)).toBeTruthy();
  });
});
