/**
 * Importer Rekap (F4.1b), sifat-sifat di luar paritas data: Periksa tidak menulis apa pun, ringkasan "akan
 * diganti", kegagalan di tengah penyimpanan membatalkan SEMUANYA (satu transaksi), dan unggahan besar muat dalam
 * batas waktu. Data sintetis di kds_test.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { periksaRekap, simpanRekap } from "@/lib/impor/rekapKehadiran";
import { KesalahanUpload } from "@/lib/upload/konstanta";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const pengguna = { id: null, nama: "Uji" };
const nip = (n: number) => `9000000000${String(n).padStart(8, "0")}`;

async function xlsx(nips: (string | null)[], bulanTeks = "September"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(Array.from({ length: 22 }, (_, i) => `K${i + 1}`));
  nips.forEach((n, i) => {
    const sel: (string | number | null)[] = [i + 1, `P${i}`, "U", "III/a", bulanTeks, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 22, 22, "-", n, "-"];
    ws.addRow(sel);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function siapkan(jumlah: number, tmt = "2018-01-01") {
  const [s, u] = await Promise.all([prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }), prisma.unitAsal.findFirstOrThrow()]);
  const b = await prisma.uploadBatch.create({ data: { jenis: "nominatif_bulanan", namaFileAsli: "n", diunggahOlehNama: "t" } });
  await prisma.pegawai.createMany({ data: Array.from({ length: jumlah }, (_, i) => ({ nip: nip(i) })) });
  await prisma.nominatifBulanan.createMany({
    data: Array.from({ length: jumlah }, (_, i) => ({
      pegawaiNip: nip(i), bulan: 9, tahun: 2026, nama: `P${i}`, jenisKelamin: "L", jenisPegawaiKode: i % 2 ? "TDK" : "DSN",
      statusKepegawaianKode: s.kode, unitAsalKode: u.kode, tanggalMulaiKerja: new Date(`${tmt}T00:00:00.000Z`), uploadBatchId: b.id,
    })),
  });
}

const hitung = async () => ({
  batch: await prisma.uploadBatch.count({ where: { jenis: "kehadiran_bulanan" } }),
  header: await prisma.rekapKehadiranBulanan.count(),
  detail: await prisma.rekapKehadiranDetail.count(),
  catatan: await prisma.barisGagalUpload.count(),
});

describe.skipIf(!ada)("Importer Rekap (sifat transaksi dan Periksa)", () => {
  beforeEach(async () => {
    await kosongkanDomain(prisma);
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("Periksa tidak menulis apa pun, tetapi menghitung yang akan diganti dan yang baru", async () => {
    await siapkan(5);
    // rekap lama untuk pegawai 0 dan 1
    await simpanRekap(prisma, await xlsx([nip(0), nip(1)]), "lama.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    const sebelum = await hitung();

    const r = await periksaRekap(prisma, await xlsx([nip(0), nip(2), nip(3), nip(99)]), { bulan: 9, tahun: 2026 });
    expect(r).toMatchObject({ totalBaris: 4, berhasil: 3, gagal: 1, peringatan: 0, akanDiganti: 1, akanBaru: 2, bulanDiBerkas: "September" });
    expect(r.catatan).toEqual([{ nomorBaris: 5, nipDimaksud: nip(99), alasan: "NIP tidak ditemukan di Nominatif" }]);
    expect(await hitung()).toEqual(sebelum);
  });

  it("bulanDiBerkas menangkap salah pilih bulan dan peringatan dihitung", async () => {
    await siapkan(3);
    const r = await periksaRekap(prisma, await xlsx([nip(0), nip(1), nip(2)], "Agustus"), { bulan: 9, tahun: 2026 });
    expect(r.bulanDiBerkas).toBe("Agustus");
    expect(r.peringatan).toBe(3);
    expect(r.berhasil).toBe(3);
  });

  it("kegagalan di tengah penyimpanan membatalkan SEMUA (tidak ada batch, header, detail, atau catatan tersisa)", async () => {
    await siapkan(4);
    const berkas = await xlsx([nip(0), nip(1), nip(2), nip(77)]);
    const sebelum = await hitung();
    await expect(
      simpanRekap(prisma, berkas, "x.xlsx", { bulan: 9, tahun: 2026 }, pengguna, async () => {
        throw new Error("gagal sengaja");
      }),
    ).rejects.toThrow("gagal sengaja");
    expect(await hitung()).toEqual(sebelum);
  });

  it("kegagalan saat MENGGANTI data lama mengembalikan data lama utuh", async () => {
    await siapkan(3);
    await simpanRekap(prisma, await xlsx([nip(0), nip(1)]), "lama.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    await prisma.rekapKehadiranDetail.updateMany({ where: { komponenKode: "SIGMA_HARI" }, data: { nilai: "LAMA" } });
    await expect(
      simpanRekap(prisma, await xlsx([nip(0), nip(1), nip(2)]), "baru.xlsx", { bulan: 9, tahun: 2026 }, pengguna, async () => {
        throw new Error("gagal sengaja");
      }),
    ).rejects.toThrow();
    const sisa = await prisma.rekapKehadiranDetail.findMany({ where: { komponenKode: "SIGMA_HARI" } });
    expect(sisa).toHaveLength(2);
    expect(sisa.every((d) => d.nilai === "LAMA")).toBe(true);
    expect(await prisma.rekapKehadiranBulanan.count()).toBe(2);
  });

  it("menyimpan batch dengan periode, status Selesai, dan pengunggah", async () => {
    await siapkan(2);
    const { batchId, ringkasan } = await simpanRekap(prisma, await xlsx([nip(0), nip(1)]), "rekap-september.xlsx", { bulan: 9, tahun: 2026 }, { id: null, nama: "Admin Uji" });
    const b = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(b).toMatchObject({ jenis: "kehadiran_bulanan", bulan: 9, tahun: 2026, status: "Selesai", namaFileAsli: "rekap-september.xlsx", diunggahOlehNama: "Admin Uji", jumlahBarisTotal: 2, jumlahBerhasil: 2, jumlahGagal: 0 });
    expect(ringkasan.akanBaru).toBe(2);
  });

  it("berkas rusak atau bukan xlsx ditolak dengan KesalahanUpload sebelum menyentuh database", async () => {
    await siapkan(1);
    const sebelum = await hitung();
    await expect(simpanRekap(prisma, Buffer.from("bukan excel"), "x.xlsx", { bulan: 9, tahun: 2026 }, pengguna)).rejects.toBeInstanceOf(KesalahanUpload);
    await expect(periksaRekap(prisma, Buffer.from("bukan excel"), { bulan: 9, tahun: 2026 })).rejects.toBeInstanceOf(KesalahanUpload);
    expect(await hitung()).toEqual(sebelum);
  });

  it("2.800 pegawai (±45 ribu baris detail) tersimpan, dan re-upload mengganti, dalam batas waktu", async () => {
    await siapkan(2800);
    const berkas = await xlsx(Array.from({ length: 2800 }, (_, i) => nip(i)));
    let t = performance.now();
    await simpanRekap(prisma, berkas, "besar.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    const awal = performance.now() - t;
    expect(await prisma.rekapKehadiranBulanan.count()).toBe(2800);
    expect(await prisma.rekapKehadiranDetail.count()).toBe(2800 * 16);

    t = performance.now();
    await simpanRekap(prisma, berkas, "besar.xlsx", { bulan: 9, tahun: 2026 }, pengguna);
    const ulang = performance.now() - t;
    expect(await prisma.rekapKehadiranBulanan.count()).toBe(2800);
    expect(await prisma.rekapKehadiranDetail.count()).toBe(2800 * 16);
    console.log(`simpan 2.800 pegawai: awal ${awal.toFixed(0)} ms, ulang (mengganti) ${ulang.toFixed(0)} ms`);
    expect(awal).toBeLessThan(20_000);
    expect(ulang).toBeLessThan(20_000);
  }, 90_000);
});
