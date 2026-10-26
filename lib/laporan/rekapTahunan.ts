/**
 * Rekap Kehadiran Tahunan: agregat (SUM) setahun dari rekap bulanan, dihitung on-the-fly (tanpa tabel
 * sendiri). Identitas/filter tiap pegawai diambil dari snapshot Nominatif TERAKHIR pegawai itu di tahun
 * tersebut - dipilih lewat MAX(id), bukan bulan terbesar (kebiasaan KDS2 yang dipertahankan demi
 * paritas; id dipertahankan di migrasi F2). Port dari RekapKehadiranReportController::tahunan +
 * RekapKehadiranTahunanExport + view tahunan.blade.php (KDS2).
 * Paritas: tests/paritas/rekap-tahunan.test.ts.
 */
import type { PrismaClient } from "@prisma/client";

import { labelFileKeaktifan, nipNonaktif, urutanKodeStatus } from "./filter";
import { dalamKategoriTk, type FilterTambahanTahunan, KATEGORI_TK } from "./kategoriTk";
import { kueriRencanaKustom } from "./kueri";
import { KOLOM_KOMPONEN } from "./komponen";
import { buatNamaFile } from "./namaFile";
import { keInt } from "./periode";
import {
  type FilterRekap,
  kondisiNominatif,
  komponenTerurut,
  periodeBulanBerjalan,
  urutkanTkTerbanyak,
} from "./rekapBulanan";
import { urutkanMenurutNama } from "./urutNama";

type Db = Pick<
  PrismaClient,
  | "nominatifBulanan"
  | "catatanStatusPegawai"
  | "komponenKehadiran"
  | "statusKepegawaian"
  | "unitInduk"
  | "$transaction"
>;

export type BarisRekapTahunan = {
  id: number;
  nip: string;
  nama: string;
  badge: ["catatan" | "belum", string] | null;
  /** komponen angka -> total setahun (string); komponen tanpa rekap tidak ada */
  total: Record<string, string>;
  /** nilai sel yang ditampilkan per komponen (angka kosong '0', teks kosong '-') */
  sel: Record<string, string>;
};

export type LaporanRekapTahunan = {
  tahun: number;
  jenis: string[];
  status: string[];
  keaktifan: FilterRekap["keaktifan"];
  namaFile: string;
  komponen: { kode: string; nama: string; tipeNilai: string }[];
  baris: BarisRekapTahunan[];
};

/** Tahun bawaan = tahun berjalan (WIB) bila parameter tidak ada; ada tetapi ngawur menjadi 0 seperti (int) PHP. */
export function periodeTahunBerjalan(params: { tahun?: string | string[] | null }, sekarang: Date = new Date()): number {
  return periodeBulanBerjalan({ tahun: params.tahun }, sekarang)[1];
}

/** Sel di halaman: komponen teks tanpa total '-', komponen angka tanpa total '0'. */
export function nilaiTampilTahunan(total: Record<string, string>, kode: string, tipeNilai: string): string {
  return total[kode] ?? (tipeNilai === "teks" ? "-" : "0");
}

/** Sel di ekspor Excel: semua yang kosong '0' (termasuk komponen teks), seperti KDS2. */
export function nilaiEksporTahunan(total: Record<string, string>, kode: string): string {
  return total[kode] ?? "0";
}

/** id snapshot terakhir (MAX(id)) tiap NIP pada tahun itu. */
export async function idSnapshotTerakhir(db: Pick<PrismaClient, "nominatifBulanan">, tahun: number): Promise<number[]> {
  const g = await db.nominatifBulanan.groupBy({ by: ["pegawaiNip"], where: { tahun }, _max: { id: true } });
  return g.map((x) => x._max.id!).sort((a, b) => a - b);
}

/**
 * SUM(CAST(nilai AS SIGNED)) per NIP per komponen angka untuk satu tahun. Awalan angka dipakai
 * (seperti CAST MySQL); nilai yang bukan angka dihitung 0.
 */
export async function totalPerNip(
  db: Pick<PrismaClient, "$transaction">,
  tahun: number,
  nips: string[],
  kodeAngka: string[]
): Promise<Map<string, Record<string, string>>> {
  const hasil = new Map<string, Record<string, string>>();
  if (nips.length === 0 || kodeAngka.length === 0) return hasil;
  const rows = await kueriRencanaKustom<{ nip: string; kode: string; total: string }[]>(
    db,
    `SELECT r."nip" AS nip, d."komponenKode" AS kode,
            SUM(COALESCE(NULLIF(substring(d."nilai" from '^[ ]*[-+]?[0-9]+'), '')::bigint, 0))::text AS total
       FROM "rekap_kehadiran_detail" d
       JOIN "rekap_kehadiran_bulanan" r ON r."id" = d."rekapKehadiranBulananId"
      WHERE r."tahun" = $1 AND d."komponenKode" = ANY($2::text[]) AND r."nip" = ANY($3::text[])
      GROUP BY r."nip", d."komponenKode"`,
    tahun,
    kodeAngka,
    nips
  );
  for (const r of rows) {
    const peta = hasil.get(r.nip) ?? {};
    peta[r.kode] = r.total;
    hasil.set(r.nip, peta);
  }
  return hasil;
}

/** Unit induk dari kode (null bila kosong/tidak dikenal: filter diabaikan, bukan menyembunyikan data). */
async function unitIndukDari(db: Pick<PrismaClient, "unitInduk">, kode: string | null | undefined): Promise<{ kode: string; nama: string } | null> {
  const k = (kode ?? "").trim();
  return k ? db.unitInduk.findUnique({ where: { kode: k }, select: { kode: true, nama: true } }) : null;
}

export async function laporanRekapTahunan(db: Db, tahun: number, filter: FilterRekap, tambahan: FilterTambahanTahunan = {}): Promise<LaporanRekapTahunan> {
  const nonaktif = await nipNonaktif(db, tahun);
  const ids = await idSnapshotTerakhir(db, tahun);
  const unitInduk = await unitIndukDari(db, tambahan.unitIndukKode);

  const diurutId = await db.nominatifBulanan.findMany({
    where: { id: { in: ids }, ...kondisiNominatif(filter, nonaktif), ...(unitInduk ? { unitAsal: { unitIndukKode: unitInduk.kode } } : {}) },
    orderBy: { id: "asc" },
    select: { id: true, pegawaiNip: true, nama: true },
  });
  // Urutan seri sebelum diurut TK: sama dengan Rekap Bulanan - untuk filter "Non-aktif" (nip IN ...) MySQL
  // KDS2 membaca lewat indeks nip (NIP naik); filter lain menurut id naik.
  const snapshot =
    filter.keaktifan === "nonaktif"
      ? [...diurutId].sort((a, b) => (a.pegawaiNip < b.pegawaiNip ? -1 : a.pegawaiNip > b.pegawaiNip ? 1 : a.id - b.id))
      : diurutId;
  const komponen = await komponenTerurut(db);
  const kodeAngka = komponen.filter((k) => k.tipeNilai === "integer").map((k) => k.kode);
  const total = await totalPerNip(db, tahun, snapshot.map((s) => s.pegawaiNip), kodeAngka);
  const tk = (nip: string) => keInt(total.get(nip)?.TK);

  const catatan = new Map((await db.catatanStatusPegawai.findMany({ select: { nip: true, alasan: true } })).map((c) => [c.nip, c.alasan]));
  const nonaktifTampil = new Set(filter.keaktifan === "aktif" ? [] : nonaktif);

  const baris: BarisRekapTahunan[] = urutkanTkTerbanyak(snapshot.filter((s) => dalamKategoriTk(tk(s.pegawaiNip), tambahan.kategori)), (s) => tk(s.pegawaiNip)).map((s) => {
    const t = total.get(s.pegawaiNip) ?? {};
    const alasan = catatan.get(s.pegawaiNip);
    return {
      id: s.id,
      nip: s.pegawaiNip,
      nama: s.nama,
      badge: alasan !== undefined ? ["catatan", alasan] : nonaktifTampil.has(s.pegawaiNip) ? ["belum", "Belum ada keterangan"] : null,
      total: t,
      sel: Object.fromEntries(komponen.map((k) => [k.kode, nilaiTampilTahunan(t, k.kode, k.tipeNilai)])),
    };
  });

  return {
    tahun,
    jenis: filter.jenis,
    status: filter.status,
    keaktifan: filter.keaktifan,
    namaFile: await namaFileRekapTahunan(db, tahun, filter, tambahan),
    komponen: komponen.map((k) => ({ kode: k.kode, nama: k.nama, tipeNilai: k.tipeNilai })),
    baris,
  };
}

export async function namaFileRekapTahunan(db: Pick<PrismaClient, "statusKepegawaian" | "unitInduk">, tahun: number, filter: FilterRekap, tambahan: FilterTambahanTahunan = {}): Promise<string> {
  const unit = await unitIndukDari(db, tambahan.unitIndukKode);
  const kategori = tambahan.kategori && tambahan.kategori !== "semua" ? KATEGORI_TK[tambahan.kategori].nama : null;
  return buatNamaFile("Absensi Tahunan", filter.jenis, filter.status, `${tahun}${kategori ? ` ${kategori}` : ""}${unit ? ` - ${unit.nama}` : ""}`, await urutanKodeStatus(db), labelFileKeaktifan(filter.keaktifan));
}

/** Ekspor Excel: urut nama (bukan TK); filter jenis/unit tambahan lewat parameter URL. */
export async function eksporRekapTahunan(
  db: Db,
  tahun: number,
  filter: FilterRekap,
  ekstra: { jenisPegawaiKode?: string | null; unitAsalKode?: string | null } = {},
  tambahan: FilterTambahanTahunan = {}
): Promise<{ headings: string[]; rows: (string | null)[][] }> {
  const nonaktif = await nipNonaktif(db, tahun);
  const ids = await idSnapshotTerakhir(db, tahun);
  const unitInduk = await unitIndukDari(db, tambahan.unitIndukKode);
  const semuaSnapshot = await db.nominatifBulanan.findMany({
    where: {
      id: { in: ids },
      ...kondisiNominatif(filter, nonaktif),
      ...(unitInduk ? { unitAsal: { unitIndukKode: unitInduk.kode } } : {}),
      ...(ekstra.jenisPegawaiKode ? { jenisPegawaiKode: ekstra.jenisPegawaiKode } : {}),
      ...(ekstra.unitAsalKode ? { unitAsalKode: ekstra.unitAsalKode } : {}),
    },
    include: { jenisPegawai: { select: { nama: true } }, unitAsal: { select: { nama: true } } },
  });
  const komponen = await komponenTerurut(db);
  const kodeAngka = komponen.filter((k) => k.tipeNilai === "integer").map((k) => k.kode);
  const total = await totalPerNip(db, tahun, semuaSnapshot.map((s) => s.pegawaiNip), kodeAngka);
  const snapshot = semuaSnapshot.filter((s) => dalamKategoriTk(keInt(total.get(s.pegawaiNip)?.TK), tambahan.kategori));
  const nama = new Map(komponen.map((k) => [k.kode, k.nama]));

  return {
    headings: ["NIP", "Nama", "Jenis Pegawai", "Unit Kerja", ...KOLOM_KOMPONEN.map((k) => nama.get(k) ?? k)],
    rows: urutkanMenurutNama(snapshot).map((s) => [
      s.pegawaiNip,
      s.nama,
      s.jenisPegawai?.nama ?? null,
      s.unitAsal?.nama ?? null,
      ...KOLOM_KOMPONEN.map((k) => nilaiEksporTahunan(total.get(s.pegawaiNip) ?? {}, k)),
    ]),
  };
}
