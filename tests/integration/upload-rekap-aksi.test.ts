/**
 * Aksi server Upload Rekap (F4.1c) dari ujung ke ujung terhadap kds_test: unggah per potongan -> Periksa (tanpa tulis) ->
 * Simpan (transaksi + koreksi otomatis) -> potongan dibuang; login wajib; validasi masukan; template dapat dibaca importer.
 */
import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { batalkanUploadRekap, periksaUploadRekap, simpanUploadRekap } from "@/app/(app)/rekap-kehadiran/upload/actions";
import { GET as unduhTemplate } from "@/app/(app)/rekap-kehadiran/upload/template/route";
import { bacaBarisRekap } from "@/lib/impor/rekapKehadiran";
import { unggahBerkas } from "@/lib/upload/klien";
import { periksaBerkas } from "@/lib/upload/penjagaBerkas";
import { HEADER_TEMPLATE_REKAP } from "@/lib/upload/templateRekap";
import { POST as kirimPotongan } from "@/app/api/upload-chunk/route";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const sesi = vi.hoisted(() => ({ user: { id: "u1", name: "Admin Uji" } as { id: string; name: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const nip = (n: number) => `9000000000${String(n).padStart(8, "0")}`;

async function xlsx(nips: string[]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(HEADER_TEMPLATE_REKAP);
  nips.forEach((n, i) => ws.addRow([i + 1, `P${i}`, "U", "III/a", "September", 30, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 24, 24, "-", n, "-"]));
  return new File([new Uint8Array(await wb.xlsx.writeBuffer())], "rekap-september.xlsx");
}

const kirim = async (berkas: File) =>
  unggahBerkas(berkas, {
    fetchFn: (async (url: string, init?: RequestInit) => kirimPotongan(new Request(`http://localhost${url}`, init))) as unknown as typeof fetch,
  });

describe.skipIf(!ada)("Aksi Upload Rekap", () => {
  beforeEach(async () => {
    sesi.user = { id: "u1", name: "Admin Uji" };
    await kosongkanDomain(prisma);
    await prisma.uploadChunk.deleteMany();
    await muatKeadaan(prisma, { nominatif: [1, 2, 3].map((n) => ({ nip: nip(n), bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" })) });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.uploadChunk.deleteMany();
    await prisma.$disconnect();
  });

  const masukan = (u: { uploadId: string; totalPotongan: number; namaFile: string }, o: Partial<{ bulan: number; tahun: number; namaSheet: string }> = {}) => ({
    uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile, bulan: 9, tahun: 2026, namaSheet: "", ...o,
  });

  it("alur lengkap: unggah -> Periksa tidak menulis -> Simpan menulis dan membuang potongan", async () => {
    await prisma.user.create({ data: { id: "u1", email: "uji@example.test", passwordHash: "x", nama: "Admin Uji" } }).catch(() => undefined);
    const u = await kirim(await xlsx([nip(1), nip(2), nip(77)]));

    const p = await periksaUploadRekap(masukan(u));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.ringkasan).toMatchObject({ totalBaris: 3, berhasil: 2, gagal: 1, akanBaru: 2, akanDiganti: 0, bulanDiBerkas: "September", catatanTotal: 1 });
    expect(await prisma.rekapKehadiranBulanan.count()).toBe(0);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(1); // masih tersimpan untuk tahap Simpan

    const s = await simpanUploadRekap(masukan(u));
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(await prisma.rekapKehadiranBulanan.count()).toBe(2);
    const batch = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: s.batchId } });
    expect(batch).toMatchObject({ jenis: "kehadiran_bulanan", bulan: 9, tahun: 2026, status: "Selesai", namaFileAsli: "rekap-september.xlsx", diunggahOlehNama: "Admin Uji", jumlahBerhasil: 2, jumlahGagal: 1 });
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(0);
  });

  it("sesi dengan id pengguna yang sudah tidak ada tetap bisa menyimpan (tanpa relasi pengunggah, nama tetap tercatat)", async () => {
    sesi.user = { id: "id-tidak-ada-lagi", name: "Admin Lama" };
    const u = await kirim(await xlsx([nip(1)]));
    const s = await simpanUploadRekap(masukan(u));
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(await prisma.uploadBatch.findUniqueOrThrow({ where: { id: s.batchId } })).toMatchObject({ diunggahOlehId: null, diunggahOlehNama: "Admin Lama" });
  });

  it("koreksi aktif diterapkan otomatis saat Simpan dan dilaporkan", async () => {
    await prisma.koreksiRekap.create({
      data: { nip: nip(1), jenis: "periode", dariKomponen: "TK", keKomponen: "TB", tanggalMulai: new Date("2026-09-01T00:00:00Z"), alasan: "uji", dibuatOleh: "t", dibuatPada: new Date() },
    });
    const u = await kirim(await xlsx([nip(1)]));
    const s = await simpanUploadRekap(masukan(u));
    expect(s).toMatchObject({ ok: true, koreksi: { barisDiubah: 1, hariDipindah: 6 } });
    const nilai = Object.fromEntries((await prisma.rekapKehadiranDetail.findMany()).map((d) => [d.komponenKode, d.nilai]));
    expect(nilai).toMatchObject({ TK: "0", TB: "6" });
  });

  it("menolak tanpa login (Periksa, Simpan) dan tidak menulis apa pun", async () => {
    const u = await kirim(await xlsx([nip(1)]));
    sesi.user = null;
    expect(await periksaUploadRekap(masukan(u))).toMatchObject({ ok: false, error: expect.stringMatching(/login/) });
    expect(await simpanUploadRekap(masukan(u))).toMatchObject({ ok: false, error: expect.stringMatching(/login/) });
    await batalkanUploadRekap(u.uploadId);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(1); // batal tanpa login tidak berlaku
    expect(await prisma.rekapKehadiranBulanan.count()).toBe(0);
  });

  it("memvalidasi masukan: bulan, tahun, nama sheet, nama berkas, uploadId, potongan tidak lengkap", async () => {
    const u = await kirim(await xlsx([nip(1)]));
    expect(await periksaUploadRekap(masukan(u, { bulan: 13 }))).toMatchObject({ ok: false, bidang: "bulan" });
    expect(await periksaUploadRekap(masukan(u, { tahun: 1999 }))).toMatchObject({ ok: false, bidang: "tahun" });
    expect(await periksaUploadRekap(masukan(u, { namaSheet: "x".repeat(101) }))).toMatchObject({ ok: false, bidang: "nama_sheet" });
    expect(await periksaUploadRekap({ ...masukan(u), namaFile: "data.csv" })).toMatchObject({ ok: false, bidang: "file" });
    expect(await periksaUploadRekap({ ...masukan(u), uploadId: "bukan-uuid" })).toMatchObject({ ok: false });
    expect(await periksaUploadRekap({ ...masukan(u), totalPotongan: 2 })).toMatchObject({ ok: false, error: expect.stringMatching(/tidak lengkap/) });
    expect(await periksaUploadRekap({ ...masukan(u), uploadId: randomUUID() })).toMatchObject({ ok: false, error: expect.stringMatching(/tidak lengkap/) });
    expect(await periksaUploadRekap(masukan(u, { namaSheet: "Tidak Ada" }))).toMatchObject({ ok: false, bidang: "nama_sheet", error: expect.stringContaining('"Data"') });
  });

  it("berkas rusak ditolak dengan pesan jelas; Simpan yang gagal tidak menulis dan potongan tetap ada", async () => {
    const u = await kirim(new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "rusak.xlsx"));
    expect(await periksaUploadRekap(masukan(u))).toMatchObject({ ok: false, error: expect.stringMatching(/tidak bisa dibaca/) });
    expect(await simpanUploadRekap(masukan(u))).toMatchObject({ ok: false });
    expect(await prisma.uploadBatch.count({ where: { jenis: "kehadiran_bulanan" } })).toBe(0);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(1);
  });

  it("batal membuang potongan", async () => {
    const u = await kirim(await xlsx([nip(1)]));
    await batalkanUploadRekap(u.uploadId);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(0);
  });

  it("template: perlu login, dapat dibaca importer (posisi kolom benar), dan berisi petunjuk", async () => {
    sesi.user = null;
    expect((await unduhTemplate()).status).toBe(401);
    sesi.user = { id: "u1", name: "Admin Uji" };
    const res = await unduhTemplate();
    expect(res.headers.get("content-disposition")).toContain("Template_Upload_Rekap_Kehadiran_Bulanan.xlsx");
    const berkas = Buffer.from(await res.arrayBuffer());
    expect(await periksaBerkas(berkas)).toBeNull();
    const baris = await bacaBarisRekap(berkas, null);
    expect(baris[0]).toEqual(HEADER_TEMPLATE_REKAP);
    expect(baris[1][20]).toBe("199001012020011001"); // NIP contoh di kolom 21, sebagai teks
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(berkas as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Data", "Petunjuk Pengisian"]);
  });
});
