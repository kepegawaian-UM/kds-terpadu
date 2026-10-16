// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BersihkanBerkas } from "@/components/simpega/BersihkanBerkas";
import { KOLOM_WAJIB_REKAP } from "@/lib/excel/parseRekapPegawai";

const ZW = String.fromCharCode(0x200c);
const SENSITIF = ["NIK", "Nama Ibu Kandung", "No HP", "Alamat KTP", "Gaji Pokok"];

async function berkasMentah(jumlah = 6): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Worksheet");
  const kolom = [SENSITIF[0], ...KOLOM_WAJIB_REKAP.slice(0, 5), SENSITIF[1], SENSITIF[2], ...KOLOM_WAJIB_REKAP.slice(5), "Jabatan Remunerasi", ...SENSITIF.slice(3)];
  ws.addRow(kolom.map((k) => `${ZW}${k}`));
  for (let i = 0; i < jumlah; i++) {
    ws.addRow(
      kolom.map((k) => {
        if (SENSITIF.includes(k)) return `${ZW}RAHASIA-${k.replace(/\W/g, "")}-${i}`;
        if (k === "NIP") return `${ZW}19900101202001${String(1000 + i)}`;
        if (k === "Tanggal Masuk") return `${ZW}2015-04-01`;
        return `${ZW}${k} ${i}`;
      }),
    );
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** jsdom tidak punya Blob.arrayBuffer / URL.createObjectURL: dipasang pengganti sederhana. */
function jadiFile(isi: Uint8Array, nama: string): File {
  const f = new File([isi as BlobPart], nama);
  Object.defineProperty(f, "arrayBuffer", { value: async () => isi.buffer.slice(isi.byteOffset, isi.byteOffset + isi.byteLength) });
  return f;
}

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", vi.fn(() => ({ open: fetchSpy, send: fetchSpy })));
  URL.createObjectURL = vi.fn(() => "blob:uji");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pilih = (f: File) => fireEvent.change(screen.getByLabelText(/Berkas Rekap Pegawai/), { target: { files: [f] } });

describe("BersihkanBerkas (di browser)", () => {
  it("membersihkan: ringkasan angka, tautan unduh _bersih, TANPA permintaan jaringan dan tanpa isi sensitif di halaman", async () => {
    const { container } = render(<BersihkanBerkas />);
    pilih(jadiFile(await berkasMentah(6), "REKAP_PEGAWAI.xlsx"));

    await waitFor(() => expect(screen.getByText("kolom dibuang")).toBeTruthy(), { timeout: 15_000 });
    expect(screen.getByText("baris pegawai").previousElementSibling!.textContent).toBe("6");
    expect(screen.getByText("kolom dibuang").previousElementSibling!.textContent).toBe(String(SENSITIF.length));
    const unduh = screen.getByRole("link", { name: /Unduh REKAP_PEGAWAI_bersih\.xlsx/ });
    expect(unduh.getAttribute("download")).toBe("REKAP_PEGAWAI_bersih.xlsx");
    expect(unduh.getAttribute("href")).toBe("blob:uji");

    expect(fetchSpy).not.toHaveBeenCalled(); // tidak ada fetch/XHR: berkas tidak dikirim ke mana pun
    expect(container.innerHTML).not.toMatch(/RAHASIA/); // isi sel sensitif tidak pernah dirender
    expect(container.textContent).toContain("Jabatan Remunerasi"); // nama kolom dipertahankan ditampilkan
  }, 30_000);

  it("menolak berkas bukan .xlsx dan berkas yang bukan format REKAP_PEGAWAI, dengan pesan jelas", async () => {
    render(<BersihkanBerkas />);
    pilih(new File(["x"], "data.csv"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/\.xlsx/);

    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A").addRow(["NIP", "Nama"]);
    const salah = new Uint8Array(await wb.xlsx.writeBuffer());
    pilih(jadiFile(salah, "pegawai.xlsx"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/bukan format REKAP_PEGAWAI/), { timeout: 15_000 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Unduh/ })).toBeNull();
  }, 30_000);
});
