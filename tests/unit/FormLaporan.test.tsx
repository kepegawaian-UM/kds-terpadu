// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/rekap-kehadiran/bulanan" }));

import { BidangFilterRekap, BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";

beforeEach(() => push.mockClear());
afterEach(cleanup);

const STATUS = [
  { kode: "PNS", nama: "Pegawai Negeri Sipil" },
  { kode: "PPPK", nama: "PPPK" },
];

describe("FormLaporan + BidangPeriode (diterapkan otomatis)", () => {
  it("formulir GET tanpa tombol Terapkan; mengganti pilihan langsung berpindah ke alamat dengan query", () => {
    const { container } = render(
      <FormLaporan>
        <BidangPeriode bulan={10} tahun={2026} tahunTersedia={[2026, 2025]} />
      </FormLaporan>
    );
    expect(container.querySelector("form")!.getAttribute("method")).toBe("get");
    expect(screen.queryByRole("button", { name: "Terapkan" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Bulan"), { target: { value: "3" } });
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/rekap-kehadiran/bulanan");
    expect(url.searchParams.get("bulan")).toBe("3");
    expect(url.searchParams.get("tahun")).toBe("2026");
  });

  it("memilih bulan dan tahun terpilih; 12 bulan Indonesia", () => {
    render(<BidangPeriode bulan={10} tahun={2026} tahunTersedia={[2026, 2025]} />);
    const bulan = screen.getByLabelText("Bulan") as HTMLSelectElement;
    expect(bulan.name).toBe("bulan");
    expect(bulan.value).toBe("10");
    expect(Array.from(bulan.options).map((o) => o.text)).toHaveLength(12);
    expect(bulan.options[0].text).toBe("Januari");
    const tahun = screen.getByLabelText("Tahun") as HTMLSelectElement;
    expect(tahun.name).toBe("tahun");
    expect(tahun.value).toBe("2026");
  });

  it("tahun yang dipilih selalu tersedia di daftar walau belum ada datanya, urut menurun tanpa duplikat", () => {
    render(<BidangPeriode bulan={1} tahun={2030} tahunTersedia={[2025, 2026, 2026]} />);
    const tahun = screen.getByLabelText("Tahun") as HTMLSelectElement;
    expect(Array.from(tahun.options).map((o) => o.value)).toEqual(["2030", "2026", "2025"]);
    expect(tahun.value).toBe("2030");
  });

  it("tanpa bulan (laporan tahunan): hanya pilihan tahun", () => {
    render(<BidangPeriode tahun={2026} tahunTersedia={[2026]} />);
    expect(screen.queryByLabelText("Bulan")).toBeNull();
    expect(screen.getByLabelText("Tahun")).toBeTruthy();
  });
});

describe("BidangFilterRekap (dropdown centang)", () => {
  const pasang = (jenis: string[] = [], status: string[] = []) =>
    render(
      <FormLaporan>
        <BidangFilterRekap jenis={jenis} status={status} keaktifan="aktif" daftarStatus={STATUS} />
      </FormLaporan>
    );

  it("ringkasan pilihan di tombol: Semua bila kosong atau semua terpilih, selain itu nama yang dipilih", () => {
    pasang(["DSN"], ["PNS", "PPPK"]);
    expect(screen.getByRole("button", { name: /Jenis/ }).textContent).toContain("Dosen");
    expect(screen.getByRole("button", { name: /Status/ }).textContent).toContain("Semua");
    cleanup();
    pasang([], []);
    expect(screen.getByRole("button", { name: /Jenis/ }).textContent).toContain("Semua");
  });

  it("memakai nama field yang dibaca laporan (jenis, status, keaktifan) dan hanya Dosen/Tendik", async () => {
    pasang(["DSN"], ["PPPK"]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Jenis/ }));
    expect((screen.getByLabelText("Dosen") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Tendik") as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: /Status/ }));
    expect((screen.getByLabelText("PPPK") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Pegawai Negeri Sipil") as HTMLInputElement).checked).toBe(false);
    const opsi = Array.from((screen.getByLabelText("Keaktifan") as HTMLSelectElement).options).map((o) => o.text);
    expect(opsi).toEqual(["Aktif saja", "Non-aktif saja", "Semua"]);
  });

  it("mencentang tidak langsung menerapkan; diterapkan sekali saat dropdown ditutup, dan hanya bila pilihan berubah", async () => {
    pasang(["DSN"], []);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Jenis/ }));
    await user.click(screen.getByLabelText("Tendik"));
    expect(push).not.toHaveBeenCalled(); // masih terbuka

    await user.keyboard("{Escape}");
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0], "http://x");
    expect(url.searchParams.getAll("jenis").sort()).toEqual(["DSN", "TDK"]);
    expect(url.searchParams.get("keaktifan")).toBe("aktif");

    // dibuka lalu ditutup tanpa perubahan: tidak memuat ulang
    await user.click(screen.getByRole("button", { name: /Jenis/ }));
    await user.keyboard("{Escape}");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("klik di luar dropdown juga menerapkan pilihan; pilihan kosong tidak mengirim parameter jenis (= Semua)", async () => {
    pasang(["DSN"], []);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Jenis/ }));
    await user.click(screen.getByLabelText("Dosen")); // dicabut centangnya
    await user.click(document.body);
    expect(push).toHaveBeenCalledTimes(1);
    expect(new URL(push.mock.calls[0][0], "http://x").searchParams.getAll("jenis")).toEqual([]);
  });
});
