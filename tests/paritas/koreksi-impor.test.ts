/**
 * PARITAS Impor Koreksi Rekap (F4.2c): KoreksiRekapImporter KDS2 ASLI (oracle PHP di SQLite memori) dan impor baru (kds_test)
 * memproses keadaan dan berkas yang SAMA: hasil parse (status/pesan/data/dampak per baris, ringkasan, galat berkas), hasil simpan,
 * lalu keadaan akhir (rekap + detail ber-id, tabel koreksi, audit_log baris demi baris). Berkas dua arah (exceljs/PhpSpreadsheet).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { bacaBarisKoreksi, HEADER_KOREKSI, parseKoreksi, simpanKoreksiImpor } from "@/lib/koreksi/impor";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { type KeadaanLengkap, muatKeadaan } from "../support/keadaan";
import { jalankanOracleKoreksi, oracleImporTersedia } from "../support/oracleImpor";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleImporTersedia());

type Sel = string | number | null | { d: string };
type Kasus = { id: string; keadaan: KeadaanLengkap; baris: Sel[][]; header?: string[] };
const nip = (n: number) => `19800101200501${String(n).padStart(4, "0")}`;
const H = HEADER_KOREKSI;
const per = (n: number, dari: string, ke: string, mulai: Sel, selesai: Sel = "", alasan = "uji", sumber = "", jenis = ""): Sel[] => [nip(n), jenis, dari, ke, mulai, selesai, "", "", "", alasan, sumber];
const ang = (n: number, dari: string, ke: string, bulan: Sel, tahun: Sel, hari: Sel, alasan = "uji"): Sel[] => [nip(n), "angka", dari, ke, "", "", bulan, tahun, hari, alasan, ""];
const rek = (n: number, bulan: number, tahun: number, komponen: Record<string, string>) => ({ nip: nip(n), bulan, tahun, komponen: { SIGMA_HARI: "30", ...komponen } });
const snap = (n: number) => ({ nip: nip(n), bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" });

const dasar: KeadaanLengkap = {
  nominatif: [1, 2, 3].map(snap),
  rekap: [rek(1, 9, 2026, { TK: "6", TB: "1" }), rek(1, 10, 2026, { TK: "2" }), rek(1, 11, 2026, { TK: "4" }), rek(2, 9, 2026, { TK: "5", TD: "3" }), rek(3, 9, 2026, { TK: "1" })],
};

const KASUS: Kasus[] = [
  {
    id: "valid-dasar",
    keadaan: dasar,
    baris: [
      per(1, "tk", "tb", "2026-09-01", "2026-09-30"), per(1, "TD", "-", "01-10-2026", "31-10-2026"), per(2, "TK", "HAPUS", "01/09/2026"), per(2, "TD", "tidak dihitung", "01.09.2026", "30.09.2026"),
      per(1, "I", "S", { d: "2026-11-01" }, { d: "2026-11-30" }), ang(1, "TK", "TB", 9, 2026, 2), ang(3, "TK", "", "9", "2026", "1"), per(3, "TK", "TB", "2026-09-01", "", "uji", "SK 1", "PERIODE"),
      [nip(2), "ANGKA", "TK", "CTH", "", "", 9, 2026, 2, "huruf besar", ""],
    ],
  },
  {
    id: "galat-per-aturan",
    keadaan: dasar,
    baris: [
      ["", "", "TK", "TB", "2026-09-01", "", "", "", "", "a", ""], // NIP kosong
      [nip(99), "", "TK", "TB", "2026-09-01", "", "", "", "", "a", ""], // NIP tak ada
      per(1, "TK", "TB", "2026-09-01", "", "a", "", "bulanan"), // jenis salah
      per(1, "XX", "TB", "2026-09-01"), per(1, "TK", "XX", "2026-09-01"), per(1, "TK", "TK", "2026-09-01"), // komponen
      per(1, "TK", "TB", "2026-09-01", "", ""), per(1, "TK", "TB", "2026-09-01", "", "a".repeat(256)), per(1, "TK", "TB", "2026-09-01", "", "ok", "s".repeat(151)), // alasan/sumber
      per(1, "TK", "TB", "2026-09-01", "", "a".repeat(255), "s".repeat(150)), // batas pas
      ang(1, "TK", "TB", 13, 2026, 1), ang(1, "TK", "TB", 9, 2019, 1), ang(1, "TK", "TB", 9, 2101, 1), ang(1, "TK", "TB", 9, 2026, 0), ang(1, "TK", "TB", 9, 2026, 32), ang(1, "TK", "TB", "x", 2026, 1),
      ang(1, "TK", "TB", "9.0", " 2026 ", "1e0"), ang(1, "TK", "TB", "", 2026, 1), ang(1, "TK", "TB", 9, "", 1), ang(1, "TK", "TB", 9, 2026, ""),
      per(1, "TK", "TB", ""), per(1, "TK", "TB", "1/9/2026"), per(1, "TK", "TB", "2026-02-30"), per(1, "TK", "TB", "2026-09-30", "2026-09-01"), per(1, "TK", "TB", "2026-09-01", "kemarin"), per(1, "TK", "TB", "2026-9-1"),
      per(1, "TK", "TB", "2026-09-01", "2026-09-01"), // selesai = mulai: boleh
    ],
  },
  {
    id: "duplikat",
    keadaan: {
      ...dasar,
      koreksi: [
        { nip: nip(1), dari_komponen: "TK", ke_komponen: "TB", tanggal_mulai: "2026-09-01", tanggal_selesai: "2026-09-30" },
        { nip: nip(2), jenis: "angka", dari_komponen: "TK", ke_komponen: "CTH", tanggal_mulai: "2026-09-01", tanggal_selesai: "2026-09-30", bulan: 9, tahun: 2026, jumlah_hari: 2 },
        { nip: nip(3), dari_komponen: "TK", ke_komponen: "TB", tanggal_mulai: "2026-09-01", dibatalkan_pada: "2026-02-01 00:00:00" }, // batal: tidak menghalangi
      ],
    },
    baris: [
      per(1, "TK", "TB", "2026-09-01", "2026-09-30"), per(1, "TK", "TB", "2026-09-01", "2026-09-30", "alasan lain"), // sudah ada (alasan tak ikut kunci)
      ang(2, "TK", "CTH", 9, 2026, 2), ang(2, "TK", "CTH", 9, 2026, 3), // angka sama / hari beda
      per(3, "TK", "TB", "2026-09-01"), per(3, "TK", "TB", "2026-09-01"), per(3, "TK", "TB", "01-09-2026"), // duplikat dalam berkas (format beda, kunci sama)
    ],
  },
  {
    id: "nip-dan-spasi",
    keadaan: { ...dasar, pegawai: ["12345"] },
    baris: [
      [12345, "", "TK", "TB", "2026-09-01", "", "", "", "", "NIP angka", ""], [` ${nip(1)} `, "", "TK", "TB", "2026-10-01", "", "", "", "", "spasi", ""], [`${nip(2)}\t`, "", "TK", "TB", "2026-09-01", "", "", "", "", "tab", ""],
      [`'${nip(3)}`, "", "TK", "TB", "2026-09-01", "", "", "", "", "petik", ""], // petik: tidak dikenal
      [nip(1).replace(/(\d{6})/, "$1 "), "", "TK", "TB", "2026-11-01", "", "", "", "", "spasi di tengah", ""],
    ],
  },
  {
    id: "baris-kosong-dan-spasi",
    keadaan: dasar,
    baris: [per(1, "TK", "TB", "2026-09-01"), [], [null, "  ", null], [], ["   ", "", "", "", "", "", "", "", "", "", ""], per(2, "TK", "TB", "2026-09-01"), ["catatan bebas"]],
  },
  {
    id: "urutan-kolom-dan-nama-header",
    keadaan: dasar,
    header: ["ALASAN", "dari_komponen", "Ke  Komponen", "N.I.P", "tanggal mulai", "Jenis", "Sumber", "Tanggal-Selesai", "Bulan", "Tahun", "Jumlah Hari"],
    baris: [["header acak", "tk", "tb", nip(1), "2026-09-01", "", "SK", "", "", "", ""], ["angka", "TK", "TB", nip(2), "", "angka", "", "", 9, 2026, 2]],
  },
  { id: "header-kurang", keadaan: dasar, header: ["NIP", "Jenis", "Ke Komponen", "Alasan"], baris: [[nip(1), "", "TB", "x"]] },
  { id: "tanpa-baris-data", keadaan: dasar, baris: [] },
  {
    id: "dampak-sebagian-digantikan",
    keadaan: { ...dasar, koreksi: [{ nip: nip(1), jenis: "angka", dari_komponen: "TD", ke_komponen: "S", tanggal_mulai: "2026-10-01", tanggal_selesai: "2026-10-31", bulan: 10, tahun: 2026, jumlah_hari: 1 }] },
    baris: [
      per(1, "TK", "TB", "2026-09-15"), // sebagian (mulai di tengah bulan)
      per(1, "TK", "TB", "2026-10-01", "2026-10-20"), // digantikan angka (Okt) dan sebagian
      per(1, "TK", "TB", "2026-11-01"), // penuh Nov dst.
      ang(1, "TK", "TB", 9, 2026, 9), // kurang (tersedia 6)
      per(3, "TK", "TB", "2025-01-01", "2025-12-31"), // di luar: dampak 0
    ],
  },
];

function kasusAcak(id: string, benih: number): Kasus {
  let s = benih;
  const acak = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pilih = <T,>(a: T[]): T => a[Math.floor(acak() * a.length)];
  const komp = ["I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN"];
  const n = 10;
  const keadaan: KeadaanLengkap = { nominatif: [], rekap: [] };
  for (let i = 1; i <= n; i++) {
    keadaan.nominatif!.push(snap(i));
    for (const bulan of [8, 9, 10]) {
      const k: Record<string, string> = {};
      for (const c of komp) if (acak() < 0.35) k[c] = String(Math.floor(acak() * 6));
      keadaan.rekap!.push(rek(i, bulan, 2026, k));
    }
  }
  const baris: Sel[][] = [];
  for (let i = 0; i < 150; i++) {
    const dari = pilih([...komp, komp[0], "xx"]);
    const ke = pilih([...komp, "", "-", "HAPUS", dari]);
    const nomorNip = pilih([1 + Math.floor(acak() * n), 99, 5]);
    if (acak() < 0.4) baris.push(ang(nomorNip, dari, ke, pilih([8, 9, 10, 13, "x"] as Sel[]), pilih([2026, 2026, 2019] as Sel[]), pilih([1, 2, 3, 6, 0, 40] as Sel[]), pilih(["alasan", ""])));
    else baris.push(per(nomorNip, dari, ke, pilih(["2026-08-01", "2026-09-01", "2026-09-15", "2026-10-01", "01-11-2026", "bukan", ""]), pilih(["", "", "2026-09-30", "2026-10-31", "2026-08-15"]), pilih(["alasan", "alasan", ""])));
  }
  return { id, keadaan, baris };
}
KASUS.push(kasusAcak("acak-1", 20261013), kasusAcak("acak-2", 31337));

// ---------- penjalankan ----------
async function tulisXlsx(jalur: string, k: Kasus): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Koreksi");
  ws.addRow(k.header ?? H);
  k.baris.forEach((b) => ws.addRow(b.map((v) => (v !== null && typeof v === "object" ? new Date(`${v.d}T00:00:00.000Z`) : v))));
  await wb.xlsx.writeFile(jalur);
}

const keSnake = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(keSnake);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), keSnake(x)]));
  return v;
};

type KeluaranOracle = { langkah: { hasil: { parse: { baris: unknown[]; ringkasan: unknown; galat?: string }; simpan: unknown } | null; galat: string | null }[]; rekap: unknown[]; koreksi: Record<string, unknown>[]; audit: (string | null)[][] };

describe.skipIf(!ada)("Paritas Impor Koreksi Rekap terhadap KoreksiRekapImporter KDS2 asli", () => {
  const dir = mkdtempSync(join(tmpdir(), "kds-kimp-"));
  const prisma = new PrismaClient();
  let oracle: Record<string, KeluaranOracle>;
  const jalur = (id: string, mode: "xl" | "php") => join(dir, `${id}.${mode}.xlsx`).replace(/\\/g, "/");

  beforeAll(async () => {
    const kasusOracle: unknown[] = [];
    for (const k of KASUS) {
      await tulisXlsx(jalur(k.id, "xl"), k);
      for (const mode of ["xl", "php"] as const) {
        kasusOracle.push({
          id: `${k.id}.${mode}`, keadaan: k.keadaan,
          langkah: [{ op: "imporKoreksi", simpan: true, pengguna: "Admin Uji", berkas: jalur(k.id, mode), ...(mode === "php" ? { tulisBerkas: { baris: [k.header ?? H, ...k.baris], namaSheet: ["Koreksi"] } } : {}) }],
        });
      }
    }
    oracle = (await jalankanOracleKoreksi(kasusOracle)) as typeof oracle;
  }, 280_000);

  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  for (const k of KASUS) {
    for (const mode of ["xl", "php"] as const) {
      it(`${k.id} [berkas ${mode === "xl" ? "ditulis exceljs, dibaca PhpSpreadsheet" : "ditulis PhpSpreadsheet, dibaca exceljs"}]`, async () => {
        const harapan = oracle[`${k.id}.${mode}`];
        expect(harapan.langkah[0].galat, `oracle galat: ${harapan.langkah[0].galat}`).toBeNull();
        const h = harapan.langkah[0].hasil!;

        await kosongkanDomain(prisma);
        await prisma.auditLog.deleteMany();
        await muatKeadaan(prisma, k.keadaan);

        const parse = await parseKoreksi(prisma, await bacaBarisKoreksi(readFileSync(jalur(k.id, mode))));
        expect(keSnake(parse)).toEqual(h.parse);
        const simpan = parse.galat ? null : await simpanKoreksiImpor(prisma, parse.baris, "Admin Uji");
        expect(keSnake(simpan)).toEqual(h.simpan);

        const header = await prisma.rekapKehadiranBulanan.findMany({ orderBy: { id: "asc" }, include: { detail: { orderBy: { id: "asc" } } } });
        expect(header.map((x) => ({ nip: x.nip, bulan: x.bulan, tahun: x.tahun, baru: false, detail: x.detail.map((d) => [d.id, d.komponenKode, d.nilai]) }))).toEqual((harapan.rekap as { baru: boolean }[]).map((x) => ({ ...x, baru: false })));

        const tgl = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
        const koreksi = (await prisma.koreksiRekap.findMany({ orderBy: { id: "asc" } })).map((x) => ({
          id: x.id, nip: x.nip, jenis: x.jenis, dari_komponen: x.dariKomponen, ke_komponen: x.keKomponen, tanggal_mulai: tgl(x.tanggalMulai), tanggal_selesai: tgl(x.tanggalSelesai),
          bulan: x.bulan, tahun: x.tahun, jumlah_hari: x.jumlahHari, diterapkan_batch_id: x.diterapkanBatchId, alasan: x.alasan, sumber: x.sumber, dibuat_oleh: x.dibuatOleh,
          dibuat_pada: "<waktu>", dibatalkan_pada: x.dibatalkanPada ? "<waktu>" : null,
        }));
        expect(koreksi).toEqual(harapan.koreksi.map((x) => ({ ...x, tanggal_mulai: String(x.tanggal_mulai).slice(0, 10), tanggal_selesai: x.tanggal_selesai ? String(x.tanggal_selesai).slice(0, 10) : null, dibuat_pada: "<waktu>", dibatalkan_pada: x.dibatalkan_pada ? "<waktu>" : null })));

        const maska = (f: string | null, v: string | null) => (f === "dibuat_pada" || f === "dibatalkan_pada" ? "<waktu>" : v);
        const audit = (await prisma.auditLog.findMany({ orderBy: { id: "asc" } })).map((a) => [a.namaTabel, a.idRecord, a.fieldDiubah, a.nilaiLama, maska(a.fieldDiubah, a.nilaiBaru), a.diubahOleh, a.aksi]);
        expect(audit).toEqual(harapan.audit.map((a) => [a[0], a[1], a[2], a[3], maska(a[2], a[4]), a[5], a[6]]));
      }, 90_000);
    }
  }

  it("katalog bermakna: acak menghasilkan baris valid, gagal, duplikat, dan perubahan angka", () => {
    const a = oracle["acak-1.xl"].langkah[0].hasil!.parse.ringkasan as { valid: number; gagal: number; duplikat: number };
    expect((oracle["duplikat.xl"].langkah[0].hasil!.parse.ringkasan as { duplikat: number }).duplikat).toBeGreaterThan(3);
    expect(a.valid).toBeGreaterThan(20);
    expect(a.gagal).toBeGreaterThan(20);
    expect(oracle["acak-1.xl"].audit.some((r) => r[0] === "rekap_kehadiran_detail")).toBe(true);
    expect(oracle["header-kurang.xl"].langkah[0].hasil!.parse.galat).toMatch(/Header wajib tidak ditemukan/);
  });
});
