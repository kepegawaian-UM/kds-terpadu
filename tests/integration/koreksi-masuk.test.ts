/**
 * Koreksi Absensi dengan tujuan "Masuk" (tambahan Terpadu): hari dipindah ke Jumlah Masuk Nyata dan TOTAL ikut bertambah. Data SINTETIS di kds_test.
 * Membuktikan: jenis angka dan periode, TOTAL yang belum ada dibuat, jejak audit, validasi formulir dan impor Excel, "Masuk" hanya sebagai tujuan,
 * dan koreksi diterapkan ulang otomatis saat bulan itu diunggah lagi dengan berkas lama.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { bacaBarisKoreksi, HEADER_KOREKSI, parseKoreksi } from "@/lib/koreksi/impor";
import { buatDataKoreksi, simpanDanTerapkanKoreksi, TUJUAN_MASUK, tujuanTersedia } from "@/lib/koreksi/layanan";
import { validasiKoreksi } from "@/lib/koreksi/validasi";
import { simpanRekap } from "@/lib/impor/rekapKehadiran";
import { hitungTandai } from "@/lib/laporan/rekapBulanan";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const A = "900000000000000001";
const B = "900000000000000002";

const nilai = async (nip: string, bulan: number) =>
  Object.fromEntries((await prisma.rekapKehadiranDetail.findMany({ where: { rekap: { nip, bulan, tahun: 2026 } } })).map((d) => [d.komponenKode, d.nilai]));

const angka = (o: Partial<Parameters<typeof buatDataKoreksi>[0]> = {}) =>
  buatDataKoreksi({ jenis: "angka", nip: A, dariKomponen: "TK", keKomponen: TUJUAN_MASUK, bulan: 1, tahun: 2026, jumlahHari: 5, alasan: "ternyata masuk", ...o });

describe.skipIf(!ada)("Koreksi Absensi: tujuan Masuk", () => {
  beforeEach(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await muatKeadaan(prisma, {
      nominatif: [
        { nip: A, bulan: 1, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" },
        { nip: B, bulan: 1, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" },
      ],
      rekap: [
        { nip: A, bulan: 1, tahun: 2026, komponen: { SIGMA_HARI: "20", JUMLAH_MASUK_NYATA: "15", TK: "5", TOTAL: "15" } },
        { nip: B, bulan: 1, tahun: 2026, komponen: { SIGMA_HARI: "20", TK: "20" } }, // belum ada JUMLAH_MASUK_NYATA maupun TOTAL
      ],
    });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  it("angka: TK 5 -> Masuk; masuk 15 -> 20, TOTAL 15 -> 20, TK 0; semua perubahan tercatat di audit", async () => {
    const { koreksi, hasil } = await simpanDanTerapkanKoreksi(prisma, angka(), "Admin");
    expect(hasil).toMatchObject({ barisDiubah: 1, hariDipindah: 5, kurang: [] });
    expect(await nilai(A, 1)).toMatchObject({ TK: "0", JUMLAH_MASUK_NYATA: "20", TOTAL: "20", SIGMA_HARI: "20" });
    const audit = await prisma.auditLog.findMany({ where: { namaTabel: "rekap_kehadiran_detail", diubahOleh: `Admin (koreksi #${koreksi.id})` } });
    expect(audit.map((a) => a.fieldDiubah).sort()).toEqual(["nilai:JUMLAH_MASUK_NYATA", "nilai:TK", "nilai:TOTAL"]);
  });

  it("komponen masuk dan TOTAL yang belum ada dibuat; jumlah hari melebihi yang tersedia dicatat sebagai kurang", async () => {
    const { hasil } = await simpanDanTerapkanKoreksi(prisma, angka({ nip: B, jumlahHari: 25 }), "Admin");
    expect(hasil.hariDipindah).toBe(20);
    expect(hasil.kurang).toEqual([{ nip: B, bulan: 1, tahun: 2026, diminta: 25, tersedia: 20 }]);
    expect(await nilai(B, 1)).toMatchObject({ TK: "0", JUMLAH_MASUK_NYATA: "20", TOTAL: "20" });
  });

  it("periode: seluruh TK pada bulan yang tercakup dipindah ke Masuk (TOTAL ikut)", async () => {
    await simpanDanTerapkanKoreksi(prisma, buatDataKoreksi({ jenis: "periode", nip: A, dariKomponen: "TK", keKomponen: TUJUAN_MASUK, tanggalMulai: "2026-01-01", tanggalSelesai: "2026-01-31", alasan: "masuk penuh" }), "Admin");
    expect(await nilai(A, 1)).toMatchObject({ TK: "0", JUMLAH_MASUK_NYATA: "20", TOTAL: "20" });
  });

  it("diterapkan ulang otomatis setelah bulan itu diunggah lagi dengan berkas lama (TK kembali, lalu dipindah lagi)", async () => {
    await simpanDanTerapkanKoreksi(prisma, angka(), "Admin");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    ws.addRow(Array.from({ length: 22 }, (_, i) => `K${i + 1}`));
    // [NO, NAMA, UNIT, GOL, BULAN, SIGMA, I, S, SD, TD, TB, TK, CTH, CTM, CTB, CAP, CTLN, TOTAL, MASUK, SHIFT, NIP, ANAK]
    ws.addRow([1, "P", "U", "III/a", "Januari", 20, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 15, 15, "-", A, "-"]);
    const berkas = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await simpanRekap(prisma, berkas, "lama.xlsx", { bulan: 1, tahun: 2026 }, { id: null, nama: "Uji" });
    expect(r.koreksi.hariDipindah).toBe(5);
    expect(await nilai(A, 1)).toMatchObject({ TK: "0", JUMLAH_MASUK_NYATA: "20", TOTAL: "20" });
  });

  it("validasi formulir: Masuk diterima sebagai tujuan, ditolak sebagai asal; tujuan tersedia memuatnya", async () => {
    const dasar = { jenis: "angka", nip: A, dari_komponen: "TK", ke_komponen: TUJUAN_MASUK, tanggal_mulai: "", tanggal_selesai: "", bulan: "1", tahun: "2026", jumlah_hari: "5", alasan: "x", sumber: "" };
    expect((await validasiKoreksi(prisma, dasar)).galat).toEqual({});
    const asal = await validasiKoreksi(prisma, { ...dasar, dari_komponen: TUJUAN_MASUK, ke_komponen: "TK" });
    expect(asal.galat.dari_komponen).toBeTruthy();
    expect((await tujuanTersedia(prisma)).map((k) => k.kode)).toContain(TUJUAN_MASUK);
  });

  it("impor Excel: 'MASUK' dan kode aslinya sama-sama diterima dan disimpan sebagai JUMLAH_MASUK_NYATA", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Koreksi");
    ws.addRow(HEADER_KOREKSI);
    ws.addRow([A, "angka", "TK", "MASUK", null, null, 1, 2026, 5, "ternyata masuk", null]);
    ws.addRow([B, "angka", "TK", "JUMLAH_MASUK_NYATA", null, null, 1, 2026, 20, "ternyata masuk", null]);
    ws.addRow([B, "angka", "TK", "KODEASAL", null, null, 1, 2026, 1, "tujuan tidak dikenal", null]);
    ws.getColumn(1).numFmt = "@";
    const h = await parseKoreksi(prisma, await bacaBarisKoreksi(Buffer.from(await wb.xlsx.writeBuffer())));
    expect(h.baris.map((b) => b.status)).toEqual(["valid", "valid", "gagal"]);
    expect(h.baris[0].data.ke_komponen).toBe(TUJUAN_MASUK);
    expect(h.baris[1].data.ke_komponen).toBe(TUJUAN_MASUK);
  });

  it("sel TOTAL ikut ditandai (berwarna) bila tujuan koreksi adalah Masuk", () => {
    const tandai = hitungTandai([{ id: 1, dari: "TK", ke: TUJUAN_MASUK, alasan: "uji" }], { TK: "0", JUMLAH_MASUK_NYATA: "20", TOTAL: "20" });
    expect(Object.keys(tandai).sort()).toEqual(["JUMLAH_MASUK_NYATA", "TOTAL"]); // asal (TK) sudah 0: tidak ditandai, tujuan dan TOTAL ditandai
    expect(Object.keys(hitungTandai([{ id: 1, dari: "TK", ke: "TB", alasan: "uji" }], { TK: "0", TB: "5", TOTAL: "15" })).sort()).toEqual(["TB"]); // koreksi biasa: TOTAL tidak ditandai
  });
});
