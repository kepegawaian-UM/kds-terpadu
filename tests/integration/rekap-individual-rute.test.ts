/** Rute dan parameter Rekap Individual (F4.4) pada data sintetis kds_test: login wajib, ekspor satu/massal, validasi pilihan, batas parameter. */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { GET as eksporIndividual } from "@/app/(app)/rekap-kehadiran/individual/export/route";
import { GET as eksporMassal } from "@/app/(app)/rekap-kehadiran/individual/massal/excel/route";
import { bacaParamMassal, dariRecord, dariUrlSearchParams, kandidatMassal, laporanTerpilih, MAKS_PEGAWAI_MASSAL, namaFileMassal } from "@/lib/laporan/rekapIndividual";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const sesi = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const nip = (n: number) => `19800101200501${String(n).padStart(4, "0")}`;
const rek = (n: number, bulan: number, komponen: Record<string, string>) => ({ nip: nip(n), bulan, tahun: 2026, komponen: { SIGMA_HARI: "20", JUMLAH_MASUK_NYATA: "17", ...komponen } });
const req = (path: string) => new Request(`http://localhost${path}`);

describe.skipIf(!ada)("Rute Rekap Individual", () => {
  beforeEach(async () => {
    sesi.user = { id: "u1" };
    await kosongkanDomain(prisma);
    await muatKeadaan(prisma, {
      nominatif: [1, 2, 3].map((n) => ({ nip: nip(n), bulan: 8, tahun: 2026, jenis: n === 3 ? "AKL" : "DSN", tmt: "2018-01-01", nama: `Pegawai ${n}` })),
      rekap: [rek(1, 1, { TK: "4" }), rek(1, 2, { TK: "3" }), rek(2, 1, { TK: "30" })],
    });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("ekspor satu pegawai: perlu login, 404 untuk NIP tidak valid/tidak ada, dan isi sheet sesuai dokumen", async () => {
    sesi.user = null;
    expect((await eksporIndividual(req(`/x?nip=${nip(1)}&tahun=2026`))).status).toBe(401);
    sesi.user = { id: "u1" };
    expect((await eksporIndividual(req("/x?nip=abc&tahun=2026"))).status).toBe(404);
    expect((await eksporIndividual(req("/x?nip=999&tahun=2026"))).status).toBe(404);

    const res = await eksporIndividual(req(`/x?nip=${nip(1)}&tahun=2026`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("Rekap Individual Pegawai 1 2026.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Rekap Individual"]);
    const ws = wb.worksheets[0];
    expect(ws.getCell("A1").value).toBe("REKAP KEHADIRAN INDIVIDUAL TAHUN 2026");
    expect(ws.getCell("B4").value).toBe(nip(1));
    const barisJumlah = (ws.getSheetValues() as unknown[][]).find((r) => typeof r?.[1] === "string" && (r[1] as string).startsWith("Jumlah (2 bulan)"))!;
    expect(barisJumlah.slice(2, 5)).toEqual([40, 34, "85,0%"]);
  });

  it("ekspor massal: satu sheet per pegawai, duplikat NIP dibuang, 422 bila pilihan kosong/terlalu banyak/tidak valid", async () => {
    sesi.user = null;
    expect((await eksporMassal(req(`/x?tahun=2026&nip=${nip(1)}`))).status).toBe(401);
    sesi.user = { id: "u1" };
    expect((await eksporMassal(req("/x?tahun=2026"))).status).toBe(422);
    expect((await eksporMassal(req(`/x?tahun=2026&nip=${nip(1)}&nip=abc`))).status).toBe(422);
    const banyak = Array.from({ length: MAKS_PEGAWAI_MASSAL + 1 }, (_, i) => `nip=${1000 + i}`).join("&");
    expect((await eksporMassal(req(`/x?tahun=2026&${banyak}`))).status).toBe(422);

    const res = await eksporMassal(req(`/x?tahun=2026&min_tk=0&nip=${nip(1)}&nip=${nip(2)}&nip=${nip(1)}&nip=${nip(9)}`));
    expect(res.status).toBe(200);
    expect(decodeURIComponent(res.headers.get("content-disposition")!.split("filename*=UTF-8''")[1])).toBe("Rekap Individual Aktif TK min 0 2026.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([`Pegawai 1 ${nip(1).slice(-6)}`, `Pegawai 2 ${nip(2).slice(-6)}`]);
  });

  it("laporanTerpilih: batas, validasi, dan NIP tanpa data dilewati", async () => {
    expect(await laporanTerpilih(prisma, [], 2026)).toEqual({ galat: "Pilih minimal satu pegawai." });
    expect(await laporanTerpilih(prisma, Array(201).fill("1"), 2026)).toEqual({ galat: `Maksimal ${MAKS_PEGAWAI_MASSAL} pegawai per cetak/unduh; kurangi pilihan.` });
    expect(await laporanTerpilih(prisma, ["x1"], 2026)).toEqual({ galat: "NIP tidak valid." });
    const h = await laporanTerpilih(prisma, [nip(1), nip(1), "123", nip(2)], 2026);
    expect("daftar" in h && h.daftar.map((l) => l.nip)).toEqual([nip(1), nip(2)]);
  });

  it("parameter massal: bawaan (TK 20, aktif), batas TK 0..366, tahun di luar 2020..2100 kembali ke tahun berjalan, bentuk x[]=", async () => {
    const tahunIni = new Date().getFullYear();
    const bawaan = await bacaParamMassal(prisma, dariRecord({}));
    expect(bawaan).toMatchObject({ tahun: tahunIni, minTk: 20, keaktifan: "aktif", jenis: [], status: [], nip: [] });
    expect((await bacaParamMassal(prisma, dariRecord({ min_tk: "9999", tahun: "1999" }))).minTk).toBe(366);
    expect((await bacaParamMassal(prisma, dariRecord({ min_tk: "-5" }))).minTk).toBe(0);
    expect((await bacaParamMassal(prisma, dariRecord({ min_tk: "abc" }))).minTk).toBe(0);
    expect((await bacaParamMassal(prisma, dariRecord({ tahun: "1999" }))).tahun).toBe(tahunIni);
    expect((await bacaParamMassal(prisma, dariRecord({ tahun: "abc" }))).tahun).toBe(tahunIni);
    expect((await bacaParamMassal(prisma, dariRecord({ tahun: "2025" }))).tahun).toBe(2025);
    const q = await bacaParamMassal(prisma, dariUrlSearchParams(new URLSearchParams("jenis[]=DSN&jenis[]=TDK&status=PNS&nip[]=1&nip=2&keaktifan=semua")));
    expect(q).toMatchObject({ jenis: ["DSN", "TDK"], status: ["PNS"], keaktifan: "semua", nip: ["2", "1"] });
    expect(await namaFileMassal(prisma, { ...bawaan, tahun: 2026, minTk: 20 })).toBe("Rekap Individual Aktif TK min 20 2026");
  });

  it("kandidat massal: TK setahun >= batas, Akademisi Luar dan tanpa rekap tidak ikut, urut TK terbanyak", async () => {
    const k = await kandidatMassal(prisma, 2026, { jenis: [], status: [], keaktifan: "semua" }, 0);
    expect(k.map((x) => [x.nama, x.tk, x.sigma, x.persen])).toEqual([["Pegawai 2", 30, 20, "150,0%"], ["Pegawai 1", 7, 40, "17,5%"]]);
    expect((await kandidatMassal(prisma, 2026, { jenis: [], status: [], keaktifan: "semua" }, 8)).map((x) => x.nama)).toEqual(["Pegawai 2"]);
    expect(await kandidatMassal(prisma, 2026, { jenis: ["TDK"], status: [], keaktifan: "semua" }, 0)).toEqual([]);
  });
});
