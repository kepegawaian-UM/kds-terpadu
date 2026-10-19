/**
 * Peringatan anomali pada tahap Periksa Upload Absensi (data SINTETIS di kds_test): terdeteksi dari berkas + data tersimpan (cuti kumulatif),
 * Periksa tidak menulis apa pun, catatan impor lama tidak berubah, dan Simpan tidak terpengaruh.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { periksaRekap, simpanRekap } from "@/lib/impor/rekapKehadiran";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const nip = (n: number) => `9000000000${String(n).padStart(8, "0")}`;
const PENGGUNA = { id: null, nama: "Uji" };

type Isi = Partial<Record<"SIGMA" | "I" | "S" | "SD" | "TD" | "TB" | "TK" | "CTH" | "CTM" | "CTB" | "CAP" | "CTLN" | "TOTAL" | "MASUK", number>>;

async function berkas(baris: [string, Isi][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(Array.from({ length: 22 }, (_, i) => `K${i + 1}`));
  baris.forEach(([n, v], i) => {
    ws.addRow([i + 1, `P${i}`, "U", "III/a", "September", v.SIGMA ?? 22, v.I ?? 0, v.S ?? 0, v.SD ?? 0, v.TD ?? 0, v.TB ?? 0, v.TK ?? 0, v.CTH ?? 0, v.CTM ?? 0, v.CTB ?? 0, v.CAP ?? 0, v.CTLN ?? 0, v.TOTAL ?? 0, v.MASUK ?? 0, "-", n, "-"]);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function siapkan(jumlah: number, perempuan: number[] = []) {
  const [s, u] = await Promise.all([prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }), prisma.unitAsal.findFirstOrThrow()]);
  const b = await prisma.uploadBatch.create({ data: { jenis: "nominatif_bulanan", namaFileAsli: "n", diunggahOlehNama: "t" } });
  await prisma.pegawai.createMany({ data: Array.from({ length: jumlah }, (_, i) => ({ nip: nip(i) })) });
  await prisma.nominatifBulanan.createMany({
    data: Array.from({ length: jumlah }, (_, i) => ({
      pegawaiNip: nip(i), bulan: 9, tahun: 2026, nama: `Pegawai ${i}`, jenisKelamin: perempuan.includes(i) ? "P" : "L", jenisPegawaiKode: "DSN",
      statusKepegawaianKode: s.kode, unitAsalKode: u.kode, tanggalMulaiKerja: new Date("2018-01-01T00:00:00.000Z"), uploadBatchId: b.id,
    })),
  });
  return b.id;
}

const tulisan = async () => ({ batch: await prisma.uploadBatch.count({ where: { jenis: "kehadiran_bulanan" } }), header: await prisma.rekapKehadiranBulanan.count(), catatan: await prisma.barisGagalUpload.count() });

describe.skipIf(!ada)("Periksa Upload Absensi: peringatan anomali", () => {
  beforeEach(async () => {
    await kosongkanDomain(prisma);
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("mendeteksi kasus nyata (CTM laki-laki, TOTAL tanpa komponen, cuti kumulatif dari bulan lain, masuk+TK melebihi) dengan nama dan nomor baris; yang wajar tidak muncul", async () => {
    const batchId = await siapkan(6, [3]);
    // Agustus sudah tersimpan dengan CTH 14 hari untuk pegawai ke-2
    const lama = await prisma.rekapKehadiranBulanan.create({ data: { nip: nip(2), bulan: 8, tahun: 2026, uploadBatchId: batchId } });
    await prisma.rekapKehadiranDetail.create({ data: { rekapKehadiranBulananId: lama.id, komponenKode: "CTH", nilai: "14" } });

    const f = await berkas([
      [nip(0), { CTM: 10, MASUK: 12, TOTAL: 12 }], // laki-laki dengan cuti melahirkan -> penting
      [nip(1), { TOTAL: 22 }], // TOTAL terisi tanpa komponen -> penting
      [nip(2), { CTH: 6, MASUK: 16, TOTAL: 16 }], // 14 (Agustus) + 6 = 20 > 18 -> penting
      [nip(3), { CTM: 22 }], // perempuan: cuti melahirkan penuh, sah -> tidak ada
      [nip(4), { MASUK: 22, TOTAL: 22 }], // wajar -> tidak ada
      [nip(5), { MASUK: 22, TK: 22, TOTAL: 22 }], // masuk + TK melebihi -> penting (+ TK sebulan penuh -> sedang)
    ]);
    const sebelum = await tulisan();
    const r = await periksaRekap(prisma, f, { bulan: 9, tahun: 2026 });

    const kode = (n: number) => r.anomali.filter((a) => a.nip === nip(n)).map((a) => `${a.tingkat}:${a.kode}`).sort();
    expect(kode(0)).toEqual(["penting:cuti_melahirkan_laki_laki"]);
    expect(kode(1)).toEqual(["penting:total_tanpa_komponen"]);
    expect(kode(2)).toEqual(["penting:cuti_tahunan_kumulatif"]);
    expect(kode(3)).toEqual([]);
    expect(kode(4)).toEqual([]);
    expect(kode(5)).toEqual(["penting:melebihi_hari_kerja", "sedang:tk_sebulan_penuh"]);

    const satu = r.anomali.find((a) => a.nip === nip(1))!;
    expect(satu).toMatchObject({ nomorBaris: 3, nama: "Pegawai 1" }); // baris berkas: judul = 1, pegawai ke-2 = baris 3
    expect(r.anomali.find((a) => a.nip === nip(2))!.pesan).toContain("20");
    // urut: semua penting lebih dulu
    const tingkat = r.anomali.map((a) => a.tingkat);
    expect(tingkat.indexOf("sedang")).toBeGreaterThan(tingkat.lastIndexOf("penting"));

    expect(await tulisan()).toEqual(sebelum); // Periksa tidak menulis apa pun
  });

  it("catatan impor lama tidak berubah oleh anomali, dan Simpan tetap menyimpan semua baris (hanya peringatan; ringkasan Simpan tidak membawa anomali)", async () => {
    await siapkan(3);
    const f = await berkas([
      [nip(0), { TOTAL: 22 }],
      [nip(1), { MASUK: 22, TOTAL: 22 }],
      [nip(2), { MASUK: 22, TOTAL: 21 }], // peringatan lama: TOTAL <> masuk
    ]);
    const periksa = await periksaRekap(prisma, f, { bulan: 9, tahun: 2026 });
    expect(periksa.berhasil).toBe(3);
    expect(periksa.gagal).toBe(0);
    // hanya peringatan lama (TOTAL <> masuk nyata); anomali tidak ikut tercampur ke catatan impor
    expect(periksa.catatan.map((c) => c.alasan)).toEqual([
      "[PERINGATAN] TOTAL (22) tidak sama dengan JUMLAH MASUK NYATA (0)",
      "[PERINGATAN] TOTAL (21) tidak sama dengan JUMLAH MASUK NYATA (22)",
    ]);
    expect(periksa.anomali.length).toBeGreaterThan(0);

    const simpan = await simpanRekap(prisma, f, "x.xlsx", { bulan: 9, tahun: 2026 }, PENGGUNA);
    expect(simpan.ringkasan.berhasil).toBe(3);
    expect(simpan.ringkasan.anomali).toEqual([]);
    expect(await prisma.rekapKehadiranBulanan.count({ where: { bulan: 9, tahun: 2026 } })).toBe(3);
  });
});
