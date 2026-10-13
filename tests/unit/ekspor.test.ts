import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { headerUnduhan, keCsv, keTsv, MIME_XLSX } from "@/lib/laporan/ekspor";
import { buatXlsx } from "@/lib/laporan/xlsx";

describe("keCsv", () => {
  it("membungkus sel berisi koma, kutip, atau baris baru; kutip digandakan", () => {
    const csv = keCsv(["Nama", "Catatan"], [["Ani, S.Pd.", 'ia berkata "ya"'], ["Budi", "baris\nbaru"]]);
    expect(csv).toBe('Nama,Catatan\r\n"Ani, S.Pd.","ia berkata ""ya"""\r\nBudi,"baris\nbaru"');
  });
  it("null/undefined menjadi sel kosong; angka apa adanya", () => {
    expect(keCsv(["a", "b", "c"], [[null, undefined, 7]])).toBe("a,b,c\r\n,,7");
  });
});

describe("keTsv (untuk Salin)", () => {
  it("memisahkan dengan tab dan mengganti tab/baris baru di dalam sel dengan spasi", () => {
    expect(keTsv(["A", "B"], [["x\ty", "p\nq"]])).toBe("A\tB\nx y\tp q");
  });
});

describe("buatXlsx", () => {
  it("menulis judul kolom dan baris; tipe sel dipertahankan (teks tetap teks, angka tetap angka)", async () => {
    const buf = await buatXlsx(["NIP", "Nama", "TK"], [["198001010000000001", "Uji Satu", "3"], ["198001010000000002", "Uji Dua", 5]], "Data");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Data")!;
    expect(ws.getRow(1).values).toEqual([undefined, "NIP", "Nama", "TK"]);
    expect(ws.getRow(2).values).toEqual([undefined, "198001010000000001", "Uji Satu", "3"]);
    expect(ws.getRow(3).getCell(3).value).toBe(5);
    expect(ws.rowCount).toBe(3);
  });
  it("sel null menjadi kosong", async () => {
    const buf = await buatXlsx(["a", "b"], [[null, "x"]]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets[0].getRow(2).getCell(1).value).toBeNull();
  });
});

describe("headerUnduhan", () => {
  it("memberi nama file ASCII aman dan nama UTF-8 untuk karakter non-ASCII", () => {
    const h = headerUnduhan("Rekap Kehadiran Bulanan Dosen PNS Aktif Oktober 2026", "xlsx");
    expect(h).toContain('attachment; filename="Rekap Kehadiran Bulanan Dosen PNS Aktif Oktober 2026.xlsx"');
    expect(h).toContain("filename*=UTF-8''Rekap%20Kehadiran%20Bulanan%20Dosen%20PNS%20Aktif%20Oktober%202026.xlsx");
    expect(headerUnduhan("Detail Péga", "csv")).toContain('filename="Detail Pega.csv"');
  });
  it("MIME xlsx benar", () => {
    expect(MIME_XLSX).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
});
