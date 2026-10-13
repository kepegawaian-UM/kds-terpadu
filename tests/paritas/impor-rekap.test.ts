/**
 * PARITAS importer Rekap Kehadiran (F4.1b): importer KDS2 ASLI (oracle PHP di SQLite memori) dan importer baru
 * (kds_test) memproses keadaan awal sintetis dan berkas yang SAMA; hasil tersimpan harus identik: batch,
 * header + detail rekap (urutan komponen), dan baris catatan (gagal + peringatan) termasuk teks dan nomor baris.
 * Setiap kasus dijalankan dua kali: berkas ditulis exceljs (dibaca PhpSpreadsheet milik KDS2) dan berkas ditulis
 * PhpSpreadsheet (dibaca exceljs), sehingga pembacaan lintas-pustaka ikut terbukti.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { CONFIG_REKAP, simpanRekap } from "@/lib/impor/rekapKehadiran";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import {
  type HasilKasusImpor,
  type KasusOracleImpor,
  type KeadaanImpor,
  type Sel,
  jalankanOracleImpor,
  oracleImporTersedia,
} from "../support/oracleImpor";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleImporTersedia());

// ---------- pembangun berkas sintetis ----------
const HEADER = ["NO", "NAMA", "UNIT", "GOL", "BULAN", "SIGMA HARI", "I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN", "TOTAL", "JUMLAH MASUK NYATA", "JENIS SHIFT", "NIP", "CUTI ANAK KE"];
const KOMPONEN_HARI = ["I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN"];

type OpsiBaris = { k?: Record<string, number>; bulanTeks?: Sel; sigma?: number; total?: Sel; jml?: Sel; shift?: Sel; cuti?: Sel; rumus?: boolean; sel?: Record<number, Sel> };
type PembuatBaris = (nomorBaris: number) => Sel[];

/** Satu baris data (22 kolom). nip bisa string, angka, atau null. */
const baris =
  (nip: Sel, o: OpsiBaris = {}): PembuatBaris =>
  (nomor) => {
    const sigma = o.sigma ?? 22;
    const k = o.k ?? {};
    const jumlahHari = KOMPONEN_HARI.reduce((s, c) => s + (k[c] ?? 0), 0);
    const hitung = sigma - jumlahHari;
    const total: Sel = o.total !== undefined ? o.total : o.rumus ? { f: `F${nomor}-SUM(G${nomor}:Q${nomor})`, v: hitung } : hitung;
    const sel: Sel[] = [
      nomor - 1, `Pegawai ${nomor}`, "Unit", "III/a", o.bulanTeks !== undefined ? o.bulanTeks : "September", sigma,
      ...KOMPONEN_HARI.map((c) => k[c] ?? 0),
      total, o.jml !== undefined ? o.jml : hitung, o.shift !== undefined ? o.shift : "-", nip, o.cuti !== undefined ? o.cuti : "-",
    ];
    for (const [i, v] of Object.entries(o.sel ?? {})) sel[Number(i)] = v;
    return sel;
  };

const nip = (n: number) => `19800101200501${String(n).padStart(4, "0")}`;
const snap = (n: number, bulan: number, jenis: string, tmt: string, tahun = 2026) => ({ nip: nip(n), bulan, tahun, jenis, tmt });

type Kasus = {
  id: string;
  keadaan: KeadaanImpor;
  baris: (PembuatBaris | Sel[])[];
  bulan?: number;
  tahun?: number;
  namaSheet?: string | null;
  namaSheetBerkas?: string[];
  indeksData?: number;
};

// ---------- katalog kasus ----------
const KASUS: Kasus[] = [];

KASUS.push({
  id: "dasar",
  keadaan: { nominatif: [snap(1, 9, "DSN", "2018-01-01"), snap(2, 9, "TDK", "2019-05-10"), snap(3, 9, "DSN", "2020-09-15")] },
  baris: [baris(nip(1), { k: { I: 1, TK: 2 }, rumus: true }), baris(nip(2), { k: { CTH: 3 }, shift: "Satpam 3 Shift", cuti: 2 }), baris(nip(3), { rumus: true })],
});

KASUS.push({
  id: "penolakan",
  keadaan: {
    pegawai: [nip(10)], // ada di pegawai tetapi tanpa Nominatif
    nominatif: [
      snap(1, 9, "AKL", "2015-01-01"), // Akademisi Luar
      snap(2, 9, "DSN", "2026-10-05"), // TMT bulan depan -> ditolak
      snap(3, 9, "DSN", "2026-09-30"), // TMT bulan yang sama -> diterima
      snap(4, 9, "TDK", "2027-01-01"), // TMT tahun depan
      snap(5, 8, "DSN", "2020-01-01"), // hanya ada snapshot Agustus: dipakai (terakhir sampai bulan)
      snap(6, 9, "DSN", "2020-01-01"), snap(6, 10, "AKL", "2020-01-01"), // snapshot setelah bulan rekap diabaikan
      snap(7, 7, "AKL", "2020-01-01"), snap(7, 8, "TDK", "2020-01-01"), // snapshot terakhir sampai bulan: TDK
      snap(8, 9, "DSN", "2025-12-31", 2026), // TMT 2025-12 (tahun lebih awal) diterima
      snap(9, 9, "DSN", "0999-06-01"), // tahun TMT kecil
    ],
  },
  baris: [
    baris(nip(1)), baris(nip(2)), baris(nip(3)), baris(nip(4)), baris(nip(5)), baris(nip(6)), baris(nip(7)),
    baris(nip(8)), baris(nip(9)), baris(nip(10)), baris(nip(11)) /* tak dikenal */,
  ],
});

KASUS.push({
  id: "peringatan",
  keadaan: { nominatif: [snap(1, 9, "DSN", "2018-01-01"), snap(2, 9, "DSN", "2018-01-01"), snap(3, 9, "DSN", "2018-01-01"), snap(4, 9, "TDK", "2018-01-01")], pegawai: ["123456"] },
  baris: [
    baris(nip(1), { bulanTeks: "Oktober" }), // bulan tak cocok
    baris(nip(2), { bulanTeks: "SEPTEMBER" }), // huruf besar: cocok
    baris(nip(3), { total: 20, jml: 21 }), // TOTAL != JML
    baris(nip(4), { k: { I: 1 }, bulanTeks: "  september  " }),
    baris(nip(1), { k: { TK: 4 } }), // NIP ganda: baris ini menang
    baris(`'${nip(2)}`, { bulanTeks: "Agustus", total: 5, jml: 6 }), // awalan petik + NIP ganda + 2 peringatan
    baris(123456, { k: { S: 1 } }), // NIP sel angka
    baris(`  ${nip(4)}  `), // NIP berspasi, ganda
    baris("ABC123"), // bukan digit: dilewati diam-diam
    baris(null), // tanpa NIP
    baris("12345678901234567890123"), // 23 digit, tak dikenal
    baris(nip(3), { bulanTeks: null }), // BULAN kosong: tanpa peringatan
    baris(nip(3), { bulanTeks: 9 }), // BULAN berupa angka
    baris(nip(3), { bulanTeks: "x".repeat(300) }), // peringatan dipotong 255
  ],
});

KASUS.push({
  id: "re-upload",
  keadaan: {
    nominatif: [snap(1, 9, "DSN", "2018-01-01"), snap(2, 9, "DSN", "2018-01-01"), snap(3, 9, "DSN", "2018-01-01"), snap(4, 9, "DSN", "2018-01-01")],
    rekap: [
      { nip: nip(1), bulan: 9, tahun: 2026, komponen: { SIGMA_HARI: "30", I: "9", TOTAL: "21", JENIS_SHIFT: "lama", CAP: "7" } },
      { nip: nip(2), bulan: 8, tahun: 2026, komponen: { SIGMA_HARI: "31", I: "1" } }, // bulan lain: tak tersentuh
      { nip: nip(3), bulan: 9, tahun: 2026, komponen: { SIGMA_HARI: "30", TK: "5" } }, // tak ada di berkas: tetap
      { nip: nip(2), bulan: 9, tahun: 2025, komponen: { SIGMA_HARI: "30" } }, // tahun lain
    ],
  },
  baris: [baris(nip(1), { k: { I: 2 }, shift: null }), baris(nip(2), { rumus: true }), baris(nip(4), { cuti: null })],
});

KASUS.push({
  id: "nilai-aneh",
  keadaan: { nominatif: [snap(1, 9, "DSN", "2018-01-01"), snap(2, 9, "DSN", "2018-01-01"), snap(3, 9, "DSN", "2018-01-01"), snap(4, 9, "DSN", "2018-01-01")] },
  baris: [
    baris(nip(1), { sel: { 6: null, 7: null, 11: " 3 ", 12: 1.5, 19: " Pagi\t", 21: null } }), // kosong dilewati, trim, desimal, spasi/tab
    baris(nip(2), { sel: { 6: 0, 7: "0", 8: -1, 9: " 7" } }), // nol, teks "0", negatif, NBSP tidak ikut trim
    baris(nip(3), { total: "8", jml: 8 }), // "8" teks vs 8 angka: sama
    baris(nip(4), { total: "08", jml: 8 }), // "08" != "8": peringatan
    [],
    ["catatan kaki: dibuat oleh admin"],
  ],
});

KASUS.push({
  id: "berkas-kosong",
  keadaan: { nominatif: [snap(1, 9, "DSN", "2018-01-01")] },
  baris: [],
});

KASUS.push({
  id: "baris-kosong-di-tengah",
  keadaan: { nominatif: [snap(1, 9, "DSN", "2018-01-01"), snap(2, 9, "DSN", "2018-01-01"), snap(3, 9, "DSN", "2018-01-01")] },
  baris: [baris(nip(1)), [], [], baris(nip(2)), baris("nip salah"), baris(nip(3))],
});

KASUS.push({
  id: "sheet-bernama",
  keadaan: { nominatif: [snap(1, 9, "DSN", "2018-01-01"), snap(2, 9, "TDK", "2018-01-01")] },
  baris: [baris(nip(1), { rumus: true }), baris(nip(2))],
  namaSheetBerkas: ["Ringkasan", "Rekap September", "Lain"],
  indeksData: 1,
  namaSheet: "Rekap September",
});

KASUS.push({
  id: "sheet-pertama-bukan-data",
  keadaan: { nominatif: [snap(1, 9, "DSN", "2018-01-01")] },
  baris: [baris(nip(1))],
  namaSheetBerkas: ["Rekap", "Info"],
  indeksData: 0,
  namaSheet: null,
});

// Acak bersemi tetap: campuran keadaan pegawai, baris ganda, peringatan, rekap lama.
function kasusAcak(id: string, benih: number, jumlahBaris: number): Kasus {
  let s = benih;
  const acak = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pilih = <T,>(a: T[]): T => a[Math.floor(acak() * a.length)];
  const keadaan: KeadaanImpor = { pegawai: [], nominatif: [], rekap: [] };
  const kolam = 120;
  for (let n = 1; n <= kolam; n++) {
    const jenis = pilih(["DSN", "DSN", "TDK", "TDK", "AKL", "NON"]);
    if (jenis === "NON") {
      if (acak() < 0.5) keadaan.pegawai!.push(nip(n)); // pegawai tanpa Nominatif; sisanya tak dikenal
      continue;
    }
    const tmt = pilih(["2015-03-20", "2026-09-01", "2026-09-30", "2026-10-02", "2027-02-02", "2010-01-01"]);
    if (acak() < 0.8) keadaan.nominatif!.push(snap(n, pilih([9, 9, 8, 7]), jenis, tmt));
    if (acak() < 0.3) keadaan.nominatif!.push(snap(n, 10, pilih(["AKL", "DSN"]), tmt)); // setelah bulan rekap
    if (acak() < 0.35) keadaan.pegawai!.push(nip(n));
    if (acak() < 0.4) keadaan.rekap!.push({ nip: nip(n), bulan: pilih([8, 9, 9]), tahun: 2026, komponen: { SIGMA_HARI: "30", TK: "1", JENIS_SHIFT: "lama" } });
  }
  keadaan.pegawai = [...new Set(keadaan.pegawai)];
  const rows: PembuatBaris[] = [];
  for (let i = 0; i < jumlahBaris; i++) {
    const n = 1 + Math.floor(acak() * (kolam + 15));
    const k: Record<string, number> = {};
    for (const c of KOMPONEN_HARI) if (acak() < 0.25) k[c] = Math.floor(acak() * 4);
    rows.push(
      baris(acak() < 0.05 ? `'${nip(n)}` : acak() < 0.03 ? null : nip(n), {
        k,
        rumus: acak() < 0.3,
        bulanTeks: acak() < 0.9 ? "September" : pilih(["Agustus", "SEPTEMBER", null, "  Sep "]),
        total: acak() < 0.1 ? Math.floor(acak() * 30) : undefined,
        shift: acak() < 0.1 ? null : pilih(["-", "Satpam 3 Shift", "Pagi"]),
        cuti: acak() < 0.1 ? null : pilih(["-", 1, 2, "ke-3"]),
      }),
    );
  }
  return { id, keadaan, baris: rows };
}
KASUS.push(kasusAcak("acak-1", 20261013, 450), kasusAcak("acak-2", 7, 450));

// ---------- penjalankan ----------
async function tulisXlsx(jalur: string, k: Kasus): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const namaSheet = k.namaSheetBerkas ?? ["Data"];
  namaSheet.forEach((nama, i) => {
    const ws = wb.addWorksheet(nama);
    if (i !== (k.indeksData ?? 0)) return ws.addRow(["x"]);
    ws.addRow(HEADER);
    isiBaris(k).forEach((b) =>
      ws.addRow(b.map((v) => (v !== null && typeof v === "object" ? { formula: v.f, result: v.v } : v))),
    );
  });
  await wb.xlsx.writeFile(jalur);
}

const isiBaris = (k: Kasus): Sel[][] => k.baris.map((b, i) => (typeof b === "function" ? b(i + 2) : b));

async function muatKeadaan(prisma: PrismaClient, k: KeadaanImpor): Promise<void> {
  const [s, u] = await Promise.all([prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }), prisma.unitAsal.findFirstOrThrow({ orderBy: { kode: "asc" } })]);
  const batchNominatif = await prisma.uploadBatch.create({ data: { jenis: "nominatif_bulanan", namaFileAsli: "n.xlsx", diunggahOlehNama: "t" } });
  const nips = new Set<string>([...(k.pegawai ?? []), ...(k.nominatif ?? []).map((x) => x.nip), ...(k.rekap ?? []).map((x) => x.nip)]);
  await prisma.pegawai.createMany({ data: [...nips].map((nip) => ({ nip })) });
  for (const x of k.nominatif ?? []) {
    await prisma.nominatifBulanan.create({
      data: {
        pegawaiNip: x.nip, bulan: x.bulan, tahun: x.tahun, nama: `Pegawai ${x.nip}`, jenisKelamin: "L", jenisPegawaiKode: x.jenis,
        statusKepegawaianKode: s.kode, unitAsalKode: u.kode, tanggalMulaiKerja: new Date(`${x.tmt}T00:00:00.000Z`), uploadBatchId: batchNominatif.id,
      },
    });
  }
  if ((k.rekap ?? []).length > 0) {
    const lama = await prisma.uploadBatch.create({ data: { jenis: "kehadiran_bulanan", namaFileAsli: "lama.xlsx", diunggahOlehNama: "t" } });
    for (const r of k.rekap!) {
      const h = await prisma.rekapKehadiranBulanan.create({ data: { nip: r.nip, bulan: r.bulan, tahun: r.tahun, uploadBatchId: lama.id } });
      await prisma.rekapKehadiranDetail.createMany({ data: Object.entries(r.komponen).map(([komponenKode, nilai]) => ({ rekapKehadiranBulananId: h.id, komponenKode, nilai })) });
    }
  }
}

async function ambilHasil(prisma: PrismaClient, batchId: number): Promise<HasilKasusImpor> {
  const b = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
  const header = await prisma.rekapKehadiranBulanan.findMany({ orderBy: { id: "asc" }, include: { detail: { orderBy: { id: "asc" } } } });
  const catatan = await prisma.barisGagalUpload.findMany({ where: { uploadBatchId: batchId }, orderBy: { id: "asc" } });
  return {
    galat: null,
    batch: {
      jenis: b.jenis, nama_file: b.namaFileAsli, diupload_oleh: b.diunggahOlehNama,
      total_baris: b.jumlahBarisTotal, baris_berhasil: b.jumlahBerhasil, baris_gagal: b.jumlahGagal,
    },
    rekap: header.map((h) => ({ nip: h.nip, bulan: h.bulan, tahun: h.tahun, baru: h.uploadBatchId === batchId, detail: h.detail.map((d) => [d.komponenKode, d.nilai] as [string, string]) })),
    catatan: catatan.map((c) => [c.nomorBaris, c.nipDimaksud, c.alasan] as [number, string, string]),
  };
}

const urut = (h: HasilKasusImpor): HasilKasusImpor => ({ ...h, rekap: [...h.rekap].sort((a, b) => a.nip.localeCompare(b.nip) || a.tahun - b.tahun || a.bulan - b.bulan) });

describe.skipIf(!ada)("Paritas importer Rekap Kehadiran terhadap importer KDS2 asli", () => {
  const dir = mkdtempSync(join(tmpdir(), "kds-impor-"));
  const prisma = new PrismaClient();
  let oracle: Awaited<ReturnType<typeof jalankanOracleImpor>>;
  const jalurBerkas = (id: string, mode: "xl" | "php") => join(dir, `${id}.${mode}.xlsx`).replace(/\\/g, "/");

  beforeAll(async () => {
    const kasusOracle: KasusOracleImpor[] = [];
    for (const k of KASUS) {
      const dasar = { keadaan: k.keadaan, bulan: k.bulan ?? 9, tahun: k.tahun ?? 2026, namaSheet: k.namaSheet ?? null, namaFileAsli: "rekap.xlsx" };
      await tulisXlsx(jalurBerkas(k.id, "xl"), k);
      kasusOracle.push({ ...dasar, id: `${k.id}.xl`, berkas: jalurBerkas(k.id, "xl") });
      kasusOracle.push({
        ...dasar, id: `${k.id}.php`, berkas: jalurBerkas(k.id, "php"),
        tulisBerkas: { baris: [HEADER, ...isiBaris(k)], namaSheet: k.namaSheetBerkas, indeksData: k.indeksData },
      });
    }
    oracle = await jalankanOracleImpor(kasusOracle);
  }, 280_000);

  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it("konfigurasi kolom sama dengan config/rekap_kehadiran.php KDS2", () => {
    const c = oracle._konfigurasi as { kolom_header_rows: number; kolom_bulan: number; kolom_nip: number; kolom_komponen: Record<string, string>; nama_bulan: Record<string, string> };
    expect(CONFIG_REKAP.kolomHeaderRows).toBe(c.kolom_header_rows);
    expect(CONFIG_REKAP.kolomBulan).toBe(c.kolom_bulan);
    expect(CONFIG_REKAP.kolomNip).toBe(c.kolom_nip);
    expect(Object.fromEntries(CONFIG_REKAP.kolomKomponen.map(([p, kode]) => [String(p), kode]))).toEqual(c.kolom_komponen);
    expect(Object.keys(c.kolom_komponen)).toEqual(CONFIG_REKAP.kolomKomponen.map(([p]) => String(p))); // urutan komponen
    expect(Object.fromEntries(CONFIG_REKAP.namaBulan.slice(1).map((n, i) => [String(i + 1), n]))).toEqual(c.nama_bulan);
  });

  for (const k of KASUS) {
    for (const mode of ["xl", "php"] as const) {
      it(`${k.id} [berkas ${mode === "xl" ? "ditulis exceljs, dibaca PhpSpreadsheet" : "ditulis PhpSpreadsheet, dibaca exceljs"}]`, async () => {
        const kunci = `${k.id}.${mode}`;
        const harapan = oracle[kunci] as HasilKasusImpor;
        expect(harapan.galat, `oracle galat: ${harapan.galat}`).toBeNull();

        await kosongkanDomain(prisma);
        await muatKeadaan(prisma, k.keadaan);
        const { batchId } = await simpanRekap(
          prisma, readFileSync(jalurBerkas(k.id, mode)), "rekap.xlsx",
          { bulan: k.bulan ?? 9, tahun: k.tahun ?? 2026, namaSheet: k.namaSheet ?? null }, { id: null, nama: "oracle" },
        );
        const hasil = await ambilHasil(prisma, batchId);
        expect(urut(hasil)).toEqual(urut(harapan));
      }, 60_000);
    }
  }

  it("katalog memuat kasus yang bermakna (bukan kosong semua)", () => {
    const acak = oracle["acak-1.xl"] as HasilKasusImpor;
    expect(acak.batch!.baris_berhasil).toBeGreaterThan(100);
    expect(acak.batch!.baris_gagal).toBeGreaterThan(20);
    expect(acak.catatan.some(([, , a]) => a.startsWith("[PERINGATAN]"))).toBe(true);
    expect(acak.rekap.filter((r) => !r.baru).length).toBeGreaterThan(0);
  });
});
