/**
 * Standarisasi (F4.5a), sifat di luar paritas KDS1: Periksa tidak menulis, ringkasan, atomisitas, berkas tak dikenal, tanggal tidak
 * bergeser menurut zona waktu server, dan penyelesaian baris Review (satu kali, ganti jabatan tambahan lama, pengguna sesi lama).
 */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { periksaStandarisasi, simpanStandarisasi } from "@/lib/standarisasi/proses";
import { selesaikanBaris } from "@/lib/standarisasi/resolve";
import { KesalahanUpload } from "@/lib/upload/konstanta";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { buatBerkasRaw, type Vocab } from "../support/rawSimpega";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();

async function vocab(): Promise<Vocab> {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()), umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama), status: await prisma.statusKepegawaian.findMany(),
    role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole), prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
}

const hitung = async () => ({
  nominatif: await prisma.nominatifBulanan.count(), batch: await prisma.uploadBatch.count(), baris: await prisma.barisBermasalah.count(), pegawai: await prisma.pegawai.count(),
  jt: await prisma.nominatifBulananJabatanTambahan.count(),
});

describe.skipIf(!ada)("Standarisasi (Periksa, transaksi, Review)", () => {
  beforeEach(async () => {
    await kosongkanDomain(prisma);
    await prisma.kamusKoreksi.deleteMany();
    await prisma.auditLog.deleteMany();
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.kamusKoreksi.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  it("Periksa tidak menulis apa pun; ringkasan memuat hitungan, alasan review, jumlah yang akan ditimpa, dan pegawai yang hilang", async () => {
    const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 10, tahun: 2026, jumlah: 80, benih: 11, tanpaPlaceholder: true });
    await simpanStandarisasi(prisma, buffer, "september.xlsx", { bulan: 9, tahun: 2026 }, { id: null, nama: "t" }); // snapshot September sebagai pembanding
    const septemberNip = (await prisma.nominatifBulanan.findMany({ select: { pegawaiNip: true } })).length;
    expect(septemberNip).toBeGreaterThan(10);
    const sebelum = await hitung();

    const lain = await buatBerkasRaw({ vocab: await vocab(), bulan: 10, tahun: 2026, jumlah: 40, benih: 12, awalNip: 9000, tanpaPlaceholder: true });
    const r = await periksaStandarisasi(prisma, lain.buffer, { bulan: 10, tahun: 2026 });
    expect(r.totalBaris).toBe(40);
    expect(r.berhasil + r.perluReview).toBe(40);
    expect(r.perAlasan.reduce((s, a) => s + a.jumlah, 0)).toBe(r.perluReview);
    expect(r.akanMenimpa).toBe(0); // Oktober belum ada
    expect(r.pembanding).toMatchObject({ bulan: 9, tahun: 2026 });
    expect(r.tidakAdaDiBerkas).toBeGreaterThan(0); // berkas Oktober berisi NIP lain
    expect(await hitung()).toEqual(sebelum);

    const timpa = await periksaStandarisasi(prisma, buffer, { bulan: 9, tahun: 2026 });
    expect(timpa.akanMenimpa).toBe(sebelum.nominatif);
  });

  it("berkas bukan format SIMPEGA, rusak, atau bukan xlsx ditolak dengan pesan jelas tanpa menulis", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Lain").addRow(["a", "b"]);
    const asing = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(simpanStandarisasi(prisma, asing, "x.xlsx", { bulan: 10, tahun: 2026 }, { id: null, nama: "t" })).rejects.toThrow(/Format file tidak dikenali/);
    await expect(periksaStandarisasi(prisma, Buffer.from("bukan excel"), { bulan: 10, tahun: 2026 })).rejects.toBeInstanceOf(KesalahanUpload);
    expect(await hitung()).toEqual({ nominatif: 0, batch: 0, baris: 0, pegawai: 0, jt: 0 });
  });

  it("kegagalan di tengah penyimpanan membatalkan SEMUA dan snapshot lama bulan itu tetap utuh", async () => {
    const v = await vocab();
    const awal = await buatBerkasRaw({ vocab: v, bulan: 10, tahun: 2026, jumlah: 40, benih: 21, tanpaPlaceholder: true });
    await simpanStandarisasi(prisma, awal.buffer, "awal.xlsx", { bulan: 10, tahun: 2026 }, { id: null, nama: "t" });
    const sebelum = await hitung();
    const baru = await buatBerkasRaw({ vocab: v, bulan: 10, tahun: 2026, jumlah: 40, benih: 22, awalNip: 700, tanpaPlaceholder: true });
    // pengunggah tidak ada: pelanggaran kunci asing tepat setelah batch dibuat, sebelum snapshot lama dihapus/diganti
    await expect(simpanStandarisasi(prisma, baru.buffer, "baru.xlsx", { bulan: 10, tahun: 2026 }, { id: "tidak-ada", nama: "X" })).rejects.toThrow();
    expect(await hitung()).toEqual(sebelum);
    expect((await prisma.uploadBatch.findMany()).every((b) => b.status !== "Dibatalkan")).toBe(true);
  });

  it("tanggal masuk dari berkas tersimpan apa adanya (tidak bergeser sehari menurut zona waktu server)", async () => {
    const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 10, tahun: 2026, jumlah: 30, benih: 31, tanpaPlaceholder: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const kolomTanggal = 9; // "Tanggal Masuk"
    const nilai = new Map<string, string>();
    ws.eachRow((r, n) => {
      if (n === 1) return;
      const nip = String(r.getCell(1).value).replace(/[​-‏﻿]/g, "");
      nilai.set(nip, String(r.getCell(kolomTanggal).value).replace(/[​-‏﻿]/g, ""));
    });
    await simpanStandarisasi(prisma, buffer, "tgl.xlsx", { bulan: 10, tahun: 2026 }, { id: null, nama: "t" });
    const baris = await prisma.nominatifBulanan.findMany({ select: { pegawaiNip: true, tanggalMulaiKerja: true } });
    expect(baris.length).toBeGreaterThan(5);
    for (const b of baris) expect(b.tanggalMulaiKerja.toISOString().slice(0, 10)).toBe(nilai.get(b.pegawaiNip));
  });

  it("selesaikanBaris: sekali saja, mengganti jabatan tambahan lama, dan tetap bekerja untuk pengguna sesi lama", async () => {
    const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 10, tahun: 2026, jumlah: 120, benih: 41, tanpaPlaceholder: true });
    const admin = await prisma.user.create({ data: { email: `r${Date.now()}@uji.test`, passwordHash: "x", nama: "Admin" } });
    const { batchId } = await simpanStandarisasi(prisma, buffer, "r.xlsx", { bulan: 10, tahun: 2026 }, { id: admin.id, nama: "Admin" });
    const menunggu = await prisma.barisBermasalah.findMany({ where: { uploadBatchId: batchId }, orderBy: { nip: "asc" } });
    expect(menunggu.length).toBeGreaterThan(3);

    const unit = (await prisma.unitAsal.findFirstOrThrow()).kode;
    const status = (await prisma.statusKepegawaian.findFirstOrThrow({ where: { kategori: "ASN" } })).kode;
    const role = (await prisma.jabatanTambahanRole.findMany({ take: 2, orderBy: { kode: "asc" } })).map((r) => r.kode);
    const data = {
      nama: "Selesai", jenisKelamin: "P" as const, tanggalLahir: null, pendidikanTerakhir: null, jenisPegawaiKode: "TDK", statusKepegawaianKode: status, golonganKode: "III/a",
      jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: (await prisma.jabatanFungsiUmumPelaksana.findFirstOrThrow()).kode, kategoriAkademisiLuarKode: null,
      unitAsalKode: unit, tanggalMulaiKerja: new Date("2020-02-02T00:00:00Z"),
      jabatanTambahan: [{ jabatanTambahanRoleKode: role[0], unitAsalKode: unit, programStudiKode: null, statusPengangkatan: "Definitif" }],
    };
    const sebelumBerhasil = (await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } })).jumlahBerhasil;

    await selesaikanBaris(prisma, { barisBermasalahId: menunggu[0].id, kelompok: "Tendik", data, ingat: { jabatanTambahan: true }, pengguna: { id: admin.id, nama: "Admin" } });
    const b = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(b.jumlahBerhasil).toBe(sebelumBerhasil + 1);
    expect(b.jumlahPerluReview).toBe(menunggu.length - 1);
    expect((await prisma.barisBermasalah.findUniqueOrThrow({ where: { id: menunggu[0].id } })).status).toBe("Terselesaikan");
    expect(await prisma.auditLog.count({ where: { namaTabel: "baris_bermasalah", idRecord: menunggu[0].id, fieldDiubah: "status" } })).toBe(1);
    await expect(selesaikanBaris(prisma, { barisBermasalahId: menunggu[0].id, kelompok: "Tendik", data, ingat: {}, pengguna: { id: admin.id, nama: "Admin" } })).rejects.toThrow(/sudah diselesaikan/);

    // upsert pada NIP yang sudah punya snapshot + jabatan tambahan: slot lama diganti, bukan ditambah
    const nipKedua = menunggu[1].nip;
    await prisma.pegawai.upsert({ where: { nip: nipKedua }, create: { nip: nipKedua }, update: {} });
    const lama = await prisma.nominatifBulanan.create({
      data: { pegawaiNip: nipKedua, bulan: 10, tahun: 2026, nama: "Lama", jenisKelamin: "L", jenisPegawaiKode: "TDK", statusKepegawaianKode: status, unitAsalKode: unit, tanggalMulaiKerja: new Date("2015-01-01T00:00:00Z"), uploadBatchId: batchId },
    });
    await prisma.nominatifBulananJabatanTambahan.createMany({ data: [{ nominatifBulananId: lama.id, jabatanTambahanRoleKode: role[1], unitAsalKode: unit, statusPengangkatan: "Plt" }, { nominatifBulananId: lama.id, jabatanTambahanRoleKode: role[1], unitAsalKode: unit, statusPengangkatan: "Pjs" }] });
    // pengguna sesi lama (id tidak ada): tetap berhasil, kamus dibuat atas nama pengguna pertama
    await selesaikanBaris(prisma, { barisBermasalahId: menunggu[1].id, kelompok: "Tendik", data: { ...data, jabatanTambahan: [data.jabatanTambahan[0]] }, ingat: { unitKerja: true }, pengguna: { id: "id-tidak-ada", nama: "Admin Lama" } });
    const slot = await prisma.nominatifBulananJabatanTambahan.findMany({ where: { nominatifBulananId: lama.id } });
    expect(slot).toHaveLength(1);
    expect(slot[0]).toMatchObject({ jabatanTambahanRoleKode: role[0], statusPengangkatan: "Definitif" });
    expect((await prisma.nominatifBulanan.findUniqueOrThrow({ where: { id: lama.id } })).nama).toBe("Selesai"); // data diganti oleh hasil Review
    expect((await prisma.barisBermasalah.findUniqueOrThrow({ where: { id: menunggu[1].id } })).diselesaikanOlehId).toBeNull();
    expect(await prisma.kamusKoreksi.count({ where: { jenisField: "UnitKerja" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { idRecord: menunggu[1].id, diubahOleh: "Admin Lama" } })).toBe(1);
  });
});
