/**
 * Layanan baca Nominatif: daftar per bulan, detail snapshot, dan ekspor Excel.
 * Paritas dengan NominatifBulananController / NominatifExport (KDS2) dibuktikan di
 * tests/paritas/nominatif.test.ts.
 */
import type { PrismaClient } from "@prisma/client";

import { type DasarRemunerasi, dasarRemunerasi } from "@/lib/domain/dasarRemunerasi";

import { formatTanggal } from "./format";
import { buatNamaFile } from "./namaFile";
import { namaBulan } from "./periode";
import { urutkanMenurutNama } from "./urutNama";

export type BarisNominatif = {
  id: number;
  nip: string;
  nama: string;
  jenis: string | null;
  unit: string | null;
};

export function namaFileNominatif(bulan: number, tahun: number): string {
  return buatNamaFile("Detail Pegawai", [], [], `${namaBulan(bulan)} ${tahun}`, []);
}

/** Tahun yang punya snapshot nominatif (menurun), untuk pilihan periode. */
export async function tahunNominatif(db: Pick<PrismaClient, "nominatifBulanan">): Promise<number[]> {
  const rows = await db.nominatifBulanan.findMany({ distinct: ["tahun"], select: { tahun: true } });
  return rows.map((r) => r.tahun).sort((a, b) => b - a);
}

/** Seluruh snapshot sebulan, diurutkan nama seperti KDS2 (`orderBy('nama')` MySQL). */
export async function daftarNominatif(
  db: Pick<PrismaClient, "nominatifBulanan">,
  bulan: number,
  tahun: number
): Promise<BarisNominatif[]> {
  const rows = await db.nominatifBulanan.findMany({
    where: { bulan, tahun },
    select: { id: true, pegawaiNip: true, nama: true, jenisPegawai: { select: { nama: true } }, unitAsal: { select: { nama: true } } },
  });
  return urutkanMenurutNama(rows).map((r) => ({
    id: r.id,
    nip: r.pegawaiNip,
    nama: r.nama,
    jenis: r.jenisPegawai?.nama ?? null,
    unit: r.unitAsal?.nama ?? null,
  }));
}

export type DetailNominatif = {
  id: number;
  nip: string;
  nama: string;
  bulan: number;
  tahun: number;
  periodeLabel: string;
  jenisKelamin: string;
  tanggalLahir: string;
  pendidikan: string;
  tmt: string | null;
  unit: string | null;
  unitInduk: string | null;
  jenisPegawai: string | null;
  status: string;
  golongan: string;
  /** Baris jabatan sesuai jenis pegawai (Dosen / Tendik / Akademisi Luar). */
  jabatan: [string, string][];
  dasarRemunerasi: DasarRemunerasi;
  jabatanTambahan: { role: string | null; tempat: string; status: string }[];
};

export async function detailNominatif(
  db: Pick<PrismaClient, "nominatifBulanan">,
  id: number
): Promise<DetailNominatif | null> {
  const n = await db.nominatifBulanan.findUnique({
    where: { id },
    include: {
      jenisPegawai: true,
      statusKepegawaian: true,
      golongan: true,
      jabatanFungsionalDosen: true,
      jabatanFungsionalTendik: true,
      jabatanFungsiUmum: true,
      kategoriAkademisiLuar: true,
      unitAsal: { include: { unitInduk: true } },
      jabatanTambahan: {
        orderBy: { id: "asc" },
        include: { jabatanTambahanRole: true, unitAsal: true, programStudi: true },
      },
    },
  });
  if (!n) return null;

  const tendik = n.jabatanFungsionalTendik;
  const jabatan: [string, string][] =
    n.jenisPegawaiKode === "DSN"
      ? [["Jabatan Fungsional Dosen", n.jabatanFungsionalDosen?.nama ?? "-"]]
      : n.jenisPegawaiKode === "TDK"
        ? [
            ["Jabatan Fungsional Tendik", tendik ? `${tendik.jabatanPokok} (${tendik.jenjang})` : "-"],
            ["Jabatan Fungsi Umum Pelaksana", n.jabatanFungsiUmum?.nama ?? "-"],
          ]
        : n.jenisPegawaiKode === "AKL"
          ? [["Kategori Akademisi Luar", n.kategoriAkademisiLuar?.nama ?? "-"]]
          : [];

  return {
    id: n.id,
    nip: n.pegawaiNip,
    nama: n.nama,
    bulan: n.bulan,
    tahun: n.tahun,
    periodeLabel: `${namaBulan(n.bulan)} ${n.tahun}`,
    jenisKelamin: n.jenisKelamin === "L" ? "Laki-laki" : "Perempuan",
    tanggalLahir: formatTanggal(n.tanggalLahir) ?? "-",
    pendidikan: n.pendidikanTerakhir ?? "-",
    tmt: formatTanggal(n.tanggalMulaiKerja),
    unit: n.unitAsal?.nama ?? null,
    unitInduk: n.unitAsal?.unitInduk?.nama ?? null,
    jenisPegawai: n.jenisPegawai?.nama ?? null,
    status: `${n.statusKepegawaian?.nama ?? ""} (${n.statusKepegawaian?.kategori ?? ""})`,
    golongan: n.golongan?.kode ?? "-",
    jabatan,
    dasarRemunerasi: dasarRemunerasi({
      ...n,
      jabatanTambahan: n.jabatanTambahan.map((jt) => ({ id: jt.id, role: jt.jabatanTambahanRole })),
    }),
    jabatanTambahan: n.jabatanTambahan.map((jt) => ({
      role: jt.jabatanTambahanRole?.namaRole ?? null,
      tempat: jt.programStudi?.nama ?? jt.unitAsal?.nama ?? "-",
      status: jt.statusPengangkatan,
    })),
  };
}

export const JUDUL_EKSPOR_NOMINATIF = [
  "NIP",
  "Nama",
  "Jenis Kelamin",
  "Tanggal Lahir",
  "Jenis Pegawai",
  "Status Kepegawaian",
  "Golongan",
  "Unit Kerja",
  "Tanggal Mulai Kerja",
];

/** Ekspor Excel Nominatif sebulan (filter jenis/unit opsional lewat parameter URL, seperti KDS2). */
export async function eksporNominatif(
  db: Pick<PrismaClient, "nominatifBulanan">,
  bulan: number,
  tahun: number,
  filter: { jenisPegawaiKode?: string | null; unitAsalKode?: string | null } = {}
): Promise<{ headings: string[]; rows: (string | null)[][] }> {
  const rows = await db.nominatifBulanan.findMany({
    where: {
      bulan,
      tahun,
      ...(filter.jenisPegawaiKode ? { jenisPegawaiKode: filter.jenisPegawaiKode } : {}),
      ...(filter.unitAsalKode ? { unitAsalKode: filter.unitAsalKode } : {}),
    },
    include: { jenisPegawai: true, statusKepegawaian: true, golongan: true, unitAsal: true },
  });
  return {
    headings: JUDUL_EKSPOR_NOMINATIF,
    rows: urutkanMenurutNama(rows).map((r) => [
      r.pegawaiNip,
      r.nama,
      r.jenisKelamin,
      formatTanggal(r.tanggalLahir),
      r.jenisPegawai?.nama ?? null,
      r.statusKepegawaian?.nama ?? null,
      r.golongan?.kode ?? null,
      r.unitAsal?.nama ?? null,
      formatTanggal(r.tanggalMulaiKerja),
    ]),
  };
}
