/**
 * Aksi server Upload Nominatif (F4.3b) dari ujung ke ujung terhadap kds_test: unggah per potongan -> Periksa (tanpa tulis)
 * -> Simpan -> potongan dibuang; login wajib; validasi masukan; template yang diunduh LOLOS diimpor oleh importer sendiri.
 */
import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { batalkanUploadNominatif, periksaUploadNominatif, simpanUploadNominatif } from "@/app/(app)/nominatif/upload/actions";
import { GET as unduhTemplate } from "@/app/(app)/nominatif/upload/template/route";
import { POST as kirimPotongan } from "@/app/api/upload-chunk/route";
import { bacaBarisNominatif } from "@/lib/impor/nominatif";
import { unggahBerkas } from "@/lib/upload/klien";
import { HEADER_TEMPLATE_NOMINATIF } from "@/lib/upload/templateNominatif";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const sesi = vi.hoisted(() => ({ user: { id: "u1", name: "Admin Uji" } as { id: string; name: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();

const kirim = async (berkas: File) =>
  unggahBerkas(berkas, {
    fetchFn: (async (url: string, init?: RequestInit) => kirimPotongan(new Request(`http://localhost${url}`, init))) as unknown as typeof fetch,
  });

const masukan = (u: { uploadId: string; totalPotongan: number; namaFile: string }, o: Partial<{ bulan: number; tahun: number; namaSheet: string }> = {}) => ({
  uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile, bulan: 9, tahun: 2026, namaSheet: "", ...o,
});

async function berkasTemplate(): Promise<File> {
  const res = await unduhTemplate();
  return new File([new Uint8Array(await res.arrayBuffer())], "template.xlsx");
}

describe.skipIf(!ada)("Aksi Upload Nominatif", () => {
  beforeEach(async () => {
    sesi.user = { id: "u1", name: "Admin Uji" };
    await kosongkanDomain(prisma);
    await prisma.uploadChunk.deleteMany();
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.uploadChunk.deleteMany();
    await prisma.$disconnect();
  });

  it("template yang diunduh: perlu login, header sesuai kontrak, dan KEDUA baris contoh lolos diimpor", async () => {
    sesi.user = null;
    expect((await unduhTemplate()).status).toBe(401);
    sesi.user = { id: "u1", name: "Admin Uji" };
    const res = await unduhTemplate();
    expect(res.headers.get("content-disposition")).toContain("Template_Upload_Nominatif_Bulanan.xlsx");
    const berkas = Buffer.from(await res.arrayBuffer());
    const { baris, slot3 } = await bacaBarisNominatif(berkas, null);
    expect(slot3).toBe(true);
    expect(baris[0]).toEqual(HEADER_TEMPLATE_NOMINATIF);
    expect(baris[1][0]).toBe("199001012020011001"); // NIP sebagai teks
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(berkas as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Nominatif Bulanan", "Petunjuk Pengisian"]);

    const u = await kirim(await berkasTemplate());
    const p = await periksaUploadNominatif(masukan(u));
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.ringkasan, JSON.stringify(p.ringkasan.catatan)).toMatchObject({ totalBaris: 2, berhasil: 2, gagal: 0 });
  });

  it("alur lengkap: unggah -> Periksa tidak menulis -> Simpan menulis dan membuang potongan", async () => {
    await prisma.user.create({ data: { id: "u1", email: "uji2@example.test", passwordHash: "x", nama: "Admin Uji" } }).catch(() => undefined);
    const u = await kirim(await berkasTemplate());

    const p = await periksaUploadNominatif(masukan(u));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.ringkasan).toMatchObject({ berhasil: 2, akanBaru: 2, akanDiganti: 0, pegawaiBaru: 2, pembanding: null });
    expect(await prisma.nominatifBulanan.count()).toBe(0);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(1);

    const s = await simpanUploadNominatif(masukan(u));
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(await prisma.nominatifBulanan.count()).toBe(2);
    expect(await prisma.pegawai.count()).toBe(2);
    expect(await prisma.uploadBatch.findUniqueOrThrow({ where: { id: s.batchId } })).toMatchObject({
      jenis: "nominatif_bulanan", bulan: 9, tahun: 2026, status: "Selesai", namaFileAsli: "template.xlsx", diunggahOlehNama: "Admin Uji", jumlahBerhasil: 2, jumlahGagal: 0,
    });
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(0);
  });

  it("sesi dengan id pengguna yang sudah tidak ada tetap bisa menyimpan", async () => {
    sesi.user = { id: "id-tidak-ada-lagi", name: "Admin Lama" };
    const u = await kirim(await berkasTemplate());
    const s = await simpanUploadNominatif(masukan(u));
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(await prisma.uploadBatch.findUniqueOrThrow({ where: { id: s.batchId } })).toMatchObject({ diunggahOlehId: null, diunggahOlehNama: "Admin Lama" });
  });

  it("menolak tanpa login dan tidak menulis apa pun", async () => {
    const u = await kirim(await berkasTemplate());
    sesi.user = null;
    expect(await periksaUploadNominatif(masukan(u))).toMatchObject({ ok: false, error: expect.stringMatching(/login/) });
    expect(await simpanUploadNominatif(masukan(u))).toMatchObject({ ok: false, error: expect.stringMatching(/login/) });
    await batalkanUploadNominatif(u.uploadId);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(1);
    expect(await prisma.nominatifBulanan.count()).toBe(0);
  });

  it("memvalidasi masukan dan menolak berkas bergeser/rusak dengan pesan jelas", async () => {
    const u = await kirim(await berkasTemplate());
    expect(await periksaUploadNominatif(masukan(u, { bulan: 0 }))).toMatchObject({ ok: false, bidang: "bulan" });
    expect(await periksaUploadNominatif(masukan(u, { tahun: 2101 }))).toMatchObject({ ok: false, bidang: "tahun" });
    expect(await periksaUploadNominatif({ ...masukan(u), namaFile: "x.csv" })).toMatchObject({ ok: false, bidang: "file" });
    expect(await periksaUploadNominatif({ ...masukan(u), uploadId: randomUUID() })).toMatchObject({ ok: false, error: expect.stringMatching(/tidak lengkap/) });
    expect(await periksaUploadNominatif(masukan(u, { namaSheet: "Tidak Ada" }))).toMatchObject({ ok: false, bidang: "nama_sheet" });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Nominatif Bulanan");
    ws.addRow(["NIP", "Nama", "Tempat Lahir", ...HEADER_TEMPLATE_NOMINATIF.slice(2)]);
    const bergeser = await kirim(new File([new Uint8Array(await wb.xlsx.writeBuffer())], "bergeser.xlsx"));
    expect(await periksaUploadNominatif(masukan(bergeser))).toMatchObject({ ok: false, error: expect.stringMatching(/Susunan kolom file tidak sesuai/) });
    expect(await simpanUploadNominatif(masukan(bergeser))).toMatchObject({ ok: false });
    expect(await prisma.uploadBatch.count({ where: { jenis: "nominatif_bulanan" } })).toBe(0);

    const rusak = await kirim(new File([new Uint8Array([1, 2, 3, 4, 5, 6])], "rusak.xlsx"));
    expect(await periksaUploadNominatif(masukan(rusak))).toMatchObject({ ok: false, error: expect.stringMatching(/tidak bisa dibaca/) });
  });

  it("batal membuang potongan", async () => {
    const u = await kirim(await berkasTemplate());
    await batalkanUploadNominatif(u.uploadId);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(0);
  });
});
