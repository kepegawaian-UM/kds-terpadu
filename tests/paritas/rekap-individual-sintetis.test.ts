/**
 * Paritas Rekap Individual pada keadaan SINTETIS (kds_test <-> RekapIndividualService/Controller KDS2 asli di SQLite memori).
 * Melengkapi tes data asli untuk kasus yang jarang/tidak ada di data asli: sel tanda koreksi (tujuan nol, "dihapus", angka,
 * digantikan), keterangan koreksi dengan rentang bulan terputus, snapshot dari tahun sebelumnya, tahun tanpa rekap, pencarian
 * dengan huruf besar/kecil dan wildcard LIKE. Urutan hasil pencarian dibandingkan sebagai himpunan (SQLite mengurut biner,
 * kolasi MySQL dibuktikan di tes data asli).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { buatDataKoreksi, simpanDanTerapkanKoreksi, type InputKoreksi } from "@/lib/koreksi/layanan";
import { bangunRekapIndividual, cariPegawaiIndividual } from "@/lib/laporan/rekapIndividual";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { type KeadaanLengkap, muatKeadaan } from "../support/keadaan";
import { jalankanOracleKoreksi, oracleImporTersedia } from "../support/oracleImpor";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleImporTersedia());
const nip = (n: number) => `19800101200501${String(n).padStart(4, "0")}`;
const snap = (n: number, bulan: number, tahun: number, jenis = "DSN", nama?: string) => ({ nip: nip(n), bulan, tahun, jenis, tmt: "2010-01-01", ...(nama ? { nama } : {}) });
const rek = (n: number, bulan: number, tahun: number, komponen: Record<string, string>) => ({ nip: nip(n), bulan, tahun, komponen: { SIGMA_HARI: "22", JUMLAH_MASUK_NYATA: "20", ...komponen } });

const per = (n: number, dari: string, ke: string | null, mulai: string, selesai: string | null): InputKoreksi & { _: 1 } => ({ _: 1, jenis: "periode", nip: nip(n), dariKomponen: dari, keKomponen: ke, tanggalMulai: mulai, tanggalSelesai: selesai, alasan: `alasan ${dari}` });
const ang = (n: number, dari: string, ke: string | null, bulan: number, tahun: number, hari: number): InputKoreksi & { _: 1 } => ({ _: 1, jenis: "angka", nip: nip(n), dariKomponen: dari, keKomponen: ke, bulan, tahun, jumlahHari: hari, alasan: `angka ${dari}` });

type Langkah = { op: "buat"; data: InputKoreksi } | { op: "individual"; nip: string; tahun: number } | { op: "individualCari"; cari: string; tahun: number };
type Kasus = { id: string; keadaan: KeadaanLengkap; langkah: Langkah[] };

const NAMA = ["Budi Santoso", "BUDI HARTONO", "budi_x", "Siti Aminah", "50%diskon", "Ahmad Fauzi", "dewi LESTARI"];
const bulanan = (n: number, tahun: number, bulan: number[], nilai: (b: number) => Record<string, string>) => bulan.map((b) => rek(n, b, tahun, nilai(b)));

const KASUS: Kasus[] = [
  {
    id: "tanda-dan-keterangan",
    keadaan: {
      nominatif: [snap(1, 12, 2025), ...[1, 2, 3, 4, 5, 6, 7, 8].map((b) => snap(1, b, 2026))],
      rekap: [
        ...bulanan(1, 2026, [1, 2, 3, 4, 5, 6, 8], (b) => ({ TK: String(b % 3 === 0 ? 0 : b), TB: b === 4 ? "2" : "0", TD: "1", I: "0", CTH: String(b) })), // bulan 7 tanpa rekap
        rek(1, 12, 2025, { TK: "5" }),
      ],
    },
    langkah: [
      { op: "buat", data: per(1, "TK", "TB", "2026-01-01", "2026-03-31") }, // bulan 3 punya TK 0: tujuan >0? kasus tujuan nol
      { op: "buat", data: per(1, "TD", null, "2026-04-01", "2026-04-30") }, // "dihapus"
      { op: "buat", data: ang(1, "TK", "CTH", 5, 2026, 2) }, // angka bulan 5
      { op: "buat", data: per(1, "TK", "S", "2026-05-01", "2026-06-30") }, // bulan 5 digantikan angka
      { op: "buat", data: per(1, "I", "SD", "2026-06-15", "2026-08-31") }, // sebagian di Juni
      { op: "individual", nip: nip(1), tahun: 2026 }, { op: "individual", nip: nip(1), tahun: 2025 }, { op: "individual", nip: nip(1), tahun: 2027 },
    ],
  },
  {
    id: "snapshot-tahun-sebelumnya-dan-tanpa-rekap",
    keadaan: { nominatif: [snap(2, 3, 2025, "TDK"), snap(3, 1, 2026, "AKL"), snap(4, 12, 2024), snap(4, 1, 2026)], rekap: [rek(2, 3, 2025, { TK: "4" })] },
    langkah: [
      { op: "individual", nip: nip(2), tahun: 2026 }, // hanya snapshot 2025: dipakai untuk 2026 (tanpa rekap)
      { op: "individual", nip: nip(2), tahun: 2025 }, { op: "individual", nip: nip(2), tahun: 2024 }, // sebelum snapshot pertama: null
      { op: "individual", nip: nip(3), tahun: 2026 }, { op: "individual", nip: nip(4), tahun: 2025 }, { op: "individual", nip: "999", tahun: 2026 },
    ],
  },
  {
    id: "koreksi-berantai-dan-bulan-terputus",
    keadaan: {
      nominatif: [snap(5, 1, 2026)],
      rekap: bulanan(5, 2026, [1, 2, 4, 5, 6, 9, 10], (b) => ({ TK: String(10 - b), TB: "0", S: "1" })),
    },
    langkah: [
      { op: "buat", data: per(5, "TK", "TB", "2026-01-01", "2026-02-28") },
      { op: "buat", data: per(5, "TB", "CTH", "2026-01-01", "2026-02-28") },
      { op: "buat", data: per(5, "S", "SD", "2026-04-01", "2026-06-30") },
      { op: "buat", data: per(5, "S", null, "2026-09-01", "2026-10-31") },
      { op: "individual", nip: nip(5), tahun: 2026 },
    ],
  },
  {
    id: "pencarian",
    keadaan: {
      nominatif: [
        ...NAMA.map((n, i) => snap(10 + i, 1, 2026, i % 2 ? "TDK" : "DSN", n)),
        snap(10, 6, 2026, "DSN", "Budi Santoso Baru"), // nama berubah di snapshot lebih baru (id terbesar yang cocok dipakai)
        snap(20, 1, 2026, "AKL", "Budi Akademisi Luar"), // AKL tidak dicari
        snap(21, 1, 2025, "DSN", "Budi Tahun Lalu"),
      ],
    },
    langkah: ["budi", "BUDI", "Bu", "_udi", "b_di", "%", "50%", "x", "zzz", "santoso baru", "198001012005011010", "0010", "an", "LESTARI"].flatMap((cari) => [2026, 2025].map((tahun) => ({ op: "individualCari" as const, cari, tahun }))),
  },
];

const peta = (v: unknown): unknown => (Array.isArray(v) && v.length === 0 ? {} : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v);
function samakan(l: Record<string, unknown> | null): unknown {
  if (!l) return null;
  const bulan = l.bulan as Record<string, Record<string, unknown>>;
  return { ...l, bulan: Object.fromEntries(Object.entries(bulan).map(([b, x]) => [b, x.ada ? { ...x, tanda: peta(x.tanda), nilai: peta(x.nilai) } : x])) };
}

describe.skipIf(!ada)("Paritas Rekap Individual (sintetis) terhadap RekapIndividualService KDS2 asli", () => {
  const prisma = new PrismaClient();
  let oracle: Record<string, { langkah: { hasil: unknown; galat: string | null }[] }>;

  beforeAll(async () => {
    oracle = (await jalankanOracleKoreksi(
      KASUS.map((k) => ({
        id: k.id, keadaan: k.keadaan,
        langkah: k.langkah.map((l) => (l.op === "buat" ? { op: "buat", pengguna: "Admin", data: dataSnake(l.data) } : l)),
      })),
    )) as typeof oracle;
  }, 280_000);
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  for (const k of KASUS) {
    it(k.id, async () => {
      const harapan = oracle[k.id];
      harapan.langkah.forEach((l, i) => expect(l.galat, `oracle galat langkah ${i}: ${l.galat}`).toBeNull());
      await kosongkanDomain(prisma);
      await prisma.auditLog.deleteMany();
      await muatKeadaan(prisma, k.keadaan);
      let berisi = 0;
      let bertanda = 0;
      let adaKeterangan = 0;

      for (const [i, l] of k.langkah.entries()) {
        const o = harapan.langkah[i].hasil;
        if (l.op === "buat") {
          await simpanDanTerapkanKoreksi(prisma, buatDataKoreksi(l.data), "Admin");
        } else if (l.op === "individual") {
          const t = await bangunRekapIndividual(prisma, l.nip, l.tahun);
          expect(JSON.stringify(samakan(t as never)), `langkah ${i} (${l.op})`).toBe(JSON.stringify(samakan(o as Record<string, unknown> | null)));
          if (t) {
            berisi++;
            if (Object.values(t.bulan).some((b) => b.ada && Object.keys(b.tanda).length > 0)) bertanda++;
            if (t.keteranganKoreksi.length > 0) adaKeterangan++;
          }
        } else {
          const t = (await cariPegawaiIndividual(prisma, l.cari, l.tahun)).map((x) => ({ nip: x.nip, nama: x.nama })).sort((a, b) => (a.nip < b.nip ? -1 : 1));
          const dari = (o as { nip: string; nama: string }[]).slice().sort((a, b) => (a.nip < b.nip ? -1 : 1));
          expect(t, `cari "${l.cari}" ${l.tahun}`).toEqual(dari);
        }
      }
      if (k.id === "tanda-dan-keterangan") {
        expect(bertanda).toBeGreaterThan(0);
        expect(adaKeterangan).toBeGreaterThan(0);
      }
      expect(berisi + k.langkah.filter((l) => l.op === "individualCari").length).toBeGreaterThan(0);
    }, 120_000);
  }

  it("pencarian: kasus yang bermakna (ada hasil dan tanpa hasil) ", () => {
    const hasilCari = oracle.pencarian.langkah.map((l) => (l.hasil as unknown[]).length);
    expect(hasilCari.some((n) => n === 0)).toBe(true);
    expect(hasilCari.some((n) => n >= 3)).toBe(true);
  });
});

function dataSnake(d: InputKoreksi) {
  return {
    jenis: d.jenis, nip: d.nip, dari_komponen: d.dariKomponen, ke_komponen: d.keKomponen ?? null, tanggal_mulai: d.tanggalMulai ?? null, tanggal_selesai: d.tanggalSelesai ?? null,
    bulan: d.bulan ?? null, tahun: d.tahun ?? null, jumlah_hari: d.jumlahHari ?? null, alasan: d.alasan, sumber: d.sumber ?? null,
  };
}
