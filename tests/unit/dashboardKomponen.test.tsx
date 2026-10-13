// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Konfigurasi = {
  type: string;
  data: { labels: string[]; datasets: { data: number[]; label?: string; hidden?: boolean; backgroundColor?: string }[] };
  options: { indexAxis?: string };
};
const instansi = vi.hoisted(() => [] as {
  config: Konfigurasi;
  destroyed: boolean;
  tampil: Record<number, boolean>;
  diperbarui: number;
}[]);

vi.mock("chart.js/auto", () => ({
  default: class {
    config: Konfigurasi;
    destroyed = false;
    tampil: Record<number, boolean> = {};
    diperbarui = 0;
    constructor(_el: unknown, cfg: Konfigurasi) {
      this.config = cfg;
      instansi.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
    update() {
      this.diperbarui++;
    }
    setDatasetVisibility(i: number, v: boolean) {
      this.tampil[i] = v;
    }
    isDatasetVisible(i: number) {
      return this.tampil[i] ?? !this.config.data.datasets[i].hidden;
    }
  },
}));

import { GrafikBatang } from "@/components/dashboard/GrafikBatang";
import { GrafikTren } from "@/components/dashboard/GrafikTren";
import { TabBertingkat, TabUtama } from "@/components/dashboard/TabDashboard";

beforeEach(() => {
  instansi.length = 0;
});
afterEach(cleanup);

describe("GrafikBatang", () => {
  it("membuat grafik batang horizontal dengan label, data, dan warna yang diberikan", () => {
    render(<GrafikBatang judul="Sebaran unit" labels={["A", "B"]} data={[3, 1]} warna="#1d443a" />);
    expect(instansi).toHaveLength(1);
    const c = instansi[0].config;
    expect(c.type).toBe("bar");
    expect(c.options.indexAxis).toBe("y");
    expect(c.data.labels).toEqual(["A", "B"]);
    expect(c.data.datasets[0]).toMatchObject({ data: [3, 1], backgroundColor: "#1d443a" });
  });

  it("canvas punya label aksesibilitas dan ringkasan teks bagi pembaca layar", () => {
    render(<GrafikBatang judul="Sebaran unit" labels={["A", "B"]} data={[3, 1]} warna="#000" />);
    const canvas = screen.getByRole("img", { name: /Sebaran unit/ });
    expect(canvas.textContent).toContain("A: 3");
    expect(canvas.textContent).toContain("B: 1");
  });

  it("membersihkan grafik saat komponen dilepas", () => {
    const { unmount } = render(<GrafikBatang judul="x" labels={["A"]} data={[1]} warna="#000" />);
    unmount();
    expect(instansi[0].destroyed).toBe(true);
  });

  it("data kosong tetap menampilkan keterangan 'Belum ada data' tanpa galat", () => {
    render(<GrafikBatang judul="Kosong" labels={[]} data={[]} warna="#000" />);
    expect(screen.getByText("Belum ada data")).toBeTruthy();
  });
});

describe("GrafikTren", () => {
  const series = [
    { kode: "TK", label: "Tanpa Keterangan", data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], default: true },
    { kode: "I", label: "Izin", data: Array(12).fill(0), default: false },
  ];
  const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  it("garis per kategori; hanya yang bawaan (TK, S) terlihat di awal", () => {
    render(<GrafikTren bulanLabel={bulan} series={series} />);
    const c = instansi[0].config;
    expect(c.type).toBe("line");
    expect(c.data.datasets.map((d) => d.label)).toEqual(["Tanpa Keterangan", "Izin"]);
    expect(c.data.datasets.map((d) => !!d.hidden)).toEqual([false, true]);
  });

  it("tombol kategori menyalakan/mematikan garis dan menandai statusnya", async () => {
    render(<GrafikTren bulanLabel={bulan} series={series} />);
    const u = userEvent.setup();
    const izin = screen.getByRole("button", { name: "Izin" });
    expect(izin.getAttribute("aria-pressed")).toBe("false");
    await u.click(izin);
    expect(izin.getAttribute("aria-pressed")).toBe("true");
    expect(instansi[0].tampil[1]).toBe(true);
    expect(instansi[0].diperbarui).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "Tanpa Keterangan" }));
    expect(instansi[0].tampil[0]).toBe(false);
  });
});

describe("TabUtama (Dashboard Pegawai / Kinerja)", () => {
  it("menampilkan tab bawaan Pegawai dan menukar panel saat tab diklik", async () => {
    render(<TabUtama tabAwal="pegawai" panelPegawai={<p>isi pegawai</p>} panelKinerja={<p>isi kinerja</p>} />);
    const u = userEvent.setup();
    expect(screen.getByText("isi pegawai").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(false);
    expect(screen.getByText("isi kinerja").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(true);
    await u.click(screen.getByRole("tab", { name: "Dashboard Kinerja" }));
    expect(screen.getByText("isi kinerja").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(false);
    expect(screen.getByRole("tab", { name: "Dashboard Kinerja" }).getAttribute("aria-selected")).toBe("true");
  });

  it("tabAwal kinerja langsung menampilkan kinerja", () => {
    render(<TabUtama tabAwal="kinerja" panelPegawai={<p>p</p>} panelKinerja={<p>k</p>} />);
    expect(screen.getByRole("tab", { name: "Dashboard Kinerja" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("TabBertingkat (Dosen / Tendik / Akademisi Luar)", () => {
  it("bawaan Dosen; klik Tendik menampilkan panelnya", async () => {
    render(
      <TabBertingkat
        tab={[
          { kode: "DSN", label: "Dosen", isi: <p>dosen</p> },
          { kode: "TDK", label: "Tendik", isi: <p>tendik</p> },
          { kode: "AKL", label: "Akademisi Luar UM", isi: <p>akl</p> },
        ]}
      />
    );
    const u = userEvent.setup();
    expect(screen.getByText("dosen").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(false);
    expect(screen.getByText("tendik").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(true);
    await u.click(screen.getByRole("tab", { name: "Tendik" }));
    expect(screen.getByText("tendik").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(false);
    expect(screen.getByText("dosen").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(true);
  });
});
