/**
 * Pembersih + penjaga di jalur Standarisasi (kds_test): berkas mentah sintetis (memuat kolom NIK/Alamat/Nomor Rekening seperti tarikan asli) setelah dibersihkan
 * menghasilkan klasifikasi IDENTIK (nominatif, jabatan tambahan, antrean Review); mode web (tolakKolomLain) menolak berkas mentah dan menerima yang bersih.
 */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { bersihkanRekapPegawai } from "@/lib/simpega/pembersih";
import { klasifikasiBerkas, periksaStandarisasi, simpanStandarisasi } from "@/lib/standarisasi/proses";
import { BerkasMemuatKolomLain } from "@/lib/upload/konstanta";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { buatBerkasRaw, type Vocab } from "../support/rawSimpega";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
afterAll(async () => {
  await kosongkanDomain(prisma);
  await prisma.$disconnect();
});

async function vocab(): Promise<Vocab> {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).filter((x) => x.jenjang.trim() !== "-").map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()), umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama), status: await prisma.statusKepegawaian.findMany(),
    role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole), prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
}

describe.skipIf(!ada)("pembersih dan penjaga pada Standarisasi", () => {
  it("klasifikasi berkas bersih identik dengan berkas mentah (320 baris acak dengan semua cabang klasifikasi)", async () => {
    await kosongkanDomain(prisma);
    const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 9, tahun: 2026, jumlah: 320, benih: 71 });
    const { buffer: bersih, laporan } = await bersihkanRekapPegawai(buffer);
    expect(laporan.kolomDibuang).toEqual(expect.arrayContaining(["NIK", "Alamat", "Nomor Rekening", "Agama"]));
    expect(laporan.jumlahBaris).toBe(320);

    const [a, b] = [await klasifikasiBerkas(prisma, buffer, 9, 2026), await klasifikasiBerkas(prisma, bersih, 9, 2026)];
    // petaKolom (nomor kolom di berkas) memang berbeda karena kolom lain dibuang: bandingkan namanya, lalu semua isi lain harus identik
    const { petaKolom: pa, ...sisaA } = a;
    const { petaKolom: pb, ...sisaB } = b;
    expect(sisaB).toEqual(sisaA);
    expect(Object.keys(pb).sort()).toEqual(Object.keys(pa).sort());
    expect(a.bermasalah.length).toBeGreaterThan(10); // cabang Review ikut teruji
    expect(a.nominatif.length).toBeGreaterThan(50);
  });

  it("mode web: berkas mentah ditolak sebelum menulis apa pun; berkas bersih diperiksa dan disimpan, dan tidak ada data dari kolom sensitif di basis data", async () => {
    await kosongkanDomain(prisma);
    const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 9, tahun: 2026, jumlah: 60, benih: 72, tanpaPlaceholder: true });
    const opsi = { bulan: 9, tahun: 2026, tolakKolomLain: true };

    await expect(periksaStandarisasi(prisma, buffer, opsi)).rejects.toBeInstanceOf(BerkasMemuatKolomLain);
    await expect(simpanStandarisasi(prisma, buffer, "mentah.xlsx", opsi, { id: null, nama: "t" })).rejects.toThrow(/npm run bersihkan/);
    expect(await prisma.uploadBatch.count()).toBe(0);
    expect(await prisma.nominatifBulanan.count()).toBe(0);

    const { buffer: bersih } = await bersihkanRekapPegawai(buffer);
    const r = await periksaStandarisasi(prisma, bersih, opsi);
    expect(r.totalBaris).toBe(60);
    const s = await simpanStandarisasi(prisma, bersih, "bersih.xlsx", opsi, { id: null, nama: "t" });
    expect(s.ringkasan.berhasil + s.ringkasan.perluReview).toBe(60);

    // data mentah baris Review hanya memuat bidang yang dibaca (tidak ada NIK/alamat/rekening)
    const baris = await prisma.barisBermasalah.findMany({ where: { uploadBatchId: s.batchId } });
    const json = JSON.stringify(baris.map((x) => x.dataMentah)).toLowerCase();
    for (const kata of ["3573000000000000", "jl. contoh", "000111222"]) expect(json).not.toContain(kata);
  });
});
