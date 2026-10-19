/**
 * Rekap Kehadiran Bulanan: basis barisnya adalah snapshot Nominatif bulan itu (siapa yang aktif
 * bulan itu, dengan jenis/status bulan itu), bukan tabel pegawai. Port dari
 * RekapKehadiranReportController::bulanan + RekapKehadiranBulananExport + view bulanan.blade.php (KDS2).
 * Paritas: tests/paritas/rekap-bulanan.test.ts.
 */
import type { PrismaClient } from "@prisma/client";

import { cakupanKoreksi } from "@/lib/domain/koreksi";

import { type Keaktifan, labelFileKeaktifan, nipNonaktif, urutanKodeStatus } from "./filter";
import { KOLOM_KOMPONEN } from "./komponen";
import { buatNamaFile } from "./namaFile";
import { bulanTahunSekarang, keInt, namaBulan, type Param } from "./periode";
import { urutkanMenurutNama } from "./urutNama";

type Db = Pick<
  PrismaClient,
  | "nominatifBulanan"
  | "rekapKehadiranBulanan"
  | "catatanStatusPegawai"
  | "koreksiRekap"
  | "komponenKehadiran"
  | "statusKepegawaian"
>;

export type FilterRekap = { jenis: string[]; status: string[]; keaktifan: Keaktifan };

export type KoreksiBerlaku = { id: number; dari: string; ke: string | null; alasan: string };

export type BarisRekapBulanan = {
  id: number;
  nip: string;
  nama: string;
  /** komponen -> nilai (string); null = belum ada rekap bulan itu */
  nilai: Record<string, string> | null;
  /** lencana di samping nama: catatan status, atau "Belum ada keterangan" untuk non-aktif tanpa catatan */
  badge: ["catatan" | "belum", string] | null;
  /** komponen -> keterangan koreksi (sel berwarna kuning) */
  tandai: Record<string, string>;
};

export type LaporanRekapBulanan = {
  bulan: number;
  tahun: number;
  jenis: string[];
  status: string[];
  keaktifan: Keaktifan;
  namaFile: string;
  komponen: { kode: string; nama: string }[];
  baris: BarisRekapBulanan[];
};

/**
 * Bulan/tahun bawaan Rekap Bulanan: BULAN BERJALAN (WIB) bila parameter tidak ada - berbeda dari
 * Nominatif yang memakai snapshot terbaru. Parameter yang ada tetapi kosong/ngawur menjadi 0 seperti
 * `(int)` PHP.
 */
export function periodeBulanBerjalan(params: { bulan?: Param; tahun?: Param }, sekarang: Date = new Date()): [number, number] {
  const [bulanIni, tahunIni] = bulanTahunSekarang(sekarang);
  const ada = (v: Param) => v !== undefined && v !== null;
  return [ada(params.bulan) ? keInt(params.bulan) : bulanIni, ada(params.tahun) ? keInt(params.tahun) : tahunIni];
}

/** sortByDesc stabil menurut TK: yang sama mempertahankan urutan asal (PHP 8). */
export function urutkanTkTerbanyak<T>(daftar: readonly T[], tk: (x: T) => number): T[] {
  return daftar
    .map((x, i) => ({ x, i, v: tk(x) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((a) => a.x);
}

/**
 * Sel berwarna: komponen yang terdampak koreksi dan masih bernilai (> 0) di rekap bulan itu.
 * Sel asal ditandai bila dihapus (ke = null) atau masih > 0; sel tujuan bila > 0.
 * Koreksi yang datang belakangan menimpa keterangan komponen yang sama.
 */
export function hitungTandai(koreksi: KoreksiBerlaku[], nilai: Record<string, string> | null): Record<string, string> {
  const tandai: Record<string, string> = {};
  for (const k of koreksi) {
    const info = `Dikoreksi: ${k.alasan} (${k.dari} → ${k.ke ?? "dihapus"})`;
    if (k.ke === null || keInt(nilai?.[k.dari]) > 0) tandai[k.dari] = info;
    if (k.ke !== null && keInt(nilai?.[k.ke]) > 0) tandai[k.ke] = info;
    if (k.ke === "JUMLAH_MASUK_NYATA" && keInt(nilai?.TOTAL) > 0) tandai.TOTAL = info; // tujuan "Masuk": TOTAL ikut berubah
  }
  return tandai;
}

/**
 * Koreksi aktif yang berlaku pada satu bulan: jenis "angka" untuk bulan itu, dan jenis "periode"
 * yang menutup SELURUH bulan itu - kecuali pegawai itu punya koreksi angka di bulan yang sama
 * (angka mengalahkan periode). Dikelompokkan per NIP, urutan id.
 */
export async function koreksiBerlaku(db: Pick<PrismaClient, "koreksiRekap">, bulan: number, tahun: number) {
  const semua = await db.koreksiRekap.findMany({
    where: { dibatalkanPada: null, OR: [{ jenis: "periode" }, { jenis: "angka", bulan, tahun }] },
    orderBy: { id: "asc" },
  });
  const nipAngka = new Set(semua.filter((k) => k.jenis === "angka").map((k) => k.nip));
  const hasil: Record<string, KoreksiBerlaku[]> = {};
  for (const k of semua) {
    if (k.jenis === "periode" && (nipAngka.has(k.nip) || cakupanKoreksi(k, bulan, tahun) !== "penuh")) continue;
    (hasil[k.nip] ??= []).push({ id: k.id, dari: k.dariKomponen, ke: k.keKomponen, alasan: k.alasan });
  }
  return hasil;
}

export async function komponenTerurut(db: Pick<PrismaClient, "komponenKehadiran">) {
  const master = await db.komponenKehadiran.findMany({ where: { kode: { in: [...KOLOM_KOMPONEN] } } });
  const peta = new Map(master.map((k) => [k.kode, k]));
  return KOLOM_KOMPONEN.map((kode) => peta.get(kode)).filter((k) => k !== undefined);
}

/** Filter Keaktifan + Jenis/Status pada query snapshot nominatif (nonaktif = hasil nipNonaktif). */
export function kondisiNominatif(f: FilterRekap, nonaktif: string[]) {
  return {
    // Akademisi Luar tidak masuk Absensi: "Semua" jenis berarti Dosen + Tendik (BEDA dari KDS2, yang ikut menampilkan Akademisi Luar bila filter jenis kosong; keputusan pengguna 16 Okt 2026)
    jenisPegawaiKode: { in: f.jenis.length ? f.jenis : ["DSN", "TDK"] },
    ...(f.status.length ? { statusKepegawaianKode: { in: f.status } } : {}),
    ...(f.keaktifan === "aktif" ? { pegawaiNip: { notIn: nonaktif } } : f.keaktifan === "nonaktif" ? { pegawaiNip: { in: nonaktif } } : {}),
  };
}

async function nilaiPerNip(db: Pick<PrismaClient, "rekapKehadiranBulanan">, bulan: number, tahun: number, nips: string[]) {
  const rekap = await db.rekapKehadiranBulanan.findMany({
    where: { bulan, tahun, nip: { in: nips } },
    include: { detail: { orderBy: { id: "asc" } } },
  });
  return new Map(rekap.map((r) => [r.nip, Object.fromEntries(r.detail.map((d) => [d.komponenKode, d.nilai]))]));
}

/** Nama file unduhan mengikuti tab + filter aktif (sama dengan KDS2). */
export async function namaFileRekapBulanan(
  db: Pick<PrismaClient, "statusKepegawaian">,
  bulan: number,
  tahun: number,
  filter: FilterRekap
): Promise<string> {
  return buatNamaFile(
    "Absensi Bulanan",
    filter.jenis,
    filter.status,
    `${namaBulan(bulan)} ${tahun}`,
    await urutanKodeStatus(db),
    labelFileKeaktifan(filter.keaktifan)
  );
}

export async function laporanRekapBulanan(db: Db, bulan: number, tahun: number, filter: FilterRekap): Promise<LaporanRekapBulanan> {
  const nonaktif = await nipNonaktif(db, tahun);

  const diurutId = await db.nominatifBulanan.findMany({
    where: { bulan, tahun, ...kondisiNominatif(filter, nonaktif) },
    orderBy: { id: "asc" },
    select: { id: true, pegawaiNip: true, nama: true },
  });
  // Urutan awal sebelum diurut TK. KDS2 tidak memakai ORDER BY: untuk filter "Non-aktif" (nip IN ...)
  // MySQL membaca lewat indeks unik nip, jadi baris seri tampil menurut NIP naik; untuk filter lain
  // (NOT IN / tanpa filter) menurut id naik. Terbukti dari oracle (tests/paritas/rekap-bulanan.test.ts).
  const snapshot =
    filter.keaktifan === "nonaktif"
      ? [...diurutId].sort((a, b) => (a.pegawaiNip < b.pegawaiNip ? -1 : a.pegawaiNip > b.pegawaiNip ? 1 : a.id - b.id))
      : diurutId;
  const nilai = await nilaiPerNip(db, bulan, tahun, snapshot.map((s) => s.pegawaiNip));
  const tk = (nip: string) => keInt(nilai.get(nip)?.TK);

  const catatan = new Map((await db.catatanStatusPegawai.findMany({ select: { nip: true, alasan: true } })).map((c) => [c.nip, c.alasan]));
  const koreksi = await koreksiBerlaku(db, bulan, tahun);
  const nonaktifTampil = new Set(filter.keaktifan === "aktif" ? [] : nonaktif);
  const komponen = await komponenTerurut(db);

  const baris: BarisRekapBulanan[] = urutkanTkTerbanyak(snapshot, (s) => tk(s.pegawaiNip)).map((s) => {
    const n = nilai.get(s.pegawaiNip) ?? null;
    const alasan = catatan.get(s.pegawaiNip);
    return {
      id: s.id,
      nip: s.pegawaiNip,
      nama: s.nama,
      nilai: n,
      badge: alasan !== undefined ? ["catatan", alasan] : nonaktifTampil.has(s.pegawaiNip) ? ["belum", "Belum ada keterangan"] : null,
      tandai: hitungTandai(koreksi[s.pegawaiNip] ?? [], n),
    };
  });

  return {
    bulan,
    tahun,
    jenis: filter.jenis,
    status: filter.status,
    keaktifan: filter.keaktifan,
    namaFile: await namaFileRekapBulanan(db, bulan, tahun, filter),
    komponen: komponen.map((k) => ({ kode: k.kode, nama: k.nama })),
    baris,
  };
}

/** Ekspor Excel: urut nama (bukan TK), nilai kosong untuk yang belum ada rekap; filter jenis/unit lewat URL. */
export async function eksporRekapBulanan(
  db: Db,
  bulan: number,
  tahun: number,
  filter: FilterRekap,
  ekstra: { jenisPegawaiKode?: string | null; unitAsalKode?: string | null } = {}
): Promise<{ headings: string[]; rows: (string | null)[][] }> {
  const nonaktif = await nipNonaktif(db, tahun);
  const snapshot = await db.nominatifBulanan.findMany({
    where: {
      bulan,
      tahun,
      ...kondisiNominatif(filter, nonaktif),
      ...(ekstra.jenisPegawaiKode ? { jenisPegawaiKode: ekstra.jenisPegawaiKode } : {}),
      ...(ekstra.unitAsalKode ? { unitAsalKode: ekstra.unitAsalKode } : {}),
    },
    include: { jenisPegawai: { select: { nama: true } }, unitAsal: { select: { nama: true } } },
  });
  const nilai = await nilaiPerNip(db, bulan, tahun, snapshot.map((s) => s.pegawaiNip));
  const komponen = await komponenTerurut(db);
  const nama = new Map(komponen.map((k) => [k.kode, k.nama]));

  return {
    headings: ["NIP", "Nama", "Jenis Pegawai", "Unit Kerja", ...KOLOM_KOMPONEN.map((k) => nama.get(k) ?? k)],
    rows: urutkanMenurutNama(snapshot).map((s) => [
      s.pegawaiNip,
      s.nama,
      s.jenisPegawai?.nama ?? null,
      s.unitAsal?.nama ?? null,
      ...KOLOM_KOMPONEN.map((k) => nilai.get(s.pegawaiNip)?.[k] ?? ""),
    ]),
  };
}
