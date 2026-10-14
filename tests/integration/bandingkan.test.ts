/**
 * Bandingkan Batch (F4.5b-2): selisih pegawai dua snapshot, anomali NIP, catatan alasan, dan unduhan .xlsx.
 * Logika murni (lib/domain/bandingkanBatch.ts) adalah salinan KDS1 apa adanya; di sini diuji perakitan data dan catatannya.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { generateBandingkanExport } from "@/lib/excel/exportBandingkan";
import { hitungPerbandinganBatch, simpanCatatanPerubahan } from "@/lib/standarisasi/bandingkan";
import { simpanStandarisasi } from "@/lib/standarisasi/proses";
import { hapusPegawaiBulan } from "@/lib/standarisasi/tindakan";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { buatBerkasRaw, pembangkit, type Vocab } from "../support/rawSimpega";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const penggunaUji = { id: null, nama: "t" };

async function vocab(): Promise<Vocab> {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()), umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama), status: await prisma.statusKepegawaian.findMany(),
    role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole), prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
}

const nipBatch = async (id: number) => new Set((await prisma.nominatifBulanan.findMany({ where: { uploadBatchId: id }, select: { pegawaiNip: true } })).map((x) => x.pegawaiNip));

/**
 * Dua bulan dari berkas yang sama persis, lalu disamakan: Oktober bisa punya baris lebih banyak (pegawai yang sudah terdaftar dari
 * September lolos klasifikasi jabatan), jadi baris yang tidak ada di pasangannya dihapus. Hasilnya dua snapshot dengan NIP identik,
 * sehingga selisih berikutnya bisa diatur persis (nama mirip antara orang hilang dan baru dipasangkan sebagai anomali oleh logika KDS1).
 */
async function duaBulan() {
  const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 9, tahun: 2026, jumlah: 150, benih: 41, tanpaPlaceholder: true });
  const a = (await simpanStandarisasi(prisma, buffer, "sep.xlsx", { bulan: 9, tahun: 2026 }, penggunaUji)).batchId;
  const b = (await simpanStandarisasi(prisma, buffer, "okt.xlsx", { bulan: 10, tahun: 2026 }, penggunaUji)).batchId;
  for (const [dari, lawan] of [[a, b], [b, a]] as const) {
    const nipLawan = await nipBatch(lawan);
    for (const n of await prisma.nominatifBulanan.findMany({ where: { uploadBatchId: dari } })) {
      if (!nipLawan.has(n.pegawaiNip)) await hapusPegawaiBulan(prisma, dari, n.id, penggunaUji);
    }
  }
  // Nama sintetis berpola "Nama <angka> <marga>" disamakan oleh normalisasi nama (angka dibuang) sehingga dianggap kembar; ganti dengan
  // nama huruf acak yang berbeda satu sama lain, sama untuk NIP yang sama di kedua bulan.
  const { acak } = pembangkit(7);
  const namaPerNip = new Map<string, string>();
  const huruf = () => Array.from({ length: 12 }, () => String.fromCharCode(97 + Math.floor(acak() * 26))).join("");
  for (const id of [a, b]) {
    for (const n of await prisma.nominatifBulanan.findMany({ where: { uploadBatchId: id }, orderBy: { pegawaiNip: "asc" } })) {
      if (!namaPerNip.has(n.pegawaiNip)) namaPerNip.set(n.pegawaiNip, huruf());
      await prisma.nominatifBulanan.update({ where: { id: n.id }, data: { nama: namaPerNip.get(n.pegawaiNip)! } });
    }
  }
  return { a, b };
}

describe.skipIf(!ada)("Bandingkan Batch", () => {
  beforeEach(async () => {
    await kosongkanDomain(prisma);
    await prisma.catatanPerubahanBatch.deleteMany();
    await prisma.kamusKoreksi.deleteMany();
    await prisma.auditLog.deleteMany();
    if ((await prisma.user.count()) === 0) await prisma.user.create({ data: { email: `b${Date.now()}@uji.test`, passwordHash: "x", nama: "Admin" } });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.catatanPerubahanBatch.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  it("snapshot identik: tidak ada selisih, label bulan benar; batch yang tidak ada atau tanpa periode menghasilkan null", async () => {
    const { a, b } = await duaBulan();
    expect(await nipBatch(a)).toEqual(await nipBatch(b));
    expect((await nipBatch(a)).size).toBeGreaterThan(20);
    expect(await hitungPerbandinganBatch(prisma, a, b)).toEqual({ labelA: "September 2026", labelB: "Oktober 2026", orangBaru: [], orangHilang: [], nipAnomali: [], catatanTersimpan: [] });
    expect(await hitungPerbandinganBatch(prisma, a, b + 999)).toBeNull();
    const tanpaPeriode = await prisma.uploadBatch.create({ data: { jenis: "rekap_kehadiran", namaFileAsli: "x.xlsx", diunggahOlehNama: "t" } });
    expect(await hitungPerbandinganBatch(prisma, a, tanpaPeriode.id)).toBeNull();
  });

  it("orang hilang = ada di A tidak di B; arah dibalik menjadi orang baru", async () => {
    const { a, b } = await duaBulan();
    const keluar = await prisma.nominatifBulanan.findMany({ where: { uploadBatchId: b }, orderBy: { pegawaiNip: "asc" }, take: 3 });
    for (const n of keluar) await hapusPegawaiBulan(prisma, b, n.id, penggunaUji);
    const nipKeluar = keluar.map((n) => n.pegawaiNip).sort();

    const h = (await hitungPerbandinganBatch(prisma, a, b))!;
    expect(h.orangHilang.map((p) => p.nip).sort()).toEqual(nipKeluar);
    expect(h.orangBaru).toEqual([]);
    expect(h.nipAnomali).toEqual([]);
    expect(h.orangHilang[0]).toEqual({ nip: expect.any(String), nama: expect.any(String), jenisPegawai: expect.any(String), status: expect.any(String), unitKerja: expect.any(String) });

    const terbalik = (await hitungPerbandinganBatch(prisma, b, a))!;
    expect(terbalik.orangBaru.map((p) => p.nip).sort()).toEqual(nipKeluar);
    expect(terbalik.orangHilang).toEqual([]);
  });

  it("NIP yang berubah untuk nama yang sama menjadi satu anomali lintas batch (bukan orang baru + orang hilang)", async () => {
    const { a, b } = await duaBulan();
    const n = await prisma.nominatifBulanan.findFirstOrThrow({ where: { uploadBatchId: b } });
    const nipBaru = "1".repeat(18);
    await prisma.pegawai.upsert({ where: { nip: nipBaru }, create: { nip: nipBaru }, update: {} });
    await prisma.nominatifBulanan.update({ where: { id: n.id }, data: { pegawaiNip: nipBaru } });
    const h = (await hitungPerbandinganBatch(prisma, a, b))!;
    expect(h.orangBaru).toEqual([]);
    expect(h.orangHilang).toEqual([]);
    expect(h.nipAnomali).toHaveLength(1);
    expect(h.nipAnomali[0]).toMatchObject({ sumber: "LintasBatch", sudahTercatat: false });
    expect(h.nipAnomali[0].anggota.map((x) => x.nip).sort()).toEqual([n.pegawaiNip, nipBaru].sort());
  });

  it("catatan: disimpan per (kategori, NIP utama), diubah tanpa baris ganda, tampil di perbandingan, ditolak bila tidak lengkap", async () => {
    const { a, b } = await duaBulan();
    const baris = await prisma.nominatifBulanan.findFirstOrThrow({ where: { uploadBatchId: b } });
    await hapusPegawaiBulan(prisma, b, baris.id, penggunaUji);
    const m = { uploadBatchAId: a, uploadBatchBId: b, kategori: "Hilang", nipUtama: baris.pegawaiNip, nama: baris.nama, alasan: "  Pensiun  " };

    expect(await simpanCatatanPerubahan(prisma, { ...m, alasan: "  " }, null)).toEqual({ ok: false, error: "Alasan tidak boleh kosong." });
    expect(await simpanCatatanPerubahan(prisma, { ...m, kategori: "Lain" }, null)).toMatchObject({ ok: false });
    expect(await simpanCatatanPerubahan(prisma, { ...m, nipUtama: "" }, null)).toMatchObject({ ok: false });
    expect(await prisma.catatanPerubahanBatch.count()).toBe(0);

    expect(await simpanCatatanPerubahan(prisma, m, null)).toEqual({ ok: true });
    expect((await prisma.catatanPerubahanBatch.findFirstOrThrow()).alasan).toBe("Pensiun"); // dipangkas
    expect(await simpanCatatanPerubahan(prisma, { ...m, alasan: "Pindah instansi" }, null)).toEqual({ ok: true });
    const semua = await prisma.catatanPerubahanBatch.findMany();
    expect(semua).toHaveLength(1);
    expect(semua[0]).toMatchObject({ alasan: "Pindah instansi", kategori: "Hilang", uploadBatchAId: a, uploadBatchBId: b });

    const h = (await hitungPerbandinganBatch(prisma, a, b))!;
    expect(h.catatanTersimpan).toEqual([{ kategori: "Hilang", nipUtama: baris.pegawaiNip, alasan: "Pindah instansi" }]);

    // batch konteks yang sudah tidak ada tidak melanggar kunci asing; pengguna sesi lama tidak menggagalkan
    expect(await simpanCatatanPerubahan(prisma, { ...m, uploadBatchAId: 999999, alasan: "Ubah lagi" }, "id-sesi-lama")).toEqual({ ok: true });
    expect((await prisma.catatanPerubahanBatch.findFirstOrThrow()).uploadBatchAId).toBeNull();
  });

  it("unduhan .xlsx memuat NIP selisih dan alasan catatan", async () => {
    const { a, b } = await duaBulan();
    const baris = await prisma.nominatifBulanan.findFirstOrThrow({ where: { uploadBatchId: b } });
    await hapusPegawaiBulan(prisma, b, baris.id, penggunaUji);
    await simpanCatatanPerubahan(prisma, { uploadBatchAId: a, uploadBatchBId: b, kategori: "Hilang", nipUtama: baris.pegawaiNip, nama: baris.nama, alasan: "Alasan uji unduhan" }, null);
    const buffer = await generateBandingkanExport((await hitungPerbandinganBatch(prisma, a, b))!);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const teks: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => teks.push(String(c.value)))));
    expect(teks).toContain(baris.pegawaiNip);
    expect(teks).toContain("Alasan uji unduhan");
  });
});
