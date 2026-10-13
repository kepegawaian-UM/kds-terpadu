/**
 * Laporan "Pegawai Belum Ada Rekap": selisih antara snapshot Nominatif (Dosen + Tendik; Akademisi
 * Luar tidak masuk Rekap) dan rekap bulanan yang sudah diunggah, dihitung on-the-fly. Dipisah:
 *  - belum mulai kerja (TMT lebih akhir dari bulan laporan) = wajar;
 *  - sudah tidak aktif (ada catatan status) = wajar;
 *  - sisanya = perlu ditindaklanjuti.
 * Port dari RekapKehadiranBelumUploadController (KDS2); paritas di tests/paritas/belum-upload.test.ts.
 */
import type { PrismaClient } from "@prisma/client";

import { formatTanggal } from "./format";
import { urutkanNamaPhp } from "./urutPhp";

export type BarisBelum = {
  nip: string;
  nama: string;
  jenis: string;
  unit: string;
  /** dd-mm-yyyy */
  tmt: string;
  belumTmt: boolean;
  keterangan: string | null;
};

export type LaporanBelumUpload = {
  bulan: number;
  tahun: number;
  totalNominatif: number;
  totalSudahRekap: number;
  /** urutan controller KDS2: nama (urut byte), seri = urutan id */
  belum: BarisBelum[];
  jumlahBelumTmt: number;
  jumlahSudahTidakAktif: number;
  jumlahPerluTindakLanjut: number;
  /** unit -> jumlah yang perlu ditindaklanjuti, jumlah menurun; seri = urutan kemunculan */
  ringkasanPerUnit: [string, number][];
};

/** TMT lebih akhir dari bulan laporan (bulan TMT sendiri dianggap sudah mulai). */
export function belumMulaiKerja(tmt: Date, bulan: number, tahun: number): boolean {
  const y = tmt.getUTCFullYear();
  return y > tahun || (y === tahun && tmt.getUTCMonth() + 1 > bulan);
}

const perluTindakLanjut = (b: BarisBelum) => !b.belumTmt && b.keterangan === null;

export function ringkasPerUnit(belum: BarisBelum[]): [string, number][] {
  const hitung = new Map<string, number>();
  for (const b of belum.filter(perluTindakLanjut)) hitung.set(b.unit, (hitung.get(b.unit) ?? 0) + 1);
  // sort stabil: jumlah menurun, seri mempertahankan urutan kemunculan (arsort PHP 8)
  return [...hitung.entries()].sort((x, y) => y[1] - x[1]);
}

export async function laporanBelumUpload(
  db: Pick<PrismaClient, "nominatifBulanan" | "rekapKehadiranBulanan" | "catatanStatusPegawai">,
  bulan: number,
  tahun: number
): Promise<LaporanBelumUpload> {
  const semua = await db.nominatifBulanan.findMany({
    where: { bulan, tahun, jenisPegawaiKode: { in: ["DSN", "TDK"] } },
    orderBy: { id: "asc" },
    select: {
      pegawaiNip: true,
      nama: true,
      jenisPegawaiKode: true,
      tanggalMulaiKerja: true,
      jenisPegawai: { select: { nama: true } },
      unitAsal: { select: { nama: true } },
    },
  });
  const adaRekap = new Set(
    (await db.rekapKehadiranBulanan.findMany({ where: { bulan, tahun }, select: { nip: true } })).map((r) => r.nip)
  );
  const catatan = new Map(
    (await db.catatanStatusPegawai.findMany({ select: { nip: true, alasan: true } })).map((c) => [c.nip, c.alasan])
  );

  const belumTanpaUrut: (BarisBelum & { nama: string })[] = semua
    .filter((n) => !adaRekap.has(n.pegawaiNip))
    .map((n) => ({
      nip: n.pegawaiNip,
      nama: n.nama,
      jenis: n.jenisPegawai?.nama ?? n.jenisPegawaiKode,
      unit: n.unitAsal?.nama ?? "-",
      tmt: formatTanggal(n.tanggalMulaiKerja)!,
      belumTmt: belumMulaiKerja(n.tanggalMulaiKerja, bulan, tahun),
      keterangan: catatan.get(n.pegawaiNip) ?? null,
    }));
  const belum = urutkanNamaPhp(belumTanpaUrut);

  return {
    bulan,
    tahun,
    totalNominatif: semua.length,
    totalSudahRekap: semua.length - belum.length,
    belum,
    jumlahBelumTmt: belum.filter((b) => b.belumTmt).length,
    jumlahSudahTidakAktif: belum.filter((b) => !b.belumTmt && b.keterangan !== null).length,
    jumlahPerluTindakLanjut: belum.filter(perluTindakLanjut).length,
    ringkasanPerUnit: ringkasPerUnit(belum),
  };
}

/**
 * Urutan awal yang dilihat pengguna di KDS2: DataTables mengurutkan kolom Unit Kerja naik
 * (huruf kecil, perbandingan kode UTF-16), seri mempertahankan urutan asal (nama).
 */
export function urutkanUntukTampilan(belum: BarisBelum[]): BarisBelum[] {
  return belum
    .map((b, i) => ({ b, i, k: b.unit.toLowerCase() }))
    .sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : x.i - y.i))
    .map((x) => x.b);
}
