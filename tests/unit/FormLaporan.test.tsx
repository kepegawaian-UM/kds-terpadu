// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BidangFilterRekap, BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";

afterEach(cleanup);

const STATUS = [
  { kode: "PNS", nama: "Pegawai Negeri Sipil" },
  { kode: "PPPK", nama: "PPPK" },
];

describe("FormLaporan + BidangPeriode", () => {
  it("formulir GET (tautan dapat dibagikan) dengan tombol Terapkan", () => {
    const { container } = render(
      <FormLaporan>
        <BidangPeriode bulan={10} tahun={2026} tahunTersedia={[2026, 2025]} />
      </FormLaporan>
    );
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getByRole("button", { name: "Terapkan" })).toBeTruthy();
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

describe("BidangFilterRekap", () => {
  it("mencentang jenis dan status terpilih serta memilih keaktifan", () => {
    render(<BidangFilterRekap jenis={["DSN"]} status={["PPPK"]} keaktifan="semua" daftarStatus={STATUS} />);
    expect((screen.getByLabelText("Dosen") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Tendik") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("PPPK") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Pegawai Negeri Sipil") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Keaktifan") as HTMLSelectElement).value).toBe("semua");
  });

  it("memakai nama field yang dibaca laporan (jenis, status, keaktifan) dan hanya Dosen/Tendik", () => {
    const { container } = render(
      <BidangFilterRekap jenis={[]} status={[]} keaktifan="aktif" daftarStatus={STATUS} />
    );
    expect(container.querySelectorAll('input[name="jenis"]')).toHaveLength(2);
    expect(container.querySelectorAll('input[name="status"]')).toHaveLength(2);
    expect(container.querySelector('select[name="keaktifan"]')).not.toBeNull();
    const opsi = Array.from((screen.getByLabelText("Keaktifan") as HTMLSelectElement).options).map((o) => o.text);
    expect(opsi).toEqual(["Aktif saja", "Non-aktif saja", "Semua"]);
  });
});
