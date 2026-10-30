/**
 * Daftar dan ekspor Excel Koreksi Absensi (data SINTETIS di kds_test): hanya koreksi aktif yang diekspor, filter tahun/bulan menurut berlakunya koreksi,
 * unit induk menurut Nominatif terakhir, pencarian NIP/nama, isi kolom, nama berkas, dan login wajib.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { GET } from "@/app/(app)/koreksi-rekap/export/route";
import { ambilKoreksi, angkaDalamRentang, buatBerkasKoreksi, laporanKoreksi, teksPeriodeKoreksi } from "@/lib/koreksi/laporan";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const sesi = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const A = "900000000000000001"; // unit induk X; angka Jan 2026 (TK -> Masuk 5), angka Mar 2026 dibatalkan
const B = "900000000000000002"; // unit induk Y; periode 1 Feb - 31 Mar 2026 (TK -> TD)
const C = "900000000000000003"; // unit induk X; periode 1 Jun 2026 tanpa batas akhir (TK -> dihapus)
const SEKARANG = new Date("2026-10-28T01:34:00Z"); // 08.34 WIB

describe.skipIf(!ada)("Koreksi Absensi: daftar dan ekspor Excel", () => {
  let indukX = "";
  let indukY = "";
  let kodeX = "";
  let kodeY = "";

  beforeAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await muatKeadaan(prisma, {
      nominatif: [A, B, C].map((nip, i) => ({ nip, bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2015-01-01", nama: ["Ani Satu", "Budi Dua", "Citra Tiga"][i] })),
      koreksi: [
        { nip: A, jenis: "angka", dari_komponen: "TK", ke_komponen: "JUMLAH_MASUK_NYATA", tanggal_mulai: "2026-01-01", bulan: 1, tahun: 2026, jumlah_hari: 5, alasan: "rahasia-alasan" },
        { nip: A, jenis: "angka", dari_komponen: "TK", ke_komponen: "TD", tanggal_mulai: "2026-03-01", bulan: 3, tahun: 2026, jumlah_hari: 2, dibatalkan_pada: "2026-04-01T00:00:00Z" },
        { nip: B, jenis: "periode", dari_komponen: "TK", ke_komponen: "TD", tanggal_mulai: "2026-02-01", tanggal_selesai: "2026-03-31" },
        { nip: C, jenis: "periode", dari_komponen: "TK", ke_komponen: null, tanggal_mulai: "2026-06-01", tanggal_selesai: null },
      ],
    });
    const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
    const x = unit[0];
    const y = unit.find((u) => u.unitIndukKode !== x.unitIndukKode)!;
    [kodeX, kodeY, indukX, indukY] = [x.unitIndukKode, y.unitIndukKode, x.unitInduk.nama, y.unitInduk.nama];
    await prisma.nominatifBulanan.updateMany({ where: { pegawaiNip: B }, data: { unitAsalKode: y.kode } });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  const nips = async (f: Parameters<typeof ambilKoreksi>[1]) => (await ambilKoreksi(prisma, f)).map((b) => `${b.nip.slice(-1)}${b.dibatalkan ? "x" : ""}`).sort();

  it("daftar halaman memuat semua (aktif dan dibatalkan); ekspor hanya yang aktif", async () => {
    expect(await nips({})).toEqual(["1", "1x", "2", "3"]);
    expect(await nips({ hanyaAktif: true })).toEqual(["1", "2", "3"]);
  });

  it("filter tahun/bulan: angka menurut bulannya; periode menurut irisan rentang tanggal (termasuk tanpa batas akhir)", async () => {
    expect(await nips({ tahun: 2026, bulan: 1 })).toEqual(["1"]); // hanya angka Jan A
    expect(await nips({ tahun: 2026, bulan: 2 })).toEqual(["2"]); // periode B (Feb-Mar)
    expect(await nips({ tahun: 2026, bulan: 3 })).toEqual(["1x", "2"]); // angka Mar A (dibatalkan) + periode B
    expect(await nips({ tahun: 2026, bulan: 5 })).toEqual([]); // tidak ada yang berlaku Mei
    expect(await nips({ tahun: 2026, bulan: 9 })).toEqual(["3"]); // periode C tanpa batas akhir terus berlaku
    expect(await nips({ tahun: 2025 })).toEqual([]);
    expect(await nips({ tahun: 2026 })).toEqual(["1", "1x", "2", "3"]);
    expect(await nips({ bulan: 2 })).toEqual(["1", "1x", "2", "3"]); // bulan tanpa tahun diabaikan
  });

  it("filter unit induk (menurut Nominatif terakhir) dan pencarian NIP/nama", async () => {
    expect(await nips({ unitIndukKode: kodeX })).toEqual(["1", "1x", "3"]);
    expect(await nips({ unitIndukKode: kodeY })).toEqual(["2"]);
    expect(await nips({ cari: "budi" })).toEqual(["2"]);
    expect(await nips({ cari: A })).toEqual(["1", "1x"]);
    expect(await nips({ cari: "tidak-ada" })).toEqual([]);
    expect(await nips({ unitIndukKode: kodeX, cari: "citra" })).toEqual(["3"]);
  });

  it("pembantu: angka parameter dan teks periode", () => {
    expect([null, "", "abc", "1999", "2101", "2026", " 2026 "].map((v) => angkaDalamRentang(v, 2000, 2100))).toEqual([null, null, null, null, null, 2026, 2026]);
    expect(angkaDalamRentang("13", 1, 12)).toBeNull();
    expect(teksPeriodeKoreksi({ jenis: "angka", bulan: 3, tahun: 2026, mulai: new Date("2026-03-01"), selesai: null })).toBe("Maret 2026");
    expect(teksPeriodeKoreksi({ jenis: "periode", bulan: null, tahun: null, mulai: new Date("2026-06-01"), selesai: null })).toBe("01-06-2026 s.d. tanpa batas");
  });

  it("isi Excel: judul, kolom, urut nama, tanpa alasan/sumber/status/dibuat oleh, nama berkas mengikuti filter", async () => {
    const lap = await laporanKoreksi(prisma, {}, SEKARANG);
    expect(lap.judul).toEqual(["No", "NIP", "Nama", "Unit Induk", "Unit Kerja", "Jenis", "Dari Komponen", "Ke Komponen", "Periode", "Jumlah Hari"]);
    expect(lap.jumlah).toBe(3); // dibatalkan tidak ikut
    expect(lap.namaFile).toBe("Koreksi Absensi - dibuat 28-10-2026 08.34 WIB");
    expect(lap.baris.map((b) => b[2])).toEqual(["Ani Satu", "Budi Dua", "Citra Tiga"]);
    const [a, b, c] = lap.baris;
    expect(a).toEqual([1, A, "Ani Satu", indukX, expect.any(String), "Angka (per bulan)", expect.stringMatching(/^TK - /), "Masuk (Jumlah Masuk Nyata)", "Januari 2026", 5]);
    expect(b.slice(3, 4)).toEqual([indukY]);
    expect(b[5]).toBe("Periode (rentang tanggal)");
    expect(b[8]).toBe("01-02-2026 s.d. 31-03-2026");
    expect(b[9]).toBeNull();
    expect(c[7]).toBe("Tidak dihitung (keluar/pensiun)");
    expect(c[8]).toBe("01-06-2026 s.d. tanpa batas");
    expect(JSON.stringify(lap.baris)).not.toContain("rahasia-alasan");

    expect((await laporanKoreksi(prisma, { tahun: 2026, bulan: 3, unitIndukKode: kodeY }, SEKARANG)).namaFile).toBe(`Koreksi Absensi Maret 2026 - ${indukY} - dibuat 28-10-2026 08.34 WIB`);
    expect((await laporanKoreksi(prisma, { tahun: 2026 }, SEKARANG)).namaFile).toBe("Koreksi Absensi 2026 - dibuat 28-10-2026 08.34 WIB");
  });

  it("berkas .xlsx: satu sheet, NIP teks; rute wajib login dan memakai filter", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buatBerkasKoreksi(await laporanKoreksi(prisma, {}, SEKARANG))) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Koreksi Absensi"]);
    expect(wb.worksheets[0].rowCount).toBe(4);
    expect(wb.worksheets[0].getRow(2).getCell(2).value).toBe(A);

    sesi.user = null;
    expect((await GET(new Request("http://localhost/koreksi-rekap/export"))).status).toBe(401);
    sesi.user = { id: "u1" };
    const res = await GET(new Request(`http://localhost/koreksi-rekap/export?f_tahun=2026&f_bulan=2&f_unit=${encodeURIComponent(kodeY)}`));
    expect(res.status).toBe(200);
    expect(decodeURIComponent(res.headers.get("content-disposition")!.split("filename*=UTF-8''")[1])).toMatch(/^Koreksi Absensi Februari 2026 - .+ - dibuat \d{2}-\d{2}-\d{4} \d{2}\.\d{2} WIB\.xlsx$/);
    const w2 = new ExcelJS.Workbook();
    await w2.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    expect(w2.worksheets[0].rowCount).toBe(2); // judul + B
    expect(w2.worksheets[0].getRow(2).getCell(2).value).toBe(B);
  });
});
