/**
 * PARITAS Koreksi Rekap (F4.2a): KoreksiRekapService + importer KDS2 ASLI (oracle PHP di SQLite memori) dan layanan baru
 * (kds_test) menjalankan urutan langkah yang SAMA pada keadaan awal sintetis; hasil tiap langkah dan keadaan akhir harus
 * identik: rekap + detail (termasuk id), tabel koreksi, dan audit_log baris demi baris (nilai lama/baru, pengubah).
 * Waktu (dibuat_pada, dibatalkan_pada, diubah_pada) tidak ikut dibandingkan.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { simpanRekap } from "@/lib/impor/rekapKehadiran";
import {
  batalkanKoreksi, buatDataKoreksi, type HasilTerapan, type InputKoreksi, komponenTersedia, koreksiBerlakuUntukNip,
  pratinjauKoreksi, simpanDanTerapkanKoreksi, terapkanUntukBulan,
} from "@/lib/koreksi/layanan";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { type KeadaanLengkap, muatKeadaan } from "../support/keadaan";
import { jalankanOracleKoreksi, oracleImporTersedia, type Sel } from "../support/oracleImpor";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleImporTersedia());

// ---------- katalog ----------
type DataSnake = {
  jenis: "periode" | "angka"; nip: string; dari_komponen: string; ke_komponen?: string | null; tanggal_mulai?: string | null;
  tanggal_selesai?: string | null; bulan?: number; tahun?: number; jumlah_hari?: number; alasan: string; sumber?: string | null;
};
type Langkah =
  | { op: "buat"; data: DataSnake; pengguna: string }
  | { op: "pratinjau"; data: DataSnake }
  | { op: "batalkan"; indeks: number; pengguna: string }
  | { op: "terapkanUlang"; bulan: number; tahun: number; pengguna: string }
  | { op: "impor"; bulan: number; tahun: number; pengguna: string; baris: { nip: string; k: Record<string, number> }[] }
  | { op: "koreksiBerlakuNip"; nip: string; tahun: number }
  | { op: "komponenTersedia" };
type Kasus = { id: string; keadaan: KeadaanLengkap; langkah: Langkah[] };

const nip = (n: number) => `19800101200501${String(n).padStart(4, "0")}`;
const A = nip(1);
const B = nip(2);
const HEADER = ["NO", "NAMA", "UNIT", "GOL", "BULAN", "SIGMA HARI", "I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN", "TOTAL", "JUMLAH MASUK NYATA", "JENIS SHIFT", "NIP", "CUTI ANAK KE"];
const HARI = ["I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN"];
const NAMA_BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const barisRekap = (l: Extract<Langkah, { op: "impor" }>): Sel[][] => [
  HEADER,
  ...l.baris.map((b, i): Sel[] => {
    const jumlah = HARI.reduce((s, c) => s + (b.k[c] ?? 0), 0);
    return [i + 1, `P${i}`, "U", "III/a", NAMA_BULAN[l.bulan], 30, ...HARI.map((c) => b.k[c] ?? 0), 30 - jumlah, 30 - jumlah, "-", b.nip, "-"];
  }),
];

const snap = (n: number, bulan = 8, tahun = 2026) => ({ nip: nip(n), bulan, tahun, jenis: "DSN", tmt: "2018-01-01" });
const rek = (n: number, bulan: number, tahun: number, komponen: Record<string, string>) => ({ nip: nip(n), bulan, tahun, komponen: { SIGMA_HARI: "30", ...komponen } });
const periode = (n: number, dari: string, ke: string | null, mulai: string, selesai: string | null, alasan = "uji"): DataSnake => ({ jenis: "periode", nip: nip(n), dari_komponen: dari, ke_komponen: ke, tanggal_mulai: mulai, tanggal_selesai: selesai, alasan });
const angka = (n: number, dari: string, ke: string | null, bulan: number, tahun: number, hari: number, alasan = "uji"): DataSnake => ({ jenis: "angka", nip: nip(n), dari_komponen: dari, ke_komponen: ke, bulan, tahun, jumlah_hari: hari, alasan });
const buat = (data: DataSnake, pengguna = "Admin"): Langkah => ({ op: "buat", data, pengguna });
const ulang = (bulan: number, tahun = 2026): Langkah => ({ op: "terapkanUlang", bulan, tahun, pengguna: "Admin" });

const KASUS: Kasus[] = [
  {
    id: "periode-penuh-dan-sebagian",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 9, 2026, { TK: "6", TB: "1" }), rek(1, 10, 2026, { TK: "2" }), rek(1, 11, 2026, { TK: "4", TB: "0" }), rek(1, 12, 2026, { TK: "3" })] },
    langkah: [
      { op: "pratinjau", data: periode(1, "TK", "TB", "2026-09-01", "2026-10-15") },
      buat(periode(1, "TK", "TB", "2026-09-01", "2026-10-15", "Tugas belajar")),
      ulang(9), ulang(10),
      buat({ ...periode(1, "TK", "CTH", "2026-11-01", null), sumber: "SK 7" }),
    ],
  },
  {
    id: "tujuan-kosong-dihapus",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 10, 2026, { TK: "5", I: "2" }), rek(1, 11, 2026, { TK: "1" }), rek(1, 12, 2026, {})] },
    langkah: [{ op: "pratinjau", data: periode(1, "TK", null, "2026-10-01", "2026-12-31") }, buat(periode(1, "TK", null, "2026-10-01", "2026-12-31", "Pensiun")), ulang(10), ulang(12)],
  },
  {
    id: "angka-kurang-dan-idempotensi",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 9, 2026, { TK: "6" })] },
    langkah: [
      buat(angka(1, "TK", "TB", 9, 2026, 10)), // diminta 10, tersedia 6
      ulang(9), ulang(9), // idempotensi: tidak berubah
      buat(angka(1, "TB", "CTH", 9, 2026, 2)),
      ulang(9),
      { op: "pratinjau", data: angka(1, "TK", "TB", 9, 2026, 3) },
    ],
  },
  {
    id: "angka-lalu-upload-ulang",
    keadaan: { nominatif: [snap(1), snap(2)], rekap: [rek(1, 9, 2026, { TK: "6" }), rek(2, 9, 2026, { TK: "4" })] },
    langkah: [
      buat(angka(1, "TK", "TB", 9, 2026, 3)),
      buat(periode(1, "TK", "TB", "2026-01-01", null)), // digantikan koreksi angka di bulan 9
      { op: "pratinjau", data: periode(1, "TK", "TB", "2026-01-01", null) },
      { op: "impor", bulan: 9, tahun: 2026, pengguna: "Admin", baris: [{ nip: A, k: { TK: 6 } }, { nip: B, k: { TK: 2 } }] }, // batch baru: angka diterapkan lagi
      ulang(9),
      { op: "impor", bulan: 10, tahun: 2026, pengguna: "Admin", baris: [{ nip: A, k: { TK: 8 } }] }, // bulan baru: periode berlaku
    ],
  },
  {
    id: "batalkan",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 9, 2026, { TK: "6" }), rek(1, 10, 2026, { TK: "4" })] },
    langkah: [buat(periode(1, "TK", "TB", "2026-09-01", "2026-09-30")), buat(periode(1, "TK", "CTH", "2026-10-01", "2026-10-31")), { op: "batalkan", indeks: 0, pengguna: "Admin" }, ulang(9), ulang(10), { op: "koreksiBerlakuNip", nip: A, tahun: 2026 }],
  },
  {
    id: "koreksi-lama",
    keadaan: {
      nominatif: [snap(1), snap(2)],
      rekap: [rek(1, 9, 2026, { TD: "4", TK: "3" }), rek(1, 10, 2026, { TD: "2" }), rek(2, 9, 2026, { TK: "5" })],
      koreksi: [
        { nip: A, dari_komponen: "TD", ke_komponen: "TB", tanggal_mulai: "2026-09-01", tanggal_selesai: null },
        { nip: A, jenis: "angka", dari_komponen: "TK", ke_komponen: "S", tanggal_mulai: "2026-09-01", tanggal_selesai: "2026-09-30", bulan: 9, tahun: 2026, jumlah_hari: 2, diterapkan_batch_id: 2 }, // sudah diterapkan pada batch rekap ini
        { nip: B, jenis: "angka", dari_komponen: "TK", ke_komponen: "I", tanggal_mulai: "2026-09-01", tanggal_selesai: "2026-09-30", bulan: 9, tahun: 2026, jumlah_hari: 1 },
        { nip: B, dari_komponen: "TK", ke_komponen: "TB", tanggal_mulai: "2026-09-01", tanggal_selesai: null, dibatalkan_pada: "2026-02-01 00:00:00" },
      ],
    },
    langkah: [ulang(9), ulang(10), { op: "pratinjau", data: periode(1, "TD", "S", "2026-09-01", null) }, { op: "koreksiBerlakuNip", nip: A, tahun: 2026 }, { op: "koreksiBerlakuNip", nip: B, tahun: 2026 }],
  },
  {
    id: "berantai",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 9, 2026, { TK: "5", TB: "2" })] },
    langkah: [buat(periode(1, "TK", "TB", "2026-09-01", null)), buat(periode(1, "TB", "CTH", "2026-09-01", null)), buat(periode(1, "CTH", null, "2026-09-01", "2026-09-30")), ulang(9)],
  },
  {
    id: "nilai-bukan-angka",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 9, 2026, { TK: "abc", TB: "3.7", S: "-", TD: " 4", I: "" })] },
    langkah: [
      { op: "pratinjau", data: periode(1, "TK", "TB", "2026-09-01", "2026-09-30") },
      buat(periode(1, "TK", "TB", "2026-09-01", "2026-09-30")),
      buat(periode(1, "S", "I", "2026-09-01", "2026-09-30")),
      buat(periode(1, "TD", "TB", "2026-09-01", "2026-09-30")),
      buat(periode(1, "I", "TB", "2026-09-01", "2026-09-30")),
    ],
  },
  {
    id: "tanpa-rekap-lalu-impor",
    keadaan: { nominatif: [snap(1), snap(2)] },
    langkah: [
      buat(periode(2, "TK", "TB", "2026-09-01", null)), // belum ada rekap: tidak ada yang berubah
      { op: "pratinjau", data: periode(2, "TK", "TB", "2026-09-01", null) },
      { op: "impor", bulan: 9, tahun: 2026, pengguna: "Admin", baris: [{ nip: B, k: { TK: 7 } }, { nip: A, k: { TK: 1 } }] }, // koreksi diterapkan oleh impor
    ],
  },
  {
    id: "lintas-tahun",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 11, 2025, { TK: "3" }), rek(1, 12, 2025, { TK: "4" }), rek(1, 1, 2026, { TK: "5" }), rek(1, 2, 2026, { TK: "6" })] },
    langkah: [buat(periode(1, "TK", "TB", "2025-12-15", "2026-01-31")), ulang(12, 2025), ulang(1), { op: "koreksiBerlakuNip", nip: A, tahun: 2026 }, { op: "koreksiBerlakuNip", nip: A, tahun: 2025 }],
  },
  {
    id: "angka-tanpa-header",
    keadaan: { nominatif: [snap(1)], rekap: [rek(1, 9, 2026, { TK: "2" })] },
    langkah: [buat(angka(1, "TK", "TB", 7, 2026, 3)), { op: "pratinjau", data: angka(1, "TK", "TB", 7, 2026, 3) }, ulang(7), ulang(9)],
  },
  { id: "komponen", keadaan: {}, langkah: [{ op: "komponenTersedia" }] },
];

function kasusAcak(id: string, benih: number, jumlahLangkah: number): Kasus {
  let s = benih;
  const acak = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pilih = <T,>(a: T[]): T => a[Math.floor(acak() * a.length)];
  const komp = ["I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN"];
  const n = 14;
  const keadaan: KeadaanLengkap = { nominatif: [], rekap: [] };
  for (let i = 1; i <= n; i++) {
    keadaan.nominatif!.push(snap(i));
    for (const bulan of [8, 9, 10]) {
      if (acak() < 0.15) continue;
      const k: Record<string, string> = {};
      for (const c of komp) if (acak() < 0.35) k[c] = String(Math.floor(acak() * 6));
      keadaan.rekap!.push(rek(i, bulan, 2026, k));
    }
  }
  const tgl = () => pilih(["2026-07-01", "2026-08-01", "2026-08-15", "2026-09-01", "2026-09-30", "2026-10-01", "2026-10-31", "2026-12-31"]);
  const langkah: Langkah[] = [];
  for (let i = 0; i < jumlahLangkah; i++) {
    const r = acak();
    const dari = pilih(komp);
    const ke = acak() < 0.15 ? null : pilih(komp.filter((c) => c !== dari));
    if (r < 0.4) {
      const a = tgl();
      const b = acak() < 0.3 ? null : pilih(["2026-09-30", "2026-10-15", "2026-10-31", "2026-11-30"]);
      langkah.push(buat(periode(1 + Math.floor(acak() * n), dari, ke, a, b && b >= a ? b : null)));
    } else if (r < 0.65) {
      langkah.push(buat(angka(1 + Math.floor(acak() * n), dari, ke, pilih([8, 9, 10]), 2026, 1 + Math.floor(acak() * 6))));
    } else if (r < 0.8) {
      langkah.push(ulang(pilih([8, 9, 10])));
    } else if (r < 0.88) {
      langkah.push({ op: "batalkan", indeks: Math.floor(acak() * Math.max(1, langkah.filter((l) => l.op === "buat").length)), pengguna: "Admin" });
    } else {
      const bulan = pilih([8, 9, 10]);
      const baris: { nip: string; k: Record<string, number> }[] = [];
      for (let j = 1; j <= n; j++) {
        if (acak() < 0.5) continue;
        const k: Record<string, number> = {};
        for (const c of komp) if (acak() < 0.3) k[c] = Math.floor(acak() * 6);
        baris.push({ nip: nip(j), k });
      }
      langkah.push({ op: "impor", bulan, tahun: 2026, pengguna: "Admin", baris });
    }
  }
  // batalkan hanya valid bila sudah ada koreksi: sisipkan satu koreksi di awal
  langkah.unshift(buat(periode(1, "TK", "TB", "2026-09-01", null)));
  return { id, keadaan, langkah };
}
KASUS.push(kasusAcak("acak-1", 20261013, 60), kasusAcak("acak-2", 99, 60), kasusAcak("acak-3", 4242, 60));

// ---------- penjalankan ----------
const keSnake = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(keSnake);
  if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), keSnake(x)]));
  return v;
};

const dariSnake = (d: DataSnake): InputKoreksi => ({
  jenis: d.jenis, nip: d.nip, dariKomponen: d.dari_komponen, keKomponen: d.ke_komponen, tanggalMulai: d.tanggal_mulai, tanggalSelesai: d.tanggal_selesai,
  bulan: d.bulan, tahun: d.tahun, jumlahHari: d.jumlah_hari, alasan: d.alasan, sumber: d.sumber,
});

const hasilTerap = (h: HasilTerapan) => keSnake(h);

describe.skipIf(!ada)("Paritas Koreksi Rekap terhadap KoreksiRekapService KDS2 asli", () => {
  const dir = mkdtempSync(join(tmpdir(), "kds-koreksi-"));
  const prisma = new PrismaClient();
  let oracle: Record<string, { langkah: { hasil: unknown; galat: string | null }[]; rekap: unknown[]; koreksi: Record<string, unknown>[]; audit: (string | null)[][] }>;
  const jalur = (id: string, i: number) => join(dir, `${id}.${i}.xlsx`).replace(/\\/g, "/");

  beforeAll(async () => {
    oracle = (await jalankanOracleKoreksi(
      KASUS.map((k) => ({
        id: k.id,
        keadaan: k.keadaan,
        langkah: k.langkah.map((l, i) =>
          l.op === "impor"
            ? { op: "impor", bulan: l.bulan, tahun: l.tahun, pengguna: l.pengguna, berkas: jalur(k.id, i), tulisBerkas: { baris: barisRekap(l) } }
            : l,
        ),
      })),
    )) as typeof oracle;
  }, 280_000);

  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  for (const k of KASUS) {
    it(k.id, async () => {
      const harapan = oracle[k.id];
      harapan.langkah.forEach((l, i) => expect(l.galat, `oracle galat di langkah ${i}: ${l.galat}`).toBeNull());

      await kosongkanDomain(prisma);
      await prisma.auditLog.deleteMany();
      await muatKeadaan(prisma, k.keadaan);

      const hasil: unknown[] = [];
      for (const [i, l] of k.langkah.entries()) {
        switch (l.op) {
          case "buat":
            hasil.push(hasilTerap((await simpanDanTerapkanKoreksi(prisma, buatDataKoreksi(dariSnake(l.data)), l.pengguna)).hasil));
            break;
          case "pratinjau":
            hasil.push(keSnake(await pratinjauKoreksi(prisma, buatDataKoreksi(dariSnake(l.data)))));
            break;
          case "batalkan": {
            const semua = await prisma.koreksiRekap.findMany({ orderBy: { id: "asc" } });
            await batalkanKoreksi(prisma, semua[l.indeks].id, l.pengguna);
            hasil.push({ id: semua[l.indeks].id });
            break;
          }
          case "terapkanUlang":
            hasil.push(hasilTerap(await terapkanUntukBulan(prisma, l.bulan, l.tahun, l.pengguna)));
            break;
          case "impor": {
            const r = await simpanRekap(prisma, readFileSync(jalur(k.id, i)), "rekap.xlsx", { bulan: l.bulan, tahun: l.tahun }, { id: null, nama: l.pengguna });
            hasil.push({ koreksi: hasilTerap(r.koreksi) });
            break;
          }
          case "koreksiBerlakuNip": {
            const r = await koreksiBerlakuUntukNip(prisma, l.nip, l.tahun);
            hasil.push(Object.fromEntries(Object.entries(r).map(([b, d]) => [b, d.map((x) => x.id)])));
            break;
          }
          case "komponenTersedia":
            hasil.push(Object.fromEntries((await komponenTersedia(prisma)).map((c) => [c.kode, c.nama])));
            break;
        }
      }

      // hasil tiap langkah (impor: batch id tidak dibandingkan; objek kosong PHP = [])
      const dariOracle = harapan.langkah.map((l) => {
        const h = l.hasil as Record<string, unknown> | unknown[];
        if (k.langkah[harapan.langkah.indexOf(l)].op === "impor") return { koreksi: (h as Record<string, unknown>).koreksi };
        if (k.langkah[harapan.langkah.indexOf(l)].op === "koreksiBerlakuNip") return Array.isArray(h) ? {} : h;
        return h;
      });
      expect(hasil).toEqual(dariOracle);

      // keadaan akhir
      const header = await prisma.rekapKehadiranBulanan.findMany({ orderBy: { id: "asc" }, include: { detail: { orderBy: { id: "asc" } } } });
      expect(
        header.map((h) => ({ nip: h.nip, bulan: h.bulan, tahun: h.tahun, baru: false, detail: h.detail.map((d) => [d.id, d.komponenKode, d.nilai]) })),
      ).toEqual((harapan.rekap as { baru: boolean }[]).map((h) => ({ ...h, baru: false })));

      const tgl = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
      const koreksi = (await prisma.koreksiRekap.findMany({ orderBy: { id: "asc" } })).map((x) => ({
        id: x.id, nip: x.nip, jenis: x.jenis, dari_komponen: x.dariKomponen, ke_komponen: x.keKomponen, tanggal_mulai: tgl(x.tanggalMulai),
        tanggal_selesai: tgl(x.tanggalSelesai), bulan: x.bulan, tahun: x.tahun, jumlah_hari: x.jumlahHari, diterapkan_batch_id: x.diterapkanBatchId,
        alasan: x.alasan, sumber: x.sumber, dibuat_oleh: x.dibuatOleh, dibuat_pada: "<waktu>", dibatalkan_pada: x.dibatalkanPada ? "<waktu>" : null,
      }));
      const koreksiOracle = harapan.koreksi.map((x) => ({
        ...x, tanggal_mulai: String(x.tanggal_mulai).slice(0, 10), tanggal_selesai: x.tanggal_selesai ? String(x.tanggal_selesai).slice(0, 10) : null,
        dibuat_pada: "<waktu>", dibatalkan_pada: x.dibatalkan_pada ? "<waktu>" : null,
      }));
      expect(koreksi).toEqual(koreksiOracle);

      const maskaWaktu = (field: string | null, nilai: string | null) => (field === "dibuat_pada" || field === "dibatalkan_pada" ? "<waktu>" : nilai);
      const audit = (await prisma.auditLog.findMany({ orderBy: { id: "asc" } })).map((a) => [a.namaTabel, a.idRecord, a.fieldDiubah, a.nilaiLama, maskaWaktu(a.fieldDiubah, a.nilaiBaru), a.diubahOleh, a.aksi]);
      expect(audit).toEqual(harapan.audit.map((a) => [a[0], a[1], a[2], a[3], maskaWaktu(a[2], a[4]), a[5], a[6]]));
    }, 120_000);
  }

  it("katalog bermakna: acak menghasilkan banyak perubahan dan jejak audit", () => {
    const a = oracle["acak-1"];
    expect(a.audit.length).toBeGreaterThan(50);
    expect(a.audit.some((r) => r[6] === "INSERT" && r[0] === "rekap_kehadiran_detail")).toBe(true);
  });
});
