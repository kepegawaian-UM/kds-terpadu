/**
 * Rekap Kehadiran Bulanan dengan data SINTETIS di kds_test: urutan TK, sel koreksi berwarna
 * (periode penuh, angka mengalahkan periode, dibatalkan, "dihapus"), lencana status, filter
 * Keaktifan, dan rute ekspor Excel (login, nama file, isi). Melengkapi paritas data asli.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Prisma, PrismaClient } from "@prisma/client";

import { laporanRekapBulanan } from "@/lib/laporan/rekapBulanan";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const sesi = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);

// NIP sintetis: A = TK 2, B = TK 7, C = tanpa rekap, D = hanya ada di Agustus (non-aktif), E = punya catatan
const [A, B, C, D, E] = ["900000000000000001", "900000000000000002", "900000000000000003", "900000000000000004", "900000000000000005"];

describe.skipIf(!ada)("Rekap Bulanan (sintetis)", () => {
  let prisma: PrismaClient;
  let batchId: number;
  let kode: { status: string; unit: string };

  const rekap = async (nip: string, bulan: number, nilai: Record<string, string>) => {
    const h = await prisma.rekapKehadiranBulanan.create({ data: { nip, bulan, tahun: 2026, uploadBatchId: batchId } });
    await prisma.rekapKehadiranDetail.createMany({
      data: Object.entries(nilai).map(([komponenKode, v]) => ({ rekapKehadiranBulananId: h.id, komponenKode, nilai: v })),
    });
  };
  const snapshot = (nip: string, nama: string, bulan: number, jenis = "DSN") =>
    prisma.nominatifBulanan.create({
      data: {
        pegawaiNip: nip, bulan, tahun: 2026, nama, jenisKelamin: "L", jenisPegawaiKode: jenis,
        statusKepegawaianKode: kode.status, unitAsalKode: kode.unit,
        tanggalMulaiKerja: new Date("2020-01-31T00:00:00.000Z"), uploadBatchId: batchId,
      },
    });
  const koreksi = (nip: string, o: Partial<Prisma.KoreksiRekapUncheckedCreateInput> = {}) =>
    prisma.koreksiRekap.create({
      data: {
        nip, jenis: "periode", dariKomponen: "TK", keKomponen: "TB", tanggalMulai: new Date("2026-09-01T00:00:00.000Z"),
        tanggalSelesai: new Date("2026-09-30T00:00:00.000Z"), alasan: "Uji", dibuatOleh: "Uji", dibuatPada: new Date(), ...o,
      },
    });
  const lap = (filter: { jenis?: string[]; status?: string[]; keaktifan?: "aktif" | "nonaktif" | "semua" } = {}) =>
    laporanRekapBulanan(prisma, 9, 2026, { jenis: [], status: [], keaktifan: "aktif", ...filter });

  beforeAll(async () => {
    prisma = new PrismaClient();
    const [s, u] = await Promise.all([
      prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }),
      prisma.unitAsal.findFirstOrThrow(),
    ]);
    kode = { status: s.kode, unit: u.kode };
  });
  beforeEach(async () => {
    sesi.user = { id: "u1" };
    await kosongkanDomain(prisma);
    batchId = (await prisma.uploadBatch.create({ data: { jenis: "kehadiran_bulanan", namaFileAsli: "uji", diunggahOlehNama: "Uji" } })).id;
    for (const nip of [A, B, C, D, E]) await prisma.pegawai.create({ data: { nip } });
    // Agustus: semua; September (bulan terakhir): tanpa D
    for (const [nip, nama] of [[A, "Andi"], [B, "Budi"], [C, "Carla"], [D, "Dewi"], [E, "Eka"]]) await snapshot(nip, nama, 8);
    for (const [nip, nama] of [[A, "Andi"], [B, "Budi"], [C, "Carla"], [E, "Eka"]]) await snapshot(nip, nama, 9);
    await rekap(A, 9, { TK: "2", TB: "0", SIGMA_HARI: "22" });
    await rekap(B, 9, { TK: "7", TB: "0", JENIS_SHIFT: "-" });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("TK terbanyak dulu; tanpa rekap dihitung 0 dan seri mengikuti id; nilai kosong = null", async () => {
    const r = await lap({ keaktifan: "semua" });
    expect(r.baris.map((b) => b.nama)).toEqual(["Budi", "Andi", "Carla", "Eka"]);
    expect(r.baris.find((b) => b.nama === "Carla")!.nilai).toBeNull();
    expect(r.baris[0].nilai).toMatchObject({ TK: "7", JENIS_SHIFT: "-" });
    expect(r.komponen.map((k) => k.kode)).toHaveLength(16);
  });

  it("koreksi periode penuh memindah TK -> TB: sel TB (bernilai) diberi keterangan", async () => {
    await prisma.rekapKehadiranDetail.updateMany({ where: { komponenKode: "TB", rekap: { nip: A } }, data: { nilai: "5" } });
    await koreksi(A);
    const a = (await lap({ keaktifan: "semua" })).baris.find((b) => b.nip === A)!;
    expect(a.tandai).toEqual({ TK: "Dikoreksi: Uji (TK → TB)", TB: "Dikoreksi: Uji (TK → TB)" });
  });

  it("koreksi periode SEBAGIAN bulan tidak menandai apa pun", async () => {
    await koreksi(A, { tanggalMulai: new Date("2026-09-10T00:00:00.000Z") });
    expect((await lap({ keaktifan: "semua" })).baris.find((b) => b.nip === A)!.tandai).toEqual({});
  });

  it("koreksi angka mengalahkan periode di bulan yang sama", async () => {
    await prisma.rekapKehadiranDetail.updateMany({ where: { komponenKode: "TB", rekap: { nip: A } }, data: { nilai: "1" } });
    await koreksi(A, { alasan: "periode" });
    await koreksi(A, { jenis: "angka", alasan: "angka", bulan: 9, tahun: 2026, jumlahHari: 1 });
    const t = (await lap({ keaktifan: "semua" })).baris.find((b) => b.nip === A)!.tandai;
    expect(Object.values(t)).toEqual(["Dikoreksi: angka (TK → TB)", "Dikoreksi: angka (TK → TB)"]);
  });

  it("koreksi dibatalkan tidak berlaku", async () => {
    await koreksi(A, { dibatalkanPada: new Date() });
    expect((await lap({ keaktifan: "semua" })).baris.find((b) => b.nip === A)!.tandai).toEqual({});
  });

  it("koreksi 'tidak dihitung' (ke = null): sel asal selalu ditandai, keterangan 'dihapus'", async () => {
    await koreksi(B, { keKomponen: null, alasan: "pensiun" });
    expect((await lap({ keaktifan: "semua" })).baris.find((b) => b.nip === B)!.tandai).toEqual({
      TK: "Dikoreksi: pensiun (TK → dihapus)",
    });
  });

  it("lencana: catatan status tampil; non-aktif tanpa catatan = 'Belum ada keterangan' (tidak di mode Aktif)", async () => {
    await prisma.catatanStatusPegawai.create({ data: { nip: E, alasan: "Pensiun", dicatatPada: new Date() } });
    const semua = await lap({ keaktifan: "semua" });
    expect(semua.baris.find((b) => b.nip === E)!.badge).toEqual(["catatan", "Pensiun"]);
    // D hanya ada di Agustus -> bukan bagian snapshot September, jadi tidak muncul sebagai baris
    expect(semua.baris.find((b) => b.nip === D)).toBeUndefined();
  });

  it("filter Keaktifan: aktif menyaring non-aktif (E punya catatan = non-aktif untuk tahun terbaru)", async () => {
    await prisma.catatanStatusPegawai.create({ data: { nip: E, alasan: "Resign", dicatatPada: new Date() } });
    expect((await lap({ keaktifan: "aktif" })).baris.map((b) => b.nip).sort()).toEqual([A, B, C]);
    expect((await lap({ keaktifan: "nonaktif" })).baris.map((b) => b.nip)).toEqual([E]);
    expect((await lap({ keaktifan: "semua" })).baris).toHaveLength(4);
  });

  it("filter Jenis dan Status", async () => {
    await prisma.nominatifBulanan.updateMany({ where: { pegawaiNip: C, bulan: 9 }, data: { jenisPegawaiKode: "TDK" } });
    expect((await lap({ keaktifan: "semua", jenis: ["TDK"] })).baris.map((b) => b.nip)).toEqual([C]);
    expect((await lap({ keaktifan: "semua", jenis: ["DSN"], status: ["PNS"] })).baris).toHaveLength(3);
    expect((await lap({ keaktifan: "semua", status: ["PPPK"] })).baris).toHaveLength(0);
  });

  it("nama file mengikuti tab, filter, keaktifan, dan periode", async () => {
    expect((await lap({ jenis: ["DSN"], status: ["PNS"] })).namaFile).toBe("Rekap Kehadiran Bulanan Dosen PNS Aktif September 2026");
    expect((await lap({ keaktifan: "semua" })).namaFile).toBe("Rekap Kehadiran Bulanan September 2026");
  });
});

describe.skipIf(!ada)("GET /rekap-kehadiran/bulanan/export (sintetis)", () => {
  let prisma: PrismaClient;
  let GET: (r: Request) => Promise<Response>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ GET } = await import("@/app/(app)/rekap-kehadiran/bulanan/export/route"));
    await kosongkanDomain(prisma);
    const batch = await prisma.uploadBatch.create({ data: { jenis: "kehadiran_bulanan", namaFileAsli: "uji", diunggahOlehNama: "Uji" } });
    const [s, u] = await Promise.all([
      prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }),
      prisma.unitAsal.findFirstOrThrow(),
    ]);
    for (const [nip, nama] of [[A, "budi uji"], [B, "Andi Uji"]]) {
      await prisma.pegawai.create({ data: { nip } });
      await prisma.nominatifBulanan.create({
        data: {
          pegawaiNip: nip, bulan: 9, tahun: 2026, nama, jenisKelamin: "L", jenisPegawaiKode: "DSN", statusKepegawaianKode: s.kode,
          unitAsalKode: u.kode, tanggalMulaiKerja: new Date("2020-01-31T00:00:00.000Z"), uploadBatchId: batch.id,
        },
      });
    }
    const h = await prisma.rekapKehadiranBulanan.create({ data: { nip: A, bulan: 9, tahun: 2026, uploadBatchId: batch.id } });
    await prisma.rekapKehadiranDetail.create({ data: { rekapKehadiranBulananId: h.id, komponenKode: "TK", nilai: "4" } });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  const baca = async (res: Response) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    return wb.worksheets[0];
  };

  it("menolak tanpa login (401)", async () => {
    sesi.user = null;
    expect((await GET(new Request("http://localhost/x?bulan=9&tahun=2026"))).status).toBe(401);
    sesi.user = { id: "u1" };
  });

  it("xlsx: nama file sesuai filter, judul memuat nama komponen, urut nama, sel tanpa rekap kosong", async () => {
    const res = await GET(new Request("http://localhost/x?bulan=9&tahun=2026&jenis=DSN&jenis[]=TDK&status=PNS&keaktifan=semua"));
    expect(res.headers.get("Content-Disposition")).toContain('filename="Rekap Kehadiran Bulanan Dosen dan Tendik PNS September 2026.xlsx"');
    const ws = await baca(res);
    expect(ws.getRow(1).getCell(1).value).toBe("NIP");
    expect(ws.getRow(1).getCell(5).value).toBe("Σ Hari");
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(2).getCell(2).value).toBe("Andi Uji"); // urut nama (A sebelum b), bukan TK
    expect(ws.getRow(2).getCell(11).value).toBe(""); // KDS2 menulis sel kosong sebagai string kosong (kolom ke-11 = TK)
    expect(ws.getRow(3).getCell(11).value).toBe("4");
  });
});
