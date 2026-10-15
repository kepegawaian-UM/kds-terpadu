/**
 * Ekspor Nominatif LENGKAP (GET /nominatif/export?format=lengkap): data sintetis hasil Standarisasi di kds_test.
 * Membuktikan: susunan kolom = template Upload Nominatif, isi sesuai snapshot, dan berkas hasilnya bisa DIUNGGAH ULANG
 * (periksa tanpa galat; simpan ke bulan lain menghasilkan snapshot yang identik kolom demi kolom, termasuk jabatan tambahan).
 */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { periksaUploadNominatif, simpanUploadNominatif } from "@/app/(app)/nominatif/upload/actions";
import { POST as kirimPotongan } from "@/app/api/upload-chunk/route";
import { GET } from "@/app/(app)/nominatif/export/route";
import { simpanStandarisasi } from "@/lib/standarisasi/proses";
import { unggahBerkas } from "@/lib/upload/klien";
import { HEADER_TEMPLATE_NOMINATIF } from "@/lib/upload/templateNominatif";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { buatBerkasRaw, type Vocab } from "../support/rawSimpega";

const sesi = vi.hoisted(() => ({ user: { id: "u1", name: "Admin Uji" } as { id: string; name: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();

async function vocab(): Promise<Vocab> {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).filter((x) => x.jenjang.trim() !== "-").map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()),
    umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama), akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama),
    status: await prisma.statusKepegawaian.findMany(), role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole),
    prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
}

const kirim = async (berkas: File) =>
  unggahBerkas(berkas, {
    fetchFn: (async (url: string, init?: RequestInit) => kirimPotongan(new Request(`http://localhost${url}`, init))) as unknown as typeof fetch,
  });

describe.skipIf(!ada)("ekspor Nominatif lengkap", () => {
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

  it("menolak tanpa login; susunan kolom = template Upload; ekspor ringkas 9 kolom tidak berubah", async () => {
    sesi.user = null;
    expect((await GET(new Request("http://localhost/nominatif/export?format=lengkap&bulan=9&tahun=2026"))).status).toBe(401);
    sesi.user = { id: "u1", name: "Admin Uji" };
    const kosong = await GET(new Request("http://localhost/nominatif/export?format=lengkap&bulan=1&tahun=2020"));
    expect(kosong.headers.get("Content-Disposition")).toContain("Nominatif Lengkap Januari 2020.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await kosong.arrayBuffer()) as unknown as ArrayBuffer);
    expect((wb.worksheets[0].getRow(1).values as string[]).slice(1)).toEqual([...HEADER_TEMPLATE_NOMINATIF]);
    const ringkas = new ExcelJS.Workbook();
    await ringkas.xlsx.load(Buffer.from(await (await GET(new Request("http://localhost/nominatif/export?bulan=1&tahun=2020"))).arrayBuffer()) as unknown as ArrayBuffer);
    expect(ringkas.worksheets[0].columnCount).toBe(9);
  });

  it("isi sesuai snapshot dan berkas hasilnya bisa diunggah ulang menghasilkan snapshot identik", async () => {
    await prisma.user.upsert({ where: { id: "u1" }, create: { id: "u1", email: "u1@uji.test", passwordHash: "x", nama: "Admin Uji" }, update: {} });
    const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 9, tahun: 2026, jumlah: 90, benih: 77, tanpaPlaceholder: true });
    await simpanStandarisasi(prisma, buffer, "sep.xlsx", { bulan: 9, tahun: 2026 }, { id: "u1", nama: "Admin Uji" });
    // satu pegawai diberi tepat 3 slot jabatan tambahan (satu pakai prodi) supaya blok slot 3 ikut terbukti
    const sasaran = await prisma.nominatifBulanan.findFirstOrThrow({ where: { bulan: 9, tahun: 2026, jenisPegawaiKode: { not: "AKL" } }, include: { jabatanTambahan: true } });
    await prisma.nominatifBulananJabatanTambahan.deleteMany({ where: { nominatifBulananId: sasaran.id } });
    const roles = await prisma.jabatanTambahanRole.findMany({ take: 3, orderBy: { kode: "asc" } });
    const prodi = await prisma.programStudi.findFirstOrThrow();
    await prisma.nominatifBulananJabatanTambahan.createMany({
      data: [
        { nominatifBulananId: sasaran.id, jabatanTambahanRoleKode: roles[0].kode, unitAsalKode: sasaran.unitAsalKode, statusPengangkatan: "Definitif" },
        { nominatifBulananId: sasaran.id, jabatanTambahanRoleKode: roles[1].kode, programStudiKode: prodi.kode, statusPengangkatan: "Plt" },
        { nominatifBulananId: sasaran.id, jabatanTambahanRoleKode: roles[2].kode, unitAsalKode: sasaran.unitAsalKode, statusPengangkatan: "Pjs" },
      ],
    });
    const asal = await prisma.nominatifBulanan.findMany({ where: { bulan: 9, tahun: 2026 }, include: { jabatanTambahan: { orderBy: { id: "asc" } } }, orderBy: { pegawaiNip: "asc" } });
    expect(asal.length).toBeGreaterThan(20);
    expect(asal.some((b) => b.jabatanTambahan.length === 3)).toBe(true);

    const res = await GET(new Request("http://localhost/nominatif/export?format=lengkap&bulan=9&tahun=2026"));
    const bytes = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.rowCount - 1).toBe(asal.length);
    const jenisDiBerkas = new Set<string>();
    for (let r = 2; r <= ws.rowCount; r++) jenisDiBerkas.add(String(ws.getRow(r).getCell(7).value));
    expect(jenisDiBerkas.size).toBeGreaterThan(1); // lebih dari satu jenis pegawai
    // kolom jabatan (10) terisi untuk dosen dan tendik
    const dsn = new Set(asal.filter((b) => b.jenisPegawaiKode === "DSN").map((b) => b.pegawaiNip));
    let dsnBerjabatan = 0;
    for (let r = 2; r <= ws.rowCount; r++) if (dsn.has(String(ws.getRow(r).getCell(1).value)) && ws.getRow(r).getCell(10).value) dsnBerjabatan++;
    expect(dsnBerjabatan).toBeGreaterThan(0);

    // unggah ulang ke bulan 10: periksa tanpa gagal, simpan, lalu bandingkan kolom demi kolom
    const berkas = new File([new Uint8Array(bytes)], "lengkap.xlsx");
    const u = await kirim(berkas);
    const m = { uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile, bulan: 10, tahun: 2026, namaSheet: "" };
    const p = await periksaUploadNominatif(m);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.ringkasan, JSON.stringify(p.ringkasan.catatan)).toMatchObject({ totalBaris: asal.length, berhasil: asal.length, gagal: 0 });
    const s = await simpanUploadNominatif(m);
    expect(s.ok).toBe(true);

    const baru = await prisma.nominatifBulanan.findMany({ where: { bulan: 10, tahun: 2026 }, include: { jabatanTambahan: { orderBy: { id: "asc" } } }, orderBy: { pegawaiNip: "asc" } });
    expect(baru).toHaveLength(asal.length);
    const kolom = (b: (typeof asal)[number]) => ({
      nip: b.pegawaiNip, nama: b.nama, jk: b.jenisKelamin, lahir: b.tanggalLahir, pend: b.pendidikanTerakhir, jenis: b.jenisPegawaiKode, status: b.statusKepegawaianKode,
      gol: b.golonganKode, jfd: b.jabatanFungsionalDosenKode, jft: b.jabatanFungsionalTendikKode, jfu: b.jabatanFungsiUmumKode, akl: b.kategoriAkademisiLuarKode,
      unit: b.unitAsalKode, tmt: b.tanggalMulaiKerja,
      jt: b.jabatanTambahan.map((j) => [j.jabatanTambahanRoleKode, j.unitAsalKode, j.programStudiKode, j.statusPengangkatan]),
    });
    expect(baru.map(kolom)).toEqual(asal.map(kolom));
  });
});
