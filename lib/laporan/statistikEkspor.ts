/**
 * Ekspor Excel Statistik Dosen dan Tendik: isi tabel di halaman, diratakan menjadi satu baris judul (mis. "Lektor Kepala IV/a L") supaya mudah disaring dan
 * dipivot di Excel. Angka ditulis sebagai angka (0 tetap 0). Laporan baru Terpadu (tidak ada padanan ekspor di KDS2).
 */
import type { PrismaClient } from "@prisma/client";

import {
  type BarisStatistik,
  GOLONGAN_TENDIK,
  PENDIDIKAN_DOSEN,
  PENDIDIKAN_TENDIK,
  STATUS_TENDIK,
  statistikDosen,
  statistikTendik,
} from "./statistik";
import { namaBulan } from "./periode";

type Db = Pick<PrismaClient, "nominatifBulanan">;
type Hasil = { namaFile: string; headings: string[]; rows: (string | number)[][] };

const n = (b: BarisStatistik, k: string) => Number(b[k] ?? 0);

export async function eksporStatistikDosen(db: Db, bulan: number, tahun: number): Promise<Hasil> {
  const s = await statistikDosen(db, bulan, tahun);
  const namaKolom = s.kolom.flatMap((k) => [`${k.jabatan} ${k.golongan ?? "-"} L`, `${k.jabatan} ${k.golongan ?? "-"} P`]);
  const baris = (b: BarisStatistik) => [
    ...s.kolom.flatMap((_, i) => [n(b, `kol_${i}_L`), n(b, `kol_${i}_P`)]),
    n(b, "jumlah"),
    ...PENDIDIKAN_DOSEN.map((p) => n(b, `pend_${p}`)),
    n(b, "pend_none"),
  ];
  const rows: (string | number)[][] = [];
  for (const f of s.laporan) {
    rows.push([f.subtotal.unit, "(Jumlah fakultas)", ...baris(f.subtotal)]);
    for (const j of f.jurusan) rows.push([f.subtotal.unit, j.unit, ...baris(j)]);
  }
  if (s.laporan.length > 0) rows.push([s.total.unit, "", ...baris(s.total)]);
  return {
    namaFile: `Statistik Dosen ${namaBulan(bulan)} ${tahun}`,
    headings: ["Fakultas", "Jurusan", ...namaKolom, "Jumlah", ...PENDIDIKAN_DOSEN.map((p) => `Pendidikan ${p}`), "Pendidikan (kosong)"],
    rows,
  };
}

export async function eksporStatistikTendik(db: Db, bulan: number, tahun: number): Promise<Hasil> {
  const s = await statistikTendik(db, bulan, tahun);
  const baris = (b: BarisStatistik) => [
    n(b, "jumlah"),
    ...STATUS_TENDIK.flatMap((st) => [n(b, `status_${st}_L`), n(b, `status_${st}_P`)]),
    ...GOLONGAN_TENDIK.map((g) => n(b, `gol_${g}`)),
    n(b, "gol_none"),
    ...PENDIDIKAN_TENDIK.map((p) => n(b, `pend_${p}`)),
    n(b, "pend_none"),
  ];
  const rows: (string | number)[][] = s.statistik.map((b) => [b.unit, ...baris(b)]);
  if (s.statistik.length > 0) rows.push([s.total.unit, ...baris(s.total)]);
  return {
    namaFile: `Statistik Tendik ${namaBulan(bulan)} ${tahun}`,
    headings: [
      "Unit Kerja",
      "Jumlah",
      ...STATUS_TENDIK.flatMap((st) => [`${st} L`, `${st} P`]),
      ...GOLONGAN_TENDIK.map((g) => `Golongan ${g}`),
      "Golongan (kosong)",
      ...PENDIDIKAN_TENDIK.map((p) => `Pendidikan ${p}`),
      "Pendidikan (kosong)",
    ],
    rows,
  };
}
