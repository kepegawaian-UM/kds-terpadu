// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnggahBerkas } from "@/components/upload/UnggahBerkas";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pilih = (berkas: File) => {
  const input = screen.getByLabelText(/Berkas Excel/) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [berkas] } });
};

describe("UnggahBerkas", () => {
  it("menolak berkas bukan .xlsx tanpa mengirim apa pun", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const saatSelesai = vi.fn();
    render(<UnggahBerkas saatSelesai={saatSelesai} />);
    pilih(new File(["x"], "data.csv"));
    expect((await screen.findByRole("alert")).textContent).toBe("File harus berformat .xlsx.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saatSelesai).not.toHaveBeenCalled();
  });

  it("menolak berkas lebih dari 12 MB", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<UnggahBerkas saatSelesai={vi.fn()} />);
    const besar = new File([new Uint8Array(1)], "besar.xlsx");
    Object.defineProperty(besar, "size", { value: 13 * 1024 * 1024 });
    pilih(besar);
    expect((await screen.findByRole("alert")).textContent).toMatch(/terlalu besar/);
  });

  it("mengirim berkas, lalu memanggil saatSelesai dengan uploadId dan jumlah potongan", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const saatSelesai = vi.fn();
    render(<UnggahBerkas saatSelesai={saatSelesai} />);
    pilih(new File([new Uint8Array(100)], "rekap.xlsx"));
    await waitFor(() => expect(saatSelesai).toHaveBeenCalledTimes(1));
    expect(saatSelesai.mock.calls[0][0]).toMatchObject({ totalPotongan: 1, namaFile: "rekap.xlsx", ukuran: 100 });
  });

  it("menampilkan pesan galat dari server bila pengiriman gagal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: unknown, init?: RequestInit) =>
        init?.method === "DELETE"
          ? new Response("{}", { status: 200 })
          : new Response(JSON.stringify({ error: "Sesi login sudah habis." }), { status: 401 }),
      ),
    );
    const saatSelesai = vi.fn();
    render(<UnggahBerkas saatSelesai={saatSelesai} />);
    pilih(new File([new Uint8Array(10)], "rekap.xlsx"));
    expect((await screen.findByRole("alert")).textContent).toBe("Sesi login sudah habis.");
    expect(saatSelesai).not.toHaveBeenCalled();
  });
});
