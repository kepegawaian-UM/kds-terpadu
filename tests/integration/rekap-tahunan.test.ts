/**
 * Rekap Kehadiran Tahunan dengan data SINTETIS di kds_test: SUM lintas bulan, snapshot terakhir lewat
 * MAX(id) (bukan bulan terbesar), CAST awalan-angka seperti MySQL, tahun yang terpisah, filter, serta
 * rute ekspor Excel (login, nama file, '0' untuk komponen teks kosong). Melengkapi paritas data asli.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { laporanRekapTahunan } from "@/lib/laporan/rekapTahunan";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const sesi = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const [A, B, C] = ["900000000000000001", "900000000000000002", "900000000000000003"];

describe.skipIf(!ada)("Rekap Tahunan (sintetis)", () => {
  let prisma: PrismaClient;
  let batchId: number;
  let kode: { status: string; unitA: string; unitB: string };
  let GET: (r: Request) => Promise<Response>;

  const rekap = async (nip: string, bulan: number, tahun: number, nilai: Record<string, string>) => {
    const h = await prisma.rekapKehadiranBulanan.create({ data: { nip, bulan, tahun, uploadBatchId: batchId } });
    await prisma.rekapKehadiranDetail.createMany({
      data: Object.entries(nilai).map(([komponenKode, v]) => ({ rekapKehadiranBulananId: h.id, komponenKode, nilai: v })),
    });
  };
  const snapshot = (nip: string, nama: string, bulan: number, o: { jenis?: string; unit?: string; tahun?: number } = {}) =>
    prisma.nominatifBulanan.create({
      data: {
        pegawaiNip: nip, bulan, tahun: o.tahun ?? 2026, nama, jenisKelamin: "L", jenisPegawaiKode: o.jenis ?? "DSN",
        statusKepegawaianKode: kode.status, unitAsalKode: o.unit ?? kode.unitA,
        tanggalMulaiKerja: new Date("2020-01-31T00:00:00.000Z"), uploadBatchId: batchId,
      },
    });
  const lap = (filter: { jenis?: string[]; status?: string[]; keaktifan?: "aktif" | "nonaktif" | "semua" } = {}, tahun = 2026) =>
    laporanRekapTahunan(prisma, tahun, { jenis: [], status: [], keaktifan: "semua", ...filter });

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ GET } = await import("@/app/(app)/rekap-kehadiran/tahunan/export/route"));
    const [s, u] = await Promise.all([
      prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }),
      prisma.unitAsal.findMany({ take: 2, orderBy: { kode: "asc" } }),
    ]);
    kode = { status: s.kode, unitA: u[0].kode, unitB: u[1].kode };
  });
  beforeEach(async () => {
    sesi.user = { id: "u1" };
    await kosongkanDomain(prisma);
    batchId = (await prisma.uploadBatch.create({ data: { jenis: "kehadiran_bulanan", namaFileAsli: "uji", diunggahOlehNama: "Uji" } })).id;
    for (const nip of [A, B, C]) await prisma.pegawai.create({ data: { nip } });
    for (const [nip, nama] of [[A, "Andi"], [B, "Budi"], [C, "carla"]]) await snapshot(nip, nama, 9);
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("menjumlahkan TK dan komponen lain lintas bulan; urut TK terbanyak; seri mengikuti id", async () => {
    await rekap(A, 8, 2026, { TK: "2", I: "1", SIGMA_HARI: "20" });
    await rekap(A, 9, 2026, { TK: "3", I: "0", SIGMA_HARI: "22" });
    await rekap(B, 9, 2026, { TK: "9", SIGMA_HARI: "22" });
    const r = await lap();
    expect(r.baris.map((b) => b.nama)).toEqual(["Budi", "Andi", "carla"]);
    expect(r.baris[1].total).toMatchObject({ TK: "5", I: "1", SIGMA_HARI: "42" });
    expect(r.baris[1].sel.TK).toBe("5");
  });

  it("sel tanpa total: komponen angka '0', komponen teks '-'; pegawai tanpa rekap semuanya begitu", async () => {
    await rekap(A, 9, 2026, { TK: "1", JENIS_SHIFT: "Shift 1" });
    const r = await lap();
    const carla = r.baris.find((b) => b.nip === C)!;
    expect(carla.total).toEqual({});
    expect(carla.sel.TK).toBe("0");
    expect(carla.sel.JENIS_SHIFT).toBe("-");
    // JENIS_SHIFT (teks) tidak dijumlahkan walau ada nilainya
    expect(r.baris.find((b) => b.nip === A)!.sel.JENIS_SHIFT).toBe("-");
  });

  it("CAST seperti MySQL: awalan angka dipakai, selain itu 0, negatif dan spasi dikenali", async () => {
    await rekap(A, 8, 2026, { TK: "3abc" });
    await rekap(A, 9, 2026, { TK: "abc", S: " 4" });
    await rekap(B, 8, 2026, { TK: "-2" });
    await rekap(B, 9, 2026, { TK: "+5" });
    const r = await lap();
    expect(r.baris.find((b) => b.nip === A)!.total).toMatchObject({ TK: "3", S: "4" });
    expect(r.baris.find((b) => b.nip === B)!.total.TK).toBe("3");
  });

  it("hanya rekap tahun yang dipilih (2025 tidak tercampur) dan tahun tanpa data kosong", async () => {
    await rekap(A, 12, 2025, { TK: "50" });
    await rekap(A, 9, 2026, { TK: "1" });
    expect((await lap()).baris.find((b) => b.nip === A)!.total.TK).toBe("1");
    expect((await lap({}, 2024)).baris).toHaveLength(0);
  });

  it("snapshot terakhir = MAX(id), BUKAN bulan terbesar: snapshot Agustus yang dibuat belakangan menang", async () => {
    // A sudah punya snapshot September (id lebih kecil); snapshot Agustus dibuat kemudian (id lebih besar)
    // dengan jenis Tendik dan unit lain - itulah yang dipakai KDS2 untuk filter/identitas tahunan.
    await snapshot(A, "Andi Agustus", 8, { jenis: "TDK", unit: kode.unitB });
    const tdk = await lap({ jenis: ["TDK"] });
    expect(tdk.baris.map((b) => b.nip)).toEqual([A]);
    expect(tdk.baris[0].nama).toBe("Andi Agustus");
    expect((await lap({ jenis: ["DSN"] })).baris.map((b) => b.nip).sort()).toEqual([B, C]);
  });

  it("filter Keaktifan: yang tidak ada di bulan terakhir tahun itu = non-aktif", async () => {
    await prisma.pegawai.create({ data: { nip: "900000000000000009" } });
    await snapshot("900000000000000009", "Dewi", 8); // hanya Agustus; bulan terakhir 2026 = September
    expect((await lap({ keaktifan: "aktif" })).baris.map((b) => b.nip).sort()).toEqual([A, B, C]);
    const non = await lap({ keaktifan: "nonaktif" });
    expect(non.baris.map((b) => b.nip)).toEqual(["900000000000000009"]);
    expect(non.baris[0].badge).toEqual(["belum", "Belum ada keterangan"]);
    expect((await lap({ keaktifan: "semua" })).baris).toHaveLength(4);
  });

  it("nama file mengikuti tab, filter, keaktifan, dan tahun", async () => {
    expect((await lap({ jenis: ["DSN"], status: ["PNS"], keaktifan: "aktif" })).namaFile).toBe("Rekap Kehadiran Tahunan Dosen PNS Aktif 2026");
    expect((await lap()).namaFile).toBe("Rekap Kehadiran Tahunan 2026");
  });

  describe("GET /rekap-kehadiran/tahunan/export", () => {
    const baca = async (res: Response) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
      return wb.worksheets[0];
    };

    it("menolak tanpa login (401)", async () => {
      sesi.user = null;
      expect((await GET(new Request("http://localhost/x?tahun=2026"))).status).toBe(401);
    });

    it("xlsx: nama file sesuai filter; urut nama; total jumlah; komponen teks kosong tetap '0' di Excel", async () => {
      await rekap(A, 8, 2026, { TK: "2" });
      await rekap(A, 9, 2026, { TK: "3" });
      const res = await GET(new Request("http://localhost/x?tahun=2026&jenis=DSN&status=PNS&keaktifan=semua"));
      expect(res.headers.get("Content-Disposition")).toContain('filename="Rekap Kehadiran Tahunan Dosen PNS 2026.xlsx"');
      const ws = await baca(res);
      expect(ws.getRow(1).getCell(5).value).toBe("Σ Hari");
      expect(ws.rowCount).toBe(4);
      expect([2, 3, 4].map((i) => ws.getRow(i).getCell(2).value)).toEqual(["Andi", "Budi", "carla"]);
      expect(ws.getRow(2).getCell(11).value).toBe("5"); // TK Andi = 2 + 3
      expect(ws.getRow(3).getCell(11).value).toBe("0"); // tanpa rekap
      expect(ws.getRow(2).getCell(19).value).toBe("0"); // JENIS_SHIFT (teks) kosong -> '0' di Excel, '-' di halaman
    });
  });
});
