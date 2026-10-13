/**
 * Infrastruktur upload F4.1a (murni, tanpa database): penjaga berkas (meniru PemeriksaFileExcel KDS2),
 * pembaca sheet (padanan CalculatedFormulaImport) dan pengirim per potongan.
 */
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { bacaSheet } from "@/lib/upload/bacaSheet";
import { jumlahPotongan, unggahBerkas } from "@/lib/upload/klien";
import { KesalahanUpload, MAKS_BARIS, UKURAN_POTONGAN } from "@/lib/upload/konstanta";
import { periksaBerkas } from "@/lib/upload/penjagaBerkas";

async function buatXlsx(sheet: Record<string, (string | number | Date | null | ExcelJS.CellValue)[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [nama, baris] of Object.entries(sheet)) {
    const ws = wb.addWorksheet(nama);
    baris.forEach((b) => ws.addRow(b));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const tolak = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(KesalahanUpload);
    return (e as KesalahanUpload).message;
  }
  throw new Error("seharusnya ditolak");
};

describe("penjaga berkas", () => {
  it("menerima berkas 1-2 sheet kecil tanpa nama sheet", async () => {
    const b = await buatXlsx({ Data: [["a"], [1]], Info: [["x"]] });
    expect(await periksaBerkas(b)).toBeNull();
  });

  it("menolak berkas yang bukan xlsx (tanda tangan ZIP) dan arsip rusak", async () => {
    expect(await tolak(periksaBerkas(Buffer.from("halo ini teks biasa")))).toMatch(/tidak bisa dibaca/);
    expect(await tolak(periksaBerkas(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])))).toMatch(/tidak bisa dibaca/);
    expect(await tolak(periksaBerkas(Buffer.alloc(0)))).toMatch(/tidak bisa dibaca/);
  });

  it("menolak workbook kerja dengan lebih dari 6 sheet, kecuali nama sheet disebut", async () => {
    const sheet: Record<string, string[][]> = {};
    for (let i = 1; i <= 8; i++) sheet[`Sheet ${i}`] = [["k"], [String(i)]];
    const b = await buatXlsx(sheet);
    expect(await tolak(periksaBerkas(b))).toMatch(/8 sheet.*workbook kerja/);
    expect(await periksaBerkas(b, "sheet 3")).toBe("Sheet 3"); // tak peka huruf besar/kecil, mengembalikan nama persis
  });

  it("menolak nama sheet yang tidak ada dan menyebut sheet yang tersedia", async () => {
    const b = await buatXlsx({ Data: [["a"]], Lain: [["b"]] });
    const pesan = await tolak(periksaBerkas(b, "Tidak Ada"));
    expect(pesan).toContain('"Tidak tersedia"'.replace("Tidak tersedia", "Tidak Ada"));
    expect(pesan).toContain('"Data", "Lain"');
    try {
      await periksaBerkas(b, "Tidak Ada");
    } catch (e) {
      expect((e as KesalahanUpload).bidang).toBe("nama_sheet");
    }
  });

  it("menolak sheet berisi lebih dari 15.000 baris, tetapi sheet kecil lain di berkas yang sama lolos bila dipilih", async () => {
    const besar = Array.from({ length: MAKS_BARIS + 1 }, (_, i) => [i]);
    const b = await buatXlsx({ Data: besar, Kecil: [["a"], [1]] });
    expect(await tolak(periksaBerkas(b))).toMatch(/Sheet "Data" memuat 15\.001 baris/);
    expect(await tolak(periksaBerkas(b, "Data"))).toMatch(/terlalu besar/);
    expect(await periksaBerkas(b, "Kecil")).toBe("Kecil");
  });

  it("membaca nama sheet yang memuat karakter XML (&)", async () => {
    const b = await buatXlsx({ "Rekap & Data": [["a"]] });
    expect(await periksaBerkas(b, "rekap & data")).toBe("Rekap & Data");
  });
});

describe("pembaca sheet", () => {
  it("membaca sel biasa, kosong sebagai null, dan baris kosong tetap menjaga nomor baris", async () => {
    const b = await buatXlsx({ Data: [["NIP", "Nama"], [], ["197001012000011001", 5, null, "z"]] });
    const baris = await bacaSheet(b, null, 3);
    expect(baris.length).toBe(3);
    expect(baris[0]).toEqual(["NIP", "Nama", null]);
    expect(baris[1]).toEqual([null, null, null]);
    expect(baris[2]).toEqual(["197001012000011001", 5, null]); // kolom di luar jumlahKolom diabaikan
  });

  it("membaca sel berumus sebagai HASIL hitungnya, bukan teks rumus", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    ws.addRow([22, 4]);
    ws.getCell("C1").value = { formula: "A1-B1", result: 18 };
    ws.getCell("D1").value = { formula: "A9", result: { error: "#N/A" } } as ExcelJS.CellValue;
    const b = Buffer.from(await wb.xlsx.writeBuffer());
    expect((await bacaSheet(b, null, 4))[0]).toEqual([22, 4, 18, null]);
  });

  it("menggabungkan teks kaya, mengambil teks tautan, dan mempertahankan tanggal", async () => {
    const tgl = new Date(Date.UTC(2026, 8, 1));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    ws.getCell("A1").value = { richText: [{ text: "Ab" }, { text: "cd", font: { bold: true } }] };
    ws.getCell("B1").value = { text: "klik", hyperlink: "https://contoh.id" };
    ws.getCell("C1").value = tgl;
    const b = Buffer.from(await wb.xlsx.writeBuffer());
    const baris = (await bacaSheet(b, null, 3))[0];
    expect(baris[0]).toBe("Abcd");
    expect(baris[1]).toBe("klik");
    expect(baris[2]).toEqual(tgl);
  });

  it("membaca sheet bernama, dan sheet pertama bila nama null", async () => {
    const b = await buatXlsx({ Pertama: [["p"]], Kedua: [["k"]] });
    expect((await bacaSheet(b, null, 1))[0]).toEqual(["p"]);
    expect((await bacaSheet(b, "Kedua", 1))[0]).toEqual(["k"]);
    expect(await tolak(bacaSheet(b, "Tiada", 1))).toMatch(/Sheet data tidak ditemukan/);
  });

  it("menolak berkas rusak dengan pesan Indonesia", async () => {
    expect(await tolak(bacaSheet(Buffer.from("bukan excel"), null, 1))).toMatch(/tidak bisa dibaca/);
  });
});

describe("pengirim per potongan", () => {
  const berkas = (n: number) => new File([new Uint8Array(n).fill(7)], "rekap.xlsx");

  it("menghitung jumlah potongan", () => {
    expect(jumlahPotongan(0)).toBe(1);
    expect(jumlahPotongan(1)).toBe(1);
    expect(jumlahPotongan(UKURAN_POTONGAN)).toBe(1);
    expect(jumlahPotongan(UKURAN_POTONGAN + 1)).toBe(2);
    expect(jumlahPotongan(10 * 1024 * 1024)).toBe(4);
  });

  it("mengirim berkas 7 MB sebagai 3 potongan berurutan, tiap potongan ≤ 3 MB, dan melaporkan progres", async () => {
    const diterima: { i: number; ukuran: number; id: string }[] = [];
    const fetchFn = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const f = init?.body as FormData;
      diterima.push({ i: Number(f.get("chunkIndex")), ukuran: (f.get("chunk") as Blob).size, id: String(f.get("uploadId")) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const progres: string[] = [];
    const hasil = await unggahBerkas(berkas(7 * 1024 * 1024), {
      fetchFn: fetchFn as unknown as typeof fetch,
      saatProgres: (a, b) => progres.push(`${a}/${b}`),
    });
    expect(diterima.map((d) => d.i)).toEqual([0, 1, 2]);
    expect(diterima.every((d) => d.ukuran <= UKURAN_POTONGAN)).toBe(true);
    expect(diterima.reduce((s, d) => s + d.ukuran, 0)).toBe(7 * 1024 * 1024);
    expect(new Set(diterima.map((d) => d.id)).size).toBe(1);
    expect(hasil).toMatchObject({ totalPotongan: 3, namaFile: "rekap.xlsx", uploadId: diterima[0].id });
    expect(progres).toEqual(["0/3", "1/3", "2/3", "3/3"]);
  });

  it("mengulang potongan yang gagal sementara (500) lalu berhasil", async () => {
    let panggilan = 0;
    const fetchFn = vi.fn(async () => {
      panggilan++;
      return panggilan === 1 ? new Response("{}", { status: 500 }) : new Response("{}", { status: 200 });
    });
    const hasil = await unggahBerkas(berkas(10), { fetchFn: fetchFn as unknown as typeof fetch });
    expect(hasil.totalPotongan).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("tidak mengulang galat 4xx, melempar pesan server, dan membuang potongan yang sudah masuk", async () => {
    const metode: string[] = [];
    const fetchFn = vi.fn(async (_u: unknown, init?: RequestInit) => {
      metode.push(init?.method ?? "GET");
      if (init?.method === "DELETE") return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ error: "Sesi login sudah habis." }), { status: 401 });
    });
    await expect(unggahBerkas(berkas(10), { fetchFn: fetchFn as unknown as typeof fetch })).rejects.toThrow("Sesi login sudah habis.");
    expect(metode).toEqual(["POST", "DELETE"]);
  });

  it("menyerah setelah percobaan habis pada galat jaringan", async () => {
    const fetchFn = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response("{}", { status: 200 });
      throw new TypeError("network");
    });
    await expect(unggahBerkas(berkas(10), { fetchFn: fetchFn as unknown as typeof fetch, percobaan: 2 })).rejects.toThrow(/Koneksi terputus/);
    expect(fetchFn).toHaveBeenCalledTimes(3); // 2 percobaan + 1 pembatalan
  });
});
