// @vitest-environment jsdom
/** Menu "Aplikasi lain" di sidebar: daftar tautan valid, dibuka di tab baru tanpa membocorkan halaman asal, tertutup secara bawaan. */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/app/(app)/Sidebar";
import { APLIKASI_LAIN } from "@/lib/aplikasiLain";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/image", () => ({ default: () => null }));

afterEach(cleanup);

describe("daftar aplikasi lain", () => {
  it("nama terisi dan unik, alamat https dan unik", () => {
    expect(APLIKASI_LAIN.length).toBeGreaterThan(0);
    expect(new Set(APLIKASI_LAIN.map((a) => a.nama)).size).toBe(APLIKASI_LAIN.length);
    expect(new Set(APLIKASI_LAIN.map((a) => a.url)).size).toBe(APLIKASI_LAIN.length);
    for (const a of APLIKASI_LAIN) {
      expect(a.nama.trim()).not.toBe("");
      expect(new URL(a.url).protocol).toBe("https:");
    }
  });
});

describe("Sidebar: Aplikasi lain", () => {
  it("memuat semua tautan sesuai urutan daftar, dibuka di tab baru dengan noopener noreferrer", () => {
    render(<Sidebar userName="Admin SDM" userEmail="a@b.c" onSignOut={async () => {}} />);
    const daftar = screen.getByRole("list", { name: "Aplikasi lain" });
    const tautan = within(daftar).getAllByRole("link", { hidden: true });
    expect(tautan.map((t) => t.getAttribute("href"))).toEqual(APLIKASI_LAIN.map((a) => a.url));
    expect(tautan.map((t) => t.textContent)).toEqual(APLIKASI_LAIN.map((a) => `${a.nama}↗`));
    for (const t of tautan) {
      expect(t.getAttribute("target")).toBe("_blank");
      expect(t.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("tertutup secara bawaan (details tanpa atribut open) dan berada sebelum tombol Panduan", () => {
    const { container } = render(<Sidebar userName="Admin SDM" userEmail="a@b.c" onSignOut={async () => {}} />);
    const details = container.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    const panduan = [...container.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/panduan/index.html")!;
    expect(details.compareDocumentPosition(panduan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
