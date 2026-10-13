/**
 * Statistik Dosen dan Tendik, dihitung on-the-fly dari snapshot Nominatif sebulan. Port dari
 * StatistikDosenController / StatistikTendikController (KDS2); paritas di tests/paritas/statistik.test.ts.
 *
 * Kebiasaan KDS2 yang dipertahankan:
 *  - unit `UA-179` ("Unit Kerja Belum Diketahui", placeholder KDS1) dikecualikan;
 *  - Statistik Dosen memakai INNER JOIN ke jabatan fungsional: dosen TANPA jabatan fungsional tidak
 *    ikut dihitung sama sekali (tidak juga di "Jumlah");
 *  - pendidikan dicocokkan persis (setelah trim ala PHP, huruf besar/kecil dibedakan); yang tidak ada di
 *    daftar tetap dan bukan kosong hanya ikut "Jumlah";
 *  - kelompok (fakultas/unit) diurut `sortKeys()` PHP = urut byte (urutPhp).
 */
import type { PrismaClient } from "@prisma/client";

import { bandingkanPhp } from "./urutPhp";

const UNIT_PLACEHOLDER = "UA-179";

export const STATUS_TENDIK = ["PNS", "CPNS", "PPPK", "PTNA", "CPTNA", "PTT"] as const;
export const GOLONGAN_TENDIK = [
  "IV/e", "IV/d", "IV/c", "IV/b", "IV/a",
  "III/d", "III/c", "III/b", "III/a",
  "II/d", "II/c", "II/b", "II/a",
  "I/d", "I/c", "I/b", "I/a",
] as const;
export const PENDIDIKAN_TENDIK = ["S3", "S2", "Profesi", "S1", "D4", "D3", "D1", "SLTA", "SLTP", "SD"] as const;
export const PENDIDIKAN_DOSEN = ["S3", "S2", "Sp1", "S1", "D4", "D3", "D1", "SLTA", "SLTP", "SD"] as const;

const RANK_PNS: Record<string, number> = Object.fromEntries(GOLONGAN_TENDIK.map((g, i) => [g, i]));
const RANK_PPPK: Record<string, number> = Object.fromEntries(
  ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII"].map((g, i) => [g, i])
);

/** Satu baris statistik: kolom unit (teks) dan hitungan (angka). */
export type BarisStatistik = { unit: string } & Record<string, string | number>;

/** trim() PHP: hanya spasi, tab, baris baru, NUL, dan tab vertikal. */
const phpTrim = (s: string | null | undefined) => (s ?? "").replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");

/** groupBy + sortKeys() PHP: kelompok diurut menurut kunci dengan urut PHP. */
function kelompokTerurut<T>(daftar: readonly T[], kunci: (x: T) => string): [string, T[]][] {
  const peta = new Map<string, T[]>();
  for (const x of daftar) {
    const k = kunci(x);
    (peta.get(k) ?? peta.set(k, []).get(k)!).push(x);
  }
  return [...peta.entries()].sort((a, b) => bandingkanPhp(a[0], b[0]));
}

// ---- Tendik ---------------------------------------------------------------------------------

export type RowTendik = {
  unitIndukNama: string;
  jenisKelamin: string;
  statusKode: string;
  golonganKode: string | null;
  pendidikan: string | null;
};

function barisTendik(unit: string, items: RowTendik[]): BarisStatistik {
  const baris: BarisStatistik = { unit, jumlah: items.length };
  for (const s of STATUS_TENDIK) {
    baris[`status_${s}_L`] = items.filter((i) => i.statusKode === s && i.jenisKelamin === "L").length;
    baris[`status_${s}_P`] = items.filter((i) => i.statusKode === s && i.jenisKelamin === "P").length;
  }
  for (const g of GOLONGAN_TENDIK) baris[`gol_${g}`] = items.filter((i) => i.golonganKode === g).length;
  baris.gol_none = items.filter((i) => i.golonganKode === null).length;
  for (const p of PENDIDIKAN_TENDIK) baris[`pend_${p}`] = items.filter((i) => phpTrim(i.pendidikan) === p).length;
  baris.pend_none = items.filter((i) => phpTrim(i.pendidikan) === "").length;
  return baris;
}

export function hitungStatistikTendik(rows: RowTendik[]): { statistik: BarisStatistik[]; total: BarisStatistik } {
  const statistik = kelompokTerurut(rows, (r) => r.unitIndukNama).map(([unit, items]) => barisTendik(unit, items));
  const total: BarisStatistik = { unit: "TOTAL" };
  // KDS2: kolom total diambil dari baris pertama; tanpa baris, total hanya berisi unit.
  for (const kolom of Object.keys(statistik[0] ?? {})) {
    if (kolom !== "unit") total[kolom] = statistik.reduce((n, b) => n + Number(b[kolom]), 0);
  }
  return { statistik, total };
}

export async function statistikTendik(db: Pick<PrismaClient, "nominatifBulanan">, bulan: number, tahun: number) {
  const rows = await db.nominatifBulanan.findMany({
    where: { jenisPegawaiKode: "TDK", unitAsalKode: { not: UNIT_PLACEHOLDER }, bulan, tahun },
    orderBy: { id: "asc" },
    select: {
      jenisKelamin: true,
      statusKepegawaianKode: true,
      golonganKode: true,
      pendidikanTerakhir: true,
      unitAsal: { select: { unitInduk: { select: { nama: true } } } },
    },
  });
  return {
    bulan,
    tahun,
    ...hitungStatistikTendik(
      rows.map((r) => ({
        unitIndukNama: r.unitAsal.unitInduk.nama,
        jenisKelamin: r.jenisKelamin,
        statusKode: r.statusKepegawaianKode,
        golonganKode: r.golonganKode,
        pendidikan: r.pendidikanTerakhir,
      }))
    ),
  };
}

// ---- Dosen ----------------------------------------------------------------------------------

export type RowDosen = {
  unitIndukNama: string;
  unitAsalNama: string;
  jabatanNama: string;
  urutanJenjang: number;
  jenisKelamin: string;
  golonganKode: string | null;
  pendidikan: string | null;
};

export type KolomJabatanGolongan = { jabatan: string; golongan: string | null };

/**
 * Kolom (jabatan, golongan) yang ditampilkan: jabatan dari jenjang tertinggi; di tiap jabatan hanya golongan
 * yang benar-benar dipakai (PNS tertinggi dulu, lalu skala PPPK, lalu tak dikenal menurut kemunculan), dan satu
 * kolom "-" bila ada dosen di jenjang itu tanpa golongan.
 */
export function susunKolomJabatanGolongan(rows: RowDosen[]): KolomJabatanGolongan[] {
  const perJabatan = new Map<string, RowDosen[]>(); // urutan kemunculan pertama
  for (const r of rows) (perJabatan.get(r.jabatanNama) ?? perJabatan.set(r.jabatanNama, []).get(r.jabatanNama)!).push(r);

  const urut = [...perJabatan.entries()]
    .map(([nama, items], i) => ({ nama, items, i }))
    .sort((a, b) => b.items[0].urutanJenjang - a.items[0].urutanJenjang || a.i - b.i); // sortByDesc stabil

  const kolom: KolomJabatanGolongan[] = [];
  for (const { nama, items } of urut) {
    const dipakai = [...new Set(items.map((i) => i.golonganKode).filter((g): g is string => !!g && g !== "0"))]
      .map((g, i) => ({ g, i }))
      .sort((a, b) => peringkat(a.g) - peringkat(b.g) || a.i - b.i)
      .map((x) => x.g);
    for (const g of dipakai) kolom.push({ jabatan: nama, golongan: g });
    if (items.some((i) => i.golonganKode === null)) kolom.push({ jabatan: nama, golongan: null });
  }
  return kolom;
}

const peringkat = (kode: string) => RANK_PNS[kode] ?? 100 + (RANK_PPPK[kode] ?? 99);

function barisDosen(unit: string, items: RowDosen[], kolom: KolomJabatanGolongan[]): BarisStatistik {
  const baris: BarisStatistik = { unit, jumlah: items.length };
  kolom.forEach((k, i) => {
    const cocok = items.filter(
      (it) => it.jabatanNama === k.jabatan && (k.golongan === null ? it.golonganKode === null : it.golonganKode === k.golongan)
    );
    baris[`kol_${i}_L`] = cocok.filter((c) => c.jenisKelamin === "L").length;
    baris[`kol_${i}_P`] = cocok.filter((c) => c.jenisKelamin === "P").length;
  });
  for (const p of PENDIDIKAN_DOSEN) baris[`pend_${p}`] = items.filter((it) => phpTrim(it.pendidikan) === p).length;
  baris.pend_none = items.filter((it) => phpTrim(it.pendidikan) === "").length;
  return baris;
}

export function hitungStatistikDosen(rows: RowDosen[]) {
  const kolom = susunKolomJabatanGolongan(rows);
  const laporan = kelompokTerurut(rows, (r) => r.unitIndukNama).map(([fakultas, items]) => ({
    subtotal: barisDosen(fakultas, items, kolom),
    jurusan: kelompokTerurut(items, (r) => r.unitAsalNama).map(([unit, it]) => barisDosen(unit, it, kolom)),
  }));
  // groupBy('jabatan') pada kolom: nama jabatan -> jumlah kolom, urutan kemunculan
  const jabatanGroups: Record<string, number> = {};
  for (const k of kolom) jabatanGroups[k.jabatan] = (jabatanGroups[k.jabatan] ?? 0) + 1;
  return { laporan, total: barisDosen("TOTAL", rows, kolom), kolom, jabatanGroups };
}

export async function statistikDosen(db: Pick<PrismaClient, "nominatifBulanan">, bulan: number, tahun: number) {
  const rows = await db.nominatifBulanan.findMany({
    where: {
      jenisPegawaiKode: "DSN",
      unitAsalKode: { not: UNIT_PLACEHOLDER },
      jabatanFungsionalDosenKode: { not: null }, // INNER JOIN ke mst_jabatan_fungsional_dosen
      bulan,
      tahun,
    },
    orderBy: { id: "asc" },
    select: {
      jenisKelamin: true,
      golonganKode: true,
      pendidikanTerakhir: true,
      unitAsal: { select: { nama: true, unitInduk: { select: { nama: true } } } },
      jabatanFungsionalDosen: { select: { nama: true, urutanJenjang: true } },
    },
  });
  return {
    bulan,
    tahun,
    ...hitungStatistikDosen(
      rows.map((r) => ({
        unitIndukNama: r.unitAsal.unitInduk.nama,
        unitAsalNama: r.unitAsal.nama,
        jabatanNama: r.jabatanFungsionalDosen!.nama,
        urutanJenjang: r.jabatanFungsionalDosen!.urutanJenjang,
        jenisKelamin: r.jenisKelamin,
        golonganKode: r.golonganKode,
        pendidikan: r.pendidikanTerakhir,
      }))
    ),
  };
}
