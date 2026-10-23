/**
 * Laporan TK untuk tindak lanjut (data SINTETIS di kds_test): angka TK identik dengan Rekap Tahunan, ambang, peringkat berbagi nilai sama,
 * rincian bulan, ringkasan per unit induk, dan berkas Excel (sheet, isi, login wajib).
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { GET } from "@/app/(app)/rekap-kehadiran/tahunan/tk/route";
import { laporanRekapBulanan } from "@/lib/laporan/rekapBulanan";
import { laporanRekapTahunan } from "@/lib/laporan/rekapTahunan";
import { KATEGORI_TK, ambangDari, beriPeringkat, kategoriDari, laporanTkTindakLanjut, namaSheetUnik, stempelWaktuWib } from "@/lib/laporan/rekapTkTindakLanjut";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const sesi = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const FILTER = { jenis: [] as string[], status: [] as string[], keaktifan: "aktif" as const };

const A = "900000000000000001"; // Jan 2, Mar 1, Jun 3 -> 6 (unit X)
const B = "900000000000000002"; // Feb 1, Mar 1 -> 2 (di bawah ambang 3) (unit X)
const C = "900000000000000003"; // Mar 5, Apr 4 -> 9 (unit Y)
const D = "900000000000000004"; // Jan 6 -> 6 (unit Y, kembar dengan A)
const E = "900000000000000005"; // tanpa TK (unit Y)
const F = "900000000000000006"; // Akademisi Luar (unit Y): tidak pernah masuk laporan Absensi
const G = "900000000000000007"; // Satpam bershift (unit Y), TK 10 hari di Januari: dikeluarkan dari analisis TK kecuali diminta

describe.skipIf(!ada)("laporan TK untuk tindak lanjut", () => {
  let unitX = "";
  let unitY = "";
  let indukX = "";
  let indukY = "";

  beforeAll(async () => {
    await kosongkanDomain(prisma);
    const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
    const x = unit[0];
    const y = unit.find((u) => u.unitIndukKode !== x.unitIndukKode)!;
    [unitX, unitY, indukX, indukY] = [x.kode, y.kode, x.unitInduk.nama, y.unitInduk.nama];
    const nom = (nip: string, jenis: string) => ({ nip, bulan: 12, tahun: 2026, jenis, tmt: "2015-01-01" });
    const rek = (nip: string, bulan: number, TK: string) => ({ nip, bulan, tahun: 2026, komponen: { TK, I: "0" } });
    await muatKeadaan(prisma, {
      nominatif: [nom(A, "DSN"), nom(B, "TDK"), nom(C, "TDK"), nom(D, "DSN"), nom(E, "TDK"), nom(F, "AKL"), nom(G, "TDK")],
      rekap: [rek(A, 1, "2"), rek(A, 3, "1"), rek(A, 6, "3"), rek(B, 2, "1"), rek(B, 3, "1"), rek(C, 3, "5"), rek(C, 4, "4"), rek(D, 1, "6"), rek(E, 5, "0"), { nip: G, bulan: 1, tahun: 2026, komponen: { TK: "10", I: "0", JENIS_SHIFT: "Satpam 3 Shift" } }],
    });
    for (const [nip, unitKode] of [[A, unitX], [B, unitX], [C, unitY], [D, unitY], [E, unitY], [F, unitY], [G, unitY]] as const) {
      await prisma.nominatifBulanan.updateMany({ where: { pegawaiNip: nip }, data: { unitAsalKode: unitKode } });
    }
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("ambang: hanya yang total TK >= ambang; urut TK terbanyak; peringkat berbagi nilai sama; rincian bulan", async () => {
    const SEKARANG = new Date("2026-10-16T01:34:00Z"); // 08.34 WIB
    const lap = await laporanTkTindakLanjut(prisma, 2026, FILTER, 3, SEKARANG);
    expect(lap.jumlahPegawaiDiperiksa).toBe(5);
    expect(lap.baris.map((b) => [b.nip, b.total, b.peringkat])).toEqual([[C, 9, 1], [A, 6, 2], [D, 6, 2]]);
    const a = lap.baris.find((b) => b.nip === A)!;
    expect(a.perBulan).toEqual([2, 0, 1, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
    expect(a.jumlahBulan).toBe(3);
    expect(a.bulanTk).toBe("Jan (2), Mar (1), Jun (3)");
    expect(a.unitInduk).toBe(indukX);
    expect(lap.namaFile).toBe("Laporan TK Tahunan Aktif 2026 minimal 3 hari - dibuat 16-10-2026 08.34 WIB");
    // nama file mengikuti filter jenis/status/keaktifan, seperti laporan lain
    expect((await laporanTkTindakLanjut(prisma, 2026, { jenis: ["TDK"], status: [], keaktifan: "aktif" }, 3, SEKARANG)).namaFile).toBe("Laporan TK Tahunan Tendik Aktif 2026 minimal 3 hari - dibuat 16-10-2026 08.34 WIB");
    expect((await laporanTkTindakLanjut(prisma, 2026, { jenis: ["DSN", "TDK"], status: ["PNS", "PPPK"], keaktifan: "semua" }, 5, SEKARANG)).namaFile).toBe("Laporan TK Tahunan Dosen dan Tendik PNS-PPPK 2026 minimal 5 hari - dibuat 16-10-2026 08.34 WIB");

    expect((await laporanTkTindakLanjut(prisma, 2026, FILTER, 1)).baris.map((b) => b.nip).sort()).toEqual([A, B, C, D].sort()); // E (0 hari) tidak pernah masuk
    expect((await laporanTkTindakLanjut(prisma, 2026, FILTER, 10)).baris).toEqual([]);
    // batas tepat: B punya TK 2 hari -> masuk pada ambang 2 (>=), tidak masuk pada ambang 3
    expect((await laporanTkTindakLanjut(prisma, 2026, FILTER, 2)).baris.map((b) => b.nip)).toContain(B);
    expect((await laporanTkTindakLanjut(prisma, 2026, FILTER, 3)).baris.map((b) => b.nip)).not.toContain(B);
  });

  it("kategori TK: batas bawah dan atas sama-sama termasuk; ringkasan unit dan nama berkas mengikuti; rute menerima kategori (menang atas min_tk)", async () => {
    const SEKARANG = new Date("2026-10-16T01:34:00Z");
    const nip = async (min: number, maks: number | null) => (await laporanTkTindakLanjut(prisma, 2026, FILTER, min, SEKARANG, false, { maks, nama: null })).baris.map((b) => b.nip).sort();
    expect(await nip(3, 6)).toEqual([A, D].sort()); // batas atas 6 ikut (A dan D tepat 6), C (9) keluar
    expect(await nip(3, 5)).toEqual([]);
    expect(await nip(7, 9)).toEqual([C]); // 9 tepat di batas atas
    expect(await nip(3, 8)).toEqual([A, D].sort());

    const ringan = await laporanTkTindakLanjut(prisma, 2026, FILTER, 3, SEKARANG, false, { maks: 6, nama: "TK Ringan" });
    expect(ringan.namaFile).toBe("Laporan TK Tahunan Aktif 2026 TK Ringan - dibuat 16-10-2026 08.34 WIB");
    expect(ringan.ringkasan.find((r) => r.unitInduk === indukY)).toMatchObject({ jumlahPegawai: 3, pegawaiTk: 1, totalHari: 6, maksPerOrang: 6 }); // hanya D; C di luar rentang

    expect(kategoriDari("berat")).toBe("berat");
    expect([null, "", "BERAT", "toString", "x"].map(kategoriDari)).toEqual([null, null, null, null, null]);
    expect(Object.values(KATEGORI_TK).map((k) => [k.min, k.maks])).toEqual([[3, null], [3, 10], [11, 20], [21, null]]);

    const jumlahBaris = async (kueri: string) => {
      const res = await GET(new Request(`http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&${kueri}`));
      expect(res.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
      return { baris: wb.getWorksheet("Semua Pegawai")!.rowCount - 1, nama: res.headers.get("Content-Disposition")! };
    };
    expect((await jumlahBaris("kategori=ringan")).baris).toBe(3);
    expect((await jumlahBaris("kategori=ringan")).nama).toContain("2026 TK Ringan - dibuat");
    expect((await jumlahBaris("kategori=sedang")).baris).toBe(0);
    expect((await jumlahBaris("kategori=berat")).baris).toBe(0);
    expect((await jumlahBaris("kategori=berat&min_tk=1")).baris).toBe(0); // kategori menang atas min_tk
    expect((await jumlahBaris("kategori=tidak-ada&min_tk=3")).baris).toBe(3); // kategori tak dikenal: kembali ke min_tk
  });

  it("filter unit induk: hanya pegawai unit itu; penyebut ringkasan ikut menyempit; nama berkas dan rute memuat unit; kode tak dikenal = tanpa hasil", async () => {
    const SEKARANG = new Date("2026-10-16T01:34:00Z");
    const [kodeX, kodeY] = [(await prisma.unitAsal.findUniqueOrThrow({ where: { kode: unitX } })).unitIndukKode, (await prisma.unitAsal.findUniqueOrThrow({ where: { kode: unitY } })).unitIndukKode];
    const x = await laporanTkTindakLanjut(prisma, 2026, FILTER, 3, SEKARANG, false, { maks: null, nama: null, unitIndukKode: kodeX });
    expect(x.baris.map((b) => b.nip)).toEqual([A]);
    expect(x.jumlahPegawaiDiperiksa).toBe(2); // A dan B (unit induk lain tidak ikut diperiksa)
    expect(x.ringkasan).toEqual([{ unitInduk: indukX, jumlahPegawai: 2, pegawaiTk: 1, persen: 50, totalHari: 6, maksPerOrang: 6 }]);
    expect(x.unitIndukDipilih).toBe(indukX);
    expect(x.namaFile).toBe(`Laporan TK Tahunan Aktif 2026 minimal 3 hari - ${indukX} - dibuat 16-10-2026 08.34 WIB`);
    const y = await laporanTkTindakLanjut(prisma, 2026, FILTER, 3, SEKARANG, false, { maks: null, nama: null, unitIndukKode: kodeY });
    expect(y.baris.map((b) => b.nip).sort()).toEqual([C, D].sort());
    expect((await laporanTkTindakLanjut(prisma, 2026, FILTER, 3, SEKARANG, false, { maks: null, nama: null, unitIndukKode: "" })).baris).toHaveLength(3); // kosong = semua
    expect((await laporanTkTindakLanjut(prisma, 2026, FILTER, 3, SEKARANG, false, { maks: null, nama: null, unitIndukKode: "TIDAK-ADA" })).baris).toHaveLength(3); // kode tak dikenal diabaikan, bukan menyembunyikan data

    const res = await GET(new Request(`http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&min_tk=3&unit_induk=${encodeURIComponent(kodeX)}`));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Semua Pegawai")!.rowCount).toBe(2); // judul + A
  });

  it("ringkasan per unit induk: penyebut = semua pegawai yang diperiksa, pembilang = yang memenuhi ambang", async () => {
    const lap = await laporanTkTindakLanjut(prisma, 2026, FILTER, 3);
    expect(lap.ringkasan).toEqual([
      { unitInduk: indukY, jumlahPegawai: 3, pegawaiTk: 2, persen: 66.7, totalHari: 15, maksPerOrang: 9 },
      { unitInduk: indukX, jumlahPegawai: 2, pegawaiTk: 1, persen: 50, totalHari: 6, maksPerOrang: 6 },
    ]);
  });

  it("total TK setiap pegawai IDENTIK dengan Rekap Tahunan (sumber angka yang sama)", async () => {
    const tahunan = await laporanRekapTahunan(prisma, 2026, FILTER);
    const lap = await laporanTkTindakLanjut(prisma, 2026, FILTER, 1);
    for (const b of lap.baris) expect(String(b.total), b.nip).toBe(tahunan.baris.find((x) => x.nip === b.nip)!.total.TK);
  });

  it("pembantu: ambang dari parameter, peringkat, dan nama sheet unik", () => {
    expect([null, "", "0", "abc", "-2", "401", "5", " 7 "].map(ambangDari)).toEqual([3, 3, 3, 3, 3, 3, 5, 7]);
    expect(beriPeringkat([9, 6, 6, 4, 4, 1], (x) => x)).toEqual([1, 2, 2, 4, 4, 6]);
    expect(stempelWaktuWib(new Date("2026-10-16T01:34:00Z"))).toBe("16-10-2026 08.34 WIB");
    expect(stempelWaktuWib(new Date("2026-12-31T17:05:00Z"))).toBe("01-01-2027 00.05 WIB"); // lewat tengah malam WIB
    const terpakai = new Set<string>();
    expect(namaSheetUnik("Fakultas: Ilmu/Pendidikan [FIP] yang namanya sangat panjang sekali", terpakai).length).toBeLessThanOrEqual(31);
    expect(namaSheetUnik("Fakultas: Ilmu/Pendidikan [FIP] yang namanya sangat panjang sekali", terpakai)).not.toBe(namaSheetUnik("Fakultas: Ilmu/Pendidikan [FIP] yang namanya sangat panjang sekali", new Set()));
    expect(namaSheetUnik("Ringkasan Unit", terpakai)).toBe("Ringkasan Unit");
    expect(namaSheetUnik("ringkasan unit", terpakai)).not.toBe("ringkasan unit"); // sheet Excel tidak peka huruf besar/kecil
  });

  it("Excel: wajib login; sheet Ringkasan, Semua Pegawai, lalu satu sheet per unit induk; isi sesuai; min_tk dihormati", async () => {
    sesi.user = null;
    expect((await GET(new Request("http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026"))).status).toBe(401);
    sesi.user = { id: "u1" };

    const res = await GET(new Request("http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&min_tk=3"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="Laporan TK Tahunan Aktif 2026 minimal 3 hari - dibuat \d{2}-\d{2}-\d{4} \d{2}\.\d{2} WIB\.xlsx"/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name).slice(0, 2)).toEqual(["Ringkasan Unit", "Semua Pegawai"]);
    expect(wb.worksheets).toHaveLength(4); // + 2 unit induk yang punya pegawai ber-TK

    const semua = wb.getWorksheet("Semua Pegawai")!;
    expect((semua.getRow(1).values as unknown[]).slice(1, 8)).toEqual(["Peringkat", "Unit Induk", "Unit Kerja", "NIP", "Nama", "Jenis Pegawai", "Jan"]);
    expect(semua.rowCount).toBe(4); // judul + 3 pegawai
    expect(semua.getRow(2).getCell(4).value).toBe(C);
    expect(semua.getRow(2).getCell(9).value).toBe(5); // Maret = kolom 9 (Jan = 7), milik C = 5
    expect(semua.getRow(2).getCell(19).value).toBe(9); // Total Hari TK

    const unitSheet = wb.worksheets[2];
    expect(unitSheet.getRow(1).getCell(1).value).toBe("Peringkat");
    expect(unitSheet.rowCount).toBeGreaterThanOrEqual(2);

    const ring = wb.getWorksheet("Ringkasan Unit")!;
    expect(String(ring.getRow(1).getCell(1).value)).toContain("Tahun 2026");
    expect(String(ring.getRow(2).getCell(1).value)).toContain("minimal 3 hari");

    const tendik = await GET(new Request("http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&min_tk=3&jenis=TDK"));
    expect(tendik.headers.get("Content-Disposition")).toMatch(/filename="Laporan TK Tahunan Tendik Aktif 2026 minimal 3 hari - dibuat \d{2}-\d{2}-\d{4} \d{2}\.\d{2} WIB\.xlsx"/);

    const longgar = new ExcelJS.Workbook();
    await longgar.xlsx.load(Buffer.from(await (await GET(new Request("http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&min_tk=1"))).arrayBuffer()) as unknown as ArrayBuffer);
    expect(longgar.getWorksheet("Semua Pegawai")!.rowCount).toBe(5); // judul + A, B, C, D
  });

  it("Akademisi Luar tidak ikut laporan Absensi bila filter Jenis kosong (Tahunan, Bulanan, dan laporan TK); Dosen/Tendik tetap lengkap", async () => {
    const tahunan = await laporanRekapTahunan(prisma, 2026, FILTER);
    expect(tahunan.baris.map((b) => b.nip).sort()).toEqual([A, B, C, D, E, G].sort());
    const bulanan = await laporanRekapBulanan(prisma, 12, 2026, FILTER);
    expect(bulanan.baris.map((b) => b.nip).sort()).toEqual([A, B, C, D, E, G].sort());
    const tk = await laporanTkTindakLanjut(prisma, 2026, FILTER, 1);
    expect(tk.jumlahPegawaiDiperiksa).toBe(5); // penyebut persentase unit tidak memuat Akademisi Luar
  });

  it("pegawai bershift (Satpam) dikeluarkan dari Laporan TK secara bawaan (juga dari penyebut unit) dan ikut bila diminta; Absensi biasa tetap menampilkannya", async () => {
    const bawaan = await laporanTkTindakLanjut(prisma, 2026, FILTER, 1);
    expect(bawaan.baris.map((b) => b.nip)).not.toContain(G);
    expect(bawaan.bershiftDikeluarkan).toBe(1);
    expect(bawaan.sertakanBershift).toBe(false);
    expect(bawaan.jumlahPegawaiDiperiksa).toBe(5);

    const dengan = await laporanTkTindakLanjut(prisma, 2026, FILTER, 1, new Date(), true);
    expect(dengan.baris.map((b) => b.nip)).toContain(G);
    expect(dengan.bershiftDikeluarkan).toBe(0);
    expect(dengan.jumlahPegawaiDiperiksa).toBe(6);
    expect(dengan.ringkasan.find((r) => r.unitInduk === indukY)!.jumlahPegawai).toBe(bawaan.ringkasan.find((r) => r.unitInduk === indukY)!.jumlahPegawai + 1);

    const hitungBaris = async (url: string) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await (await GET(new Request(url))).arrayBuffer()) as unknown as ArrayBuffer);
      return wb.getWorksheet("Semua Pegawai")!.rowCount;
    };
    expect(await hitungBaris("http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&min_tk=1")).toBe(5);
    expect(await hitungBaris("http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&min_tk=1&shift=1")).toBe(6);
    const ket = new ExcelJS.Workbook();
    await ket.xlsx.load(Buffer.from(await (await GET(new Request("http://localhost/rekap-kehadiran/tahunan/tk?tahun=2026&min_tk=1"))).arrayBuffer()) as unknown as ArrayBuffer);
    const teks = ket.getWorksheet("Ringkasan Unit")!.getSheetValues().flat().map(String).join(" ");
    expect(teks).toContain("1 pegawai bershift");
  });
});
