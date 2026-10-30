/**
 * Daftar dan ekspor Excel Koreksi Absensi (tambahan Terpadu, tidak ada di KDS2). Satu sumber untuk daftar di halaman dan berkas Excel supaya isinya selalu sama:
 * filter tahun/bulan (koreksi yang berlaku pada periode itu), unit induk (menurut Nominatif terakhir pegawai), dan pencarian NIP/nama.
 * Ekspor hanya memuat koreksi yang AKTIF (belum dibatalkan).
 */
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";

import { stempelWaktuWib } from "@/lib/laporan/rekapTkTindakLanjut";
import { buatNamaFile } from "@/lib/laporan/namaFile";
import { NAMA_BULAN } from "@/lib/laporan/periode";

import { komponenTersedia, tujuanTersedia } from "./layanan";

type Db = PrismaClient;

export type FilterKoreksi = { tahun?: number | null; bulan?: number | null; unitIndukKode?: string | null; cari?: string | null; hanyaAktif?: boolean };

export type BarisKoreksi = {
  id: number;
  nip: string;
  nama: string | null;
  unitInduk: string | null;
  unitIndukKode: string | null;
  unit: string | null;
  jenis: string;
  dari: string;
  ke: string | null;
  jumlahHari: number | null;
  bulan: number | null;
  tahun: number | null;
  mulai: Date;
  selesai: Date | null;
  alasan: string;
  sumber: string | null;
  dibuatPada: Date;
  dibuatOleh: string;
  dibatalkan: boolean;
};

const hariPertama = (t: number, b: number) => new Date(Date.UTC(t, b - 1, 1));
const hariTerakhir = (t: number, b: number) => new Date(Date.UTC(t, b, 0));

/** Parameter URL ke angka: bilangan bulat dalam rentang, selain itu null (= semua). */
export function angkaDalamRentang(nilai: string | null | undefined, min: number, maks: number): number | null {
  const n = Number.parseInt(String(nilai ?? "").trim(), 10);
  return Number.isInteger(n) && n >= min && n <= maks ? n : null;
}

/** Apakah koreksi berlaku pada tahun (dan bulan) itu: jenis angka menurut bulan/tahunnya, jenis periode menurut irisan rentang tanggalnya. */
function berlakuPada(k: { jenis: string; bulan: number | null; tahun: number | null; tanggalMulai: Date; tanggalSelesai: Date | null }, tahun: number, bulan: number | null): boolean {
  if (k.jenis === "angka") return k.tahun === tahun && (bulan === null || k.bulan === bulan);
  const awal = bulan === null ? hariPertama(tahun, 1) : hariPertama(tahun, bulan);
  const akhir = bulan === null ? hariTerakhir(tahun, 12) : hariTerakhir(tahun, bulan);
  return k.tanggalMulai <= akhir && (k.tanggalSelesai === null || k.tanggalSelesai >= awal);
}

export async function ambilKoreksi(db: Db, filter: FilterKoreksi = {}): Promise<BarisKoreksi[]> {
  const semua = await db.koreksiRekap.findMany({ orderBy: { id: "desc" }, ...(filter.hanyaAktif ? { where: { dibatalkanPada: null } } : {}) });
  const terpilih = filter.tahun ? semua.filter((k) => berlakuPada(k, filter.tahun!, filter.bulan ?? null)) : semua;

  // identitas dari snapshot Nominatif terbaru tiap NIP (yang terakhir menimpa), seperti halaman Koreksi
  const nips = [...new Set(terpilih.map((k) => k.nip))];
  const identitas = new Map<string, { nama: string; unit: string | null; unitInduk: string | null; unitIndukKode: string | null }>();
  if (nips.length > 0) {
    const snap = await db.nominatifBulanan.findMany({
      where: { pegawaiNip: { in: nips } },
      orderBy: [{ tahun: "asc" }, { bulan: "asc" }],
      select: { pegawaiNip: true, nama: true, unitAsal: { select: { nama: true, unitIndukKode: true, unitInduk: { select: { nama: true } } } } },
    });
    for (const n of snap) identitas.set(n.pegawaiNip, { nama: n.nama, unit: n.unitAsal?.nama ?? null, unitInduk: n.unitAsal?.unitInduk?.nama ?? null, unitIndukKode: n.unitAsal?.unitIndukKode ?? null });
  }

  const cari = (filter.cari ?? "").trim().toLowerCase();
  return terpilih
    .map((k): BarisKoreksi => {
      const i = identitas.get(k.nip);
      return {
        id: k.id, nip: k.nip, nama: i?.nama ?? null, unitInduk: i?.unitInduk ?? null, unitIndukKode: i?.unitIndukKode ?? null, unit: i?.unit ?? null, jenis: k.jenis,
        dari: k.dariKomponen, ke: k.keKomponen, jumlahHari: k.jumlahHari, bulan: k.bulan, tahun: k.tahun, mulai: k.tanggalMulai, selesai: k.tanggalSelesai,
        alasan: k.alasan, sumber: k.sumber, dibuatPada: k.dibuatPada, dibuatOleh: k.dibuatOleh, dibatalkan: k.dibatalkanPada !== null,
      };
    })
    .filter((b) => !filter.unitIndukKode || b.unitIndukKode === filter.unitIndukKode)
    .filter((b) => !cari || b.nip.toLowerCase().includes(cari) || (b.nama ?? "").toLowerCase().includes(cari));
}

export const teksTanggal = (d: Date | null): string | null =>
  d ? `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}` : null;

/** "Maret 2026" (jenis angka) atau "01-03-2026 s.d. 31-03-2026" / "... s.d. tanpa batas" (jenis periode). */
export function teksPeriodeKoreksi(b: Pick<BarisKoreksi, "jenis" | "bulan" | "tahun" | "mulai" | "selesai">): string {
  if (b.jenis === "angka" && b.bulan) return `${NAMA_BULAN[b.bulan]} ${b.tahun}`;
  return `${teksTanggal(b.mulai)} s.d. ${teksTanggal(b.selesai) ?? "tanpa batas"}`;
}

export type LaporanKoreksi = { namaFile: string; judul: string[]; baris: (string | number | null)[][]; jumlah: number };

const JUDUL = ["No", "NIP", "Nama", "Unit Induk", "Unit Kerja", "Jenis", "Dari Komponen", "Ke Komponen", "Periode", "Jumlah Hari"];

/** Isi ekspor: koreksi aktif menurut filter, urut nama pegawai lalu id (kronologis). */
export async function laporanKoreksi(db: Db, filter: FilterKoreksi, sekarang: Date = new Date()): Promise<LaporanKoreksi> {
  const [baris, dari, tujuan, unit] = await Promise.all([
    ambilKoreksi(db, { ...filter, hanyaAktif: true }),
    komponenTersedia(db),
    tujuanTersedia(db),
    filter.unitIndukKode ? db.unitInduk.findUnique({ where: { kode: filter.unitIndukKode }, select: { nama: true } }) : null,
  ]);
  const namaDari = new Map(dari.map((k) => [k.kode, `${k.kode} - ${k.nama}`]));
  const namaKe = new Map(tujuan.map((k) => [k.kode, k.kode === "JUMLAH_MASUK_NYATA" ? k.nama : `${k.kode} - ${k.nama}`]));

  const urut = [...baris].sort((a, b) => (a.nama ?? a.nip).localeCompare(b.nama ?? b.nip, "id") || a.nip.localeCompare(b.nip) || a.id - b.id);
  const isi = urut.map((b, i) => [
    i + 1, b.nip, b.nama ?? "-", b.unitInduk ?? "-", b.unit ?? "-", b.jenis === "angka" ? "Angka (per bulan)" : "Periode (rentang tanggal)",
    namaDari.get(b.dari) ?? b.dari, b.ke === null ? "Tidak dihitung (keluar/pensiun)" : (namaKe.get(b.ke) ?? b.ke), teksPeriodeKoreksi(b), b.jenis === "angka" ? b.jumlahHari : null,
  ]);

  const bagianPeriode = filter.tahun ? `${filter.bulan ? `${NAMA_BULAN[filter.bulan]} ` : ""}${filter.tahun}` : "";
  const nama = buatNamaFile("Koreksi Absensi", [], [], [bagianPeriode, unit ? unit.nama : ""].filter(Boolean).join(" - "), []);
  return { namaFile: `${nama} - dibuat ${stempelWaktuWib(sekarang)}`, judul: JUDUL, baris: isi, jumlah: isi.length };
}

export async function buatBerkasKoreksi(lap: LaporanKoreksi): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KDS Terpadu";
  const ws = wb.addWorksheet("Koreksi Absensi");
  ws.addRow(lap.judul);
  for (const b of lap.baris) ws.addRow(b);
  const judul = ws.getRow(1);
  judul.font = { bold: true, color: { argb: "FFFFFFFF" } };
  judul.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  judul.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D443A" } }));
  [6, 22, 34, 34, 34, 24, 34, 34, 28, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(2).numFmt = "@"; // NIP 18 digit: tetap teks
  ws.getColumn(10).alignment = { horizontal: "center" };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 3 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lap.judul.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
