// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelAnomali, perluKonfirmasi } from "@/components/upload/PanelAnomali";
import type { Anomali } from "@/lib/impor/anomaliAbsensi";

afterEach(cleanup);

const A = (tingkat: Anomali["tingkat"], nip: string, pesan = "pesan"): Anomali => ({ nomorBaris: 5, nip, nama: `Nama ${nip}`, tingkat, kode: "k", pesan });

describe("perluKonfirmasi", () => {
  it("hanya bila ada peringatan Penting", () => {
    expect(perluKonfirmasi([])).toBe(false);
    expect(perluKonfirmasi([A("sedang", "1"), A("info", "2")])).toBe(false);
    expect(perluKonfirmasi([A("info", "1"), A("penting", "2")])).toBe(true);
  });
});

describe("PanelAnomali", () => {
  it("tanpa anomali tidak menampilkan apa pun", () => {
    const { container } = render(<PanelAnomali anomali={[]} total={0} dikonfirmasi={false} saatKonfirmasi={() => {}} namaBerkas="x.xlsx" />);
    expect(container.innerHTML).toBe("");
  });

  it("menampilkan jumlah per tingkat, baris Penting (NIP, nama, pesan), dan kotak konfirmasi yang memanggil balikan", () => {
    const saat = vi.fn();
    render(
      <PanelAnomali anomali={[A("penting", "111", "TOTAL 20 terisi"), A("sedang", "222"), A("info", "333")]} total={3} dikonfirmasi={false} saatKonfirmasi={saat} namaBerkas="Presensi Juni.xlsx" />,
    );
    expect(screen.getByText("1 penting")).toBeTruthy();
    expect(screen.getByText("1 sedang")).toBeTruthy();
    expect(screen.getByText("1 info")).toBeTruthy();
    expect(screen.getByText("TOTAL 20 terisi")).toBeTruthy();
    expect(screen.getByText("111")).toBeTruthy();
    expect(screen.getByText("Nama 111")).toBeTruthy();
    const kotak = screen.getByRole("checkbox") as HTMLInputElement;
    expect(kotak.checked).toBe(false);
    fireEvent.click(kotak);
    expect(saat).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: /Unduh daftar/ })).toBeTruthy();
  });

  it("tanpa Penting tidak ada kotak konfirmasi; yang sedang terbuka otomatis", () => {
    const { container } = render(<PanelAnomali anomali={[A("sedang", "222"), A("info", "333")]} total={2} dikonfirmasi={false} saatKonfirmasi={() => {}} namaBerkas="x.xlsx" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.querySelectorAll("details")[0].open).toBe(true); // sedang
    expect(container.querySelectorAll("details")[1].open).toBe(false); // info
  });

  it("memberi tahu bila daftar dipotong", () => {
    render(<PanelAnomali anomali={[A("info", "1")]} total={900} dikonfirmasi={false} saatKonfirmasi={() => {}} namaBerkas="x.xlsx" />);
    expect(screen.getByText(/Menampilkan 1 dari 900/)).toBeTruthy();
  });
});
