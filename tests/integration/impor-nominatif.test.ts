/**
 * Importer Nominatif (F4.3a), sifat di luar paritas data: Periksa tidak menulis, ringkasan (diganti/baru/pegawai baru/tidak ada
 * di berkas), id baris dipertahankan saat unggah ulang, atomisitas, dan 2.800 baris dalam batas waktu. Data sintetis di kds_test.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { periksaNominatif, simpanNominatif } from "@/lib/impor/nominatif";
import { KesalahanUpload } from "@/lib/upload/konstanta";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const pengguna = { id: null, nama: "Uji" };
const nip = (n: number) => `9000000000${String(n).padStart(8, "0")}`;

const HEADER = [
  "NIP", "Nama", "Jenis Kelamin", "Tanggal Lahir", "Pendidikan Terakhir", "Agama", "Jenis Pegawai", "Status Kepegawaian", "Golongan", "Jabatan Fungsional/Fungsi Umum",
  "Kategori Akademisi Luar", "Unit Kerja", "Tanggal Mulai Kerja (TMT)", "Jabatan Tambahan 1", "Unit/Prodi 1", "Status Pengangkatan 1", "Jabatan Tambahan 2", "Unit/Prodi 2",
  "Status Pengangkatan 2", "Jabatan Tambahan 3", "Unit/Prodi 3", "Status Pengangkatan 3",
];
let unitNama = "";

async function xlsx(nips: (string | null)[], ubah: (n: string | null, i: number) => Partial<Record<number, string>> = () => ({})): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Nominatif Bulanan");
  ws.addRow(HEADER);
  nips.forEach((n, i) => {
    const sel: (string | null)[] = [n, `Nama ${i}`, "L", "1990-05-17", "S1", "Islam", "DSN", "PNS", "III/a", "", "", unitNama, "2018-03-04", ...Array(9).fill("")];
    for (const [k, v] of Object.entries(ubah(n, i))) sel[Number(k)] = v as string;
    ws.addRow(sel);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe.skipIf(!ada)("Importer Nominatif (Periksa dan transaksi)", () => {
  beforeAll(async () => {
    unitNama = (await prisma.unitAsal.findFirstOrThrow({ orderBy: { kode: "asc" } })).nama;
  });
  beforeEach(async () => {
    await kosongkanDomain(prisma);
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("Periksa tidak menulis apa pun dan menghitung diganti/baru/pegawai baru/tidak ada di berkas (dibanding snapshot sebelumnya)", async () => {
    await muatKeadaan(prisma, {
      nominatif: [
        ...[1, 2, 3, 4].map((n) => ({ nip: nip(n), bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" })), // Agustus: 4 pegawai
        { nip: nip(1), bulan: 9, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" }, // September: nip 1 sudah ada
      ],
    });
    const sebelum = { n: await prisma.nominatifBulanan.count(), p: await prisma.pegawai.count(), b: await prisma.uploadBatch.count() };

    const r = await periksaNominatif(prisma, await xlsx([nip(1), nip(2), nip(50)]), { bulan: 9, tahun: 2026 });
    expect(r).toMatchObject({ totalBaris: 3, berhasil: 3, gagal: 0, peringatan: 0, akanDiganti: 1, akanBaru: 2, pegawaiBaru: 1 });
    // pembanding = snapshot terdekat SEBELUM September (= Agustus, 4 pegawai); nip 3 dan 4 tidak ada di berkas
    expect(r.pembanding).toEqual({ bulan: 8, tahun: 2026, jumlah: 4 });
    expect(r.tidakAdaDiBerkas).toBe(2);
    expect({ n: await prisma.nominatifBulanan.count(), p: await prisma.pegawai.count(), b: await prisma.uploadBatch.count() }).toEqual(sebelum);
  });

  it("tanpa snapshot sebelumnya: pembanding null", async () => {
    const r = await periksaNominatif(prisma, await xlsx([nip(1)]), { bulan: 9, tahun: 2026 });
    expect(r).toMatchObject({ pembanding: null, tidakAdaDiBerkas: 0, pegawaiBaru: 1, akanBaru: 1 });
  });

  it("unggah ulang mempertahankan id baris (penting untuk 'snapshot terakhir' laporan tahunan) dan baris baru mendapat id baru", async () => {
    await simpanNominatif(prisma, await xlsx([nip(1), nip(2)]), "a.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    const awal = new Map((await prisma.nominatifBulanan.findMany()).map((n) => [n.pegawaiNip, n.id]));
    await simpanNominatif(prisma, await xlsx([nip(2), nip(1), nip(3)], (_, i) => ({ 1: `Ubah ${i}` })), "b.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    const akhir = await prisma.nominatifBulanan.findMany({ orderBy: { id: "asc" } });
    expect(akhir).toHaveLength(3);
    expect(akhir.find((n) => n.pegawaiNip === nip(1))!.id).toBe(awal.get(nip(1)));
    expect(akhir.find((n) => n.pegawaiNip === nip(2))!.id).toBe(awal.get(nip(2)));
    expect(akhir.find((n) => n.pegawaiNip === nip(3))!.id).toBeGreaterThan(Math.max(...awal.values()));
    expect(akhir.find((n) => n.pegawaiNip === nip(1))!.nama).toBe("Ubah 1"); // ditimpa
    expect(await prisma.pegawai.count()).toBe(3);
  });

  it("berkas dengan kolom bergeser ditolak seluruhnya sebelum menyentuh database", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Nominatif Bulanan");
    ws.addRow(["NIP", "Nama", "Tempat Lahir", ...HEADER.slice(2)]);
    ws.addRow([nip(1)]);
    const berkas = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(simpanNominatif(prisma, berkas, "x.xlsx", { bulan: 9, tahun: 2026 }, pengguna)).rejects.toBeInstanceOf(KesalahanUpload);
    await expect(periksaNominatif(prisma, berkas, { bulan: 9, tahun: 2026 })).rejects.toThrow(/Susunan kolom file tidak sesuai/);
    expect(await prisma.uploadBatch.count()).toBe(0);
    expect(await prisma.pegawai.count()).toBe(0);
  });

  it("kegagalan di tengah penulisan membatalkan SEMUA (tanpa batch, pegawai, nominatif)", async () => {
    // gagal dipaksa dengan pengunggah yang tidak ada (pelanggaran kunci asing pada awal transaksi): tidak boleh ada yang tertinggal
    const sebelum = { b: await prisma.uploadBatch.count(), p: await prisma.pegawai.count(), n: await prisma.nominatifBulanan.count() };
    await expect(simpanNominatif(prisma, await xlsx([nip(1), nip(2)]), "x.xlsx", { bulan: 9, tahun: 2026 }, { id: "tidak-ada", nama: "X" })).rejects.toThrow();
    expect({ b: await prisma.uploadBatch.count(), p: await prisma.pegawai.count(), n: await prisma.nominatifBulanan.count() }).toEqual(sebelum);
  });

  it("2.800 pegawai tersimpan, dan unggah ulang mengganti, dalam batas waktu", async () => {
    const nips = Array.from({ length: 2800 }, (_, i) => nip(i));
    const berkas = await xlsx(nips);
    let t = performance.now();
    await simpanNominatif(prisma, berkas, "besar.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    const awal = performance.now() - t;
    expect(await prisma.nominatifBulanan.count()).toBe(2800);
    expect(await prisma.pegawai.count()).toBe(2800);
    t = performance.now();
    await simpanNominatif(prisma, berkas, "besar.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    const ulang = performance.now() - t;
    expect(await prisma.nominatifBulanan.count()).toBe(2800);
    console.log(`simpan Nominatif 2.800 pegawai: awal ${awal.toFixed(0)} ms, ulang (mengganti) ${ulang.toFixed(0)} ms`);
    expect(awal).toBeLessThan(20_000);
    expect(ulang).toBeLessThan(20_000);
  }, 90_000);
});
