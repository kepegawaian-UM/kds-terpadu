/**
 * Rute ekspor Excel Nominatif (GET /nominatif/export) dengan data SINTETIS di kds_test:
 * wajib login, nama file mengikuti periode, isi sama dengan layanan, filter jenis/unit.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const sesi = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!ada)("GET /nominatif/export (sintetis)", () => {
  let prisma: PrismaClient;
  let GET: (r: Request) => Promise<Response>;
  let kode: { dsn: string; tdk: string; status: string; unitA: string; unitB: string };

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ GET } = await import("@/app/(app)/nominatif/export/route"));
    const units = await prisma.unitAsal.findMany({ take: 2, orderBy: { kode: "asc" } });
    const status = await prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } });
    kode = { dsn: "DSN", tdk: "TDK", status: status.kode, unitA: units[0].kode, unitB: units[1].kode };
  });
  beforeEach(async () => {
    sesi.user = { id: "u1" };
    await kosongkanDomain(prisma);
    const batch = await prisma.uploadBatch.create({
      data: { jenis: "nominatif_bulanan", namaFileAsli: "uji.xlsx", diunggahOlehNama: "Uji" },
    });
    const dasar = {
      bulan: 9,
      tahun: 2026,
      jenisKelamin: "L",
      statusKepegawaianKode: kode.status,
      tanggalMulaiKerja: new Date("2020-01-31T00:00:00.000Z"),
      uploadBatchId: batch.id,
    };
    for (const [nip, nama, jenis, unit, lahir] of [
      ["900000000000000001", "budi uji", kode.dsn, kode.unitA, new Date("1990-05-07T00:00:00.000Z")],
      ["900000000000000002", "Andi Uji", kode.tdk, kode.unitB, null],
      ["900000000000000003", "Carla Uji", kode.dsn, kode.unitB, new Date("0999-01-01T00:00:00.000Z")],
    ] as const) {
      await prisma.pegawai.create({ data: { nip } });
      await prisma.nominatifBulanan.create({
        data: { ...dasar, pegawaiNip: nip, nama, jenisPegawaiKode: jenis, unitAsalKode: unit, tanggalLahir: lahir },
      });
    }
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  async function baca(res: Response) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    return wb.worksheets[0];
  }

  it("menolak tanpa login (401)", async () => {
    sesi.user = null;
    const res = await GET(new Request("http://localhost/nominatif/export?bulan=9&tahun=2026"));
    expect(res.status).toBe(401);
  });

  it("mengunduh xlsx bernama sesuai periode, urut nama tanpa peka huruf besar/kecil", async () => {
    const res = await GET(new Request("http://localhost/nominatif/export?bulan=9&tahun=2026"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toContain('filename="Detail Pegawai September 2026.xlsx"');
    const ws = await baca(res);
    expect(ws.getRow(1).values).toEqual([
      undefined, "NIP", "Nama", "Jenis Kelamin", "Tanggal Lahir", "Jenis Pegawai", "Status Kepegawaian", "Golongan", "Unit Kerja", "Tanggal Mulai Kerja",
    ]);
    expect([2, 3, 4].map((i) => ws.getRow(i).getCell(2).value)).toEqual(["Andi Uji", "budi uji", "Carla Uji"]);
    expect(ws.getRow(3).getCell(4).value).toBe("07-05-1990");
    expect(ws.getRow(2).getCell(4).value).toBeNull();
    expect(ws.getRow(4).getCell(4).value).toBe("01-01-0999");
    expect(ws.getRow(2).getCell(9).value).toBe("31-01-2020");
  });

  it("filter jenis_pegawai_kode dan unit_asal_kode", async () => {
    const dsn = await baca(await GET(new Request("http://localhost/nominatif/export?bulan=9&tahun=2026&jenis_pegawai_kode=DSN")));
    expect(dsn.rowCount).toBe(3); // judul + 2 DSN
    const kombinasi = await baca(
      await GET(new Request(`http://localhost/nominatif/export?bulan=9&tahun=2026&jenis_pegawai_kode=DSN&unit_asal_kode=${kode.unitB}`))
    );
    expect(kombinasi.rowCount).toBe(2);
    expect(kombinasi.getRow(2).getCell(2).value).toBe("Carla Uji");
  });

  it("periode kosong menghasilkan hanya judul kolom", async () => {
    const ws = await baca(await GET(new Request("http://localhost/nominatif/export?bulan=1&tahun=2020")));
    expect(ws.rowCount).toBe(1);
  });
});
