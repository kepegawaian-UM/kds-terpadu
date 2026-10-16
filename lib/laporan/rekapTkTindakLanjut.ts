/**
 * Laporan TK (Tanpa Keterangan) untuk tindak lanjut: dari rekap bulanan yang sama dengan Rekap Tahunan (sudah termasuk Koreksi Rekap), ambil pegawai
 * dengan total hari TK setahun >= ambang, lengkap dengan rinciannya per bulan dan per unit. Identitas/unit tiap pegawai = snapshot Nominatif TERAKHIR di
 * tahun itu (aturan yang sama dengan Rekap Tahunan). Laporan baru (tidak ada padanan di KDS2): angkanya dicocokkan dengan Rekap Tahunan lewat tes.
 */
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";

import { labelFileKeaktifan, nipNonaktif, urutanKodeStatus } from "./filter";
import { kueriRencanaKustom } from "./kueri";
import { type FilterRekap, kondisiNominatif } from "./rekapBulanan";
import { buatNamaFile } from "./namaFile";
import { idSnapshotTerakhir } from "./rekapTahunan";
import { urutkanMenurutNama } from "./urutNama";

type Db = Pick<PrismaClient, "nominatifBulanan" | "catatanStatusPegawai" | "statusKepegawaian" | "$transaction">;

export const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;
export const AMBANG_TK_BAWAAN = 3;

export type BarisTk = {
  peringkat: number;
  nip: string;
  nama: string;
  jenis: string;
  unitInduk: string;
  unit: string;
  /** hari TK Januari..Desember (indeks 0..11) */
  perBulan: number[];
  total: number;
  jumlahBulan: number;
  /** mis. "Jan (2), Mar (1)" */
  bulanTk: string;
};

export type RingkasanUnitTk = { unitInduk: string; jumlahPegawai: number; pegawaiTk: number; persen: number; totalHari: number; maksPerOrang: number };

export type LaporanTk = {
  tahun: number;
  ambang: number;
  keaktifan: FilterRekap["keaktifan"];
  jumlahPegawaiDiperiksa: number;
  baris: BarisTk[];
  ringkasan: RingkasanUnitTk[];
  namaFile: string;
};

/** Ambang dari parameter URL: bilangan bulat >= 1; selain itu bawaan. */
export function ambangDari(nilai: string | null | undefined): number {
  const n = Number.parseInt(String(nilai ?? "").trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 400 ? n : AMBANG_TK_BAWAAN;
}

/** Peringkat kompetisi: nilai sama berbagi peringkat (1, 2, 2, 4). Masukan harus sudah terurut menurun. */
export function beriPeringkat<T>(terurut: readonly T[], nilai: (x: T) => number): number[] {
  return terurut.map((x, i) => {
    let awal = i;
    while (awal > 0 && nilai(terurut[awal - 1]) === nilai(x)) awal--;
    return awal + 1;
  });
}

/** "16-10-2026 08.34 WIB": titik (bukan titik dua) agar aman dipakai di nama berkas. */
export function stempelWaktuWib(sekarang: Date): string {
  const b = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(sekarang)
    .reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {});
  return `${b.day}-${b.month}-${b.year} ${b.hour}.${b.minute} WIB`;
}

export async function laporanTkTindakLanjut(db: Db, tahun: number, filter: FilterRekap, ambang: number, sekarang: Date = new Date()): Promise<LaporanTk> {
  const nonaktif = await nipNonaktif(db, tahun);
  const ids = await idSnapshotTerakhir(db, tahun);
  const snapshot = await db.nominatifBulanan.findMany({
    where: { id: { in: ids }, ...kondisiNominatif(filter, nonaktif) },
    select: { id: true, pegawaiNip: true, nama: true, jenisPegawai: { select: { nama: true } }, unitAsal: { select: { nama: true, unitInduk: { select: { nama: true } } } } },
  });
  const nips = snapshot.map((s) => s.pegawaiNip);

  // hari TK per NIP per bulan: awalan angka dipakai, nilai bukan angka dihitung 0 (sama dengan totalPerNip Rekap Tahunan)
  const perNip = new Map<string, number[]>();
  if (nips.length > 0) {
    const rows = await kueriRencanaKustom<{ nip: string; bulan: number; total: string }[]>(
      db,
      `SELECT r."nip" AS nip, r."bulan" AS bulan,
              SUM(COALESCE(NULLIF(substring(d."nilai" from '^[ ]*[-+]?[0-9]+'), '')::bigint, 0))::text AS total
         FROM "rekap_kehadiran_detail" d
         JOIN "rekap_kehadiran_bulanan" r ON r."id" = d."rekapKehadiranBulananId"
        WHERE r."tahun" = $1 AND d."komponenKode" = 'TK' AND r."nip" = ANY($2::text[])
        GROUP BY r."nip", r."bulan"`,
      tahun,
      nips,
    );
    for (const r of rows) {
      const bulan = perNip.get(r.nip) ?? new Array<number>(12).fill(0);
      if (r.bulan >= 1 && r.bulan <= 12) bulan[r.bulan - 1] = Number(r.total);
      perNip.set(r.nip, bulan);
    }
  }

  const kandidat = urutkanMenurutNama(snapshot)
    .map((s) => {
      const perBulan = perNip.get(s.pegawaiNip) ?? new Array<number>(12).fill(0);
      const total = perBulan.reduce((a, b) => a + b, 0);
      return {
        nip: s.pegawaiNip,
        nama: s.nama,
        jenis: s.jenisPegawai?.nama ?? "",
        unitInduk: s.unitAsal?.unitInduk?.nama ?? "(tanpa unit)",
        unit: s.unitAsal?.nama ?? "(tanpa unit)",
        perBulan,
        total,
        jumlahBulan: perBulan.filter((x) => x > 0).length,
        bulanTk: perBulan.flatMap((x, i) => (x > 0 ? [`${BULAN_SINGKAT[i]} (${x})`] : [])).join(", "),
      };
    });

  const terpilih = kandidat.filter((k) => k.total >= ambang).sort((a, b) => b.total - a.total); // urutan nama dipertahankan untuk TK sama (sort stabil)
  const peringkat = beriPeringkat(terpilih, (k) => k.total);
  const baris: BarisTk[] = terpilih.map((k, i) => ({ peringkat: peringkat[i], ...k }));

  const ringkasan = new Map<string, RingkasanUnitTk>();
  for (const k of kandidat) {
    const r = ringkasan.get(k.unitInduk) ?? { unitInduk: k.unitInduk, jumlahPegawai: 0, pegawaiTk: 0, persen: 0, totalHari: 0, maksPerOrang: 0 };
    r.jumlahPegawai++;
    if (k.total >= ambang) {
      r.pegawaiTk++;
      r.totalHari += k.total;
      r.maksPerOrang = Math.max(r.maksPerOrang, k.total);
    }
    ringkasan.set(k.unitInduk, r);
  }
  const ringkasanUrut = [...ringkasan.values()]
    .map((r) => ({ ...r, persen: r.jumlahPegawai === 0 ? 0 : Math.round((r.pegawaiTk / r.jumlahPegawai) * 1000) / 10 }))
    .sort((a, b) => b.totalHari - a.totalHari || b.pegawaiTk - a.pegawaiTk || a.unitInduk.localeCompare(b.unitInduk, "id"));

  return {
    tahun,
    ambang,
    keaktifan: filter.keaktifan,
    jumlahPegawaiDiperiksa: kandidat.length,
    baris,
    ringkasan: ringkasanUrut,
    // nama mengikuti filter seperti laporan lain (jenis, status, keaktifan), mis. "Laporan TK Tahunan Tendik PNS-PPPK Aktif 2026 minimal 3 hari"
    namaFile: `${buatNamaFile("Laporan TK Tahunan", filter.jenis, filter.status, `${tahun} minimal ${ambang} hari`, await urutanKodeStatus(db), labelFileKeaktifan(filter.keaktifan))} - dibuat ${stempelWaktuWib(sekarang)}`,
  };
}

const JUDUL_PEGAWAI = ["Peringkat", "Unit Induk", "Unit Kerja", "NIP", "Nama", "Jenis Pegawai", ...BULAN_SINGKAT, "Total Hari TK", "Jumlah Bulan ber-TK", "Bulan ber-TK"];
const JUDUL_UNIT = ["Peringkat", "Unit Kerja", "NIP", "Nama", "Jenis Pegawai", ...BULAN_SINGKAT, "Total Hari TK", "Jumlah Bulan ber-TK", "Bulan ber-TK"];

/** Nama sheet Excel: maks 31 karakter, tanpa []:*?/\, unik. */
export function namaSheetUnik(nama: string, terpakai: Set<string>): string {
  const dasar = nama.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Unit";
  let kandidat = dasar;
  for (let n = 2; terpakai.has(kandidat.toLowerCase()); n++) kandidat = `${dasar.slice(0, 31 - String(n).length - 1)} ${n}`;
  terpakai.add(kandidat.toLowerCase());
  return kandidat;
}

function gayaTabel(ws: ExcelJS.Worksheet, barisJudul: number, kolomBulanAwal: number, lebar: number[]) {
  const judul = ws.getRow(barisJudul);
  judul.font = { bold: true, color: { argb: "FFFFFFFF" } };
  judul.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  judul.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D443A" } }));
  lebar.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: barisJudul }];
  for (let r = barisJudul + 1; r <= ws.rowCount; r++) {
    for (let k = kolomBulanAwal; k < kolomBulanAwal + 12; k++) {
      const c = ws.getRow(r).getCell(k);
      c.alignment = { horizontal: "center" };
      if (typeof c.value === "number" && c.value > 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECEC" } };
    }
  }
}

/** Berkas Excel: Ringkasan per unit induk, Semua Pegawai (matriks 12 bulan), lalu satu sheet per unit induk yang punya pegawai ber-TK. */
export async function buatBerkasTk(lap: LaporanTk): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KDS Terpadu";
  const terpakai = new Set<string>();

  const ring = wb.addWorksheet(namaSheetUnik("Ringkasan Unit", terpakai));
  ring.addRow([`Laporan TK (Tanpa Keterangan) untuk Tindak Lanjut - Tahun ${lap.tahun}`]).font = { bold: true, size: 13 };
  const aktif = lap.keaktifan === "aktif" ? "pegawai aktif saja" : lap.keaktifan === "nonaktif" ? "pegawai non-aktif saja" : "semua pegawai";
  ring.addRow([`Pegawai dengan total TK minimal ${lap.ambang} hari dalam setahun; ${aktif}. Dari ${lap.jumlahPegawaiDiperiksa} pegawai diperiksa, ${lap.baris.length} memenuhi ambang.`]);
  ring.addRow(["Sumber: Absensi bulanan (sudah termasuk Koreksi Absensi); unit = Nominatif terakhir pegawai di tahun itu. Peringkat: nilai TK sama berbagi peringkat."]);
  ring.addRow([]);
  ring.addRow(["Unit Induk", "Jumlah Pegawai", "Pegawai ber-TK", "% ber-TK", "Total Hari TK", "TK Tertinggi (1 orang)"]);
  for (const r of lap.ringkasan) ring.addRow([r.unitInduk, r.jumlahPegawai, r.pegawaiTk, r.persen, r.totalHari, r.maksPerOrang]);
  const jumlah = ring.addRow(["JUMLAH", lap.ringkasan.reduce((a, r) => a + r.jumlahPegawai, 0), lap.ringkasan.reduce((a, r) => a + r.pegawaiTk, 0), null, lap.ringkasan.reduce((a, r) => a + r.totalHari, 0), null]);
  jumlah.font = { bold: true };
  gayaTabel(ring, 5, 99, [44, 16, 16, 12, 16, 22]);

  const semua = wb.addWorksheet(namaSheetUnik("Semua Pegawai", terpakai));
  semua.addRow(JUDUL_PEGAWAI);
  for (const b of lap.baris) semua.addRow([b.peringkat, b.unitInduk, b.unit, b.nip, b.nama, b.jenis, ...b.perBulan, b.total, b.jumlahBulan, b.bulanTk]);
  semua.getColumn(4).numFmt = "@";
  gayaTabel(semua, 1, 7, [10, 34, 34, 22, 30, 14, ...new Array<number>(12).fill(6), 12, 12, 40]);

  const perUnit = new Map<string, BarisTk[]>();
  for (const b of lap.baris) perUnit.set(b.unitInduk, [...(perUnit.get(b.unitInduk) ?? []), b]);
  const urutUnit = lap.ringkasan.map((r) => r.unitInduk).filter((u) => perUnit.has(u));
  for (const unit of urutUnit) {
    const ws = wb.addWorksheet(namaSheetUnik(unit, terpakai));
    ws.addRow(JUDUL_UNIT);
    for (const b of perUnit.get(unit)!) ws.addRow([b.peringkat, b.unit, b.nip, b.nama, b.jenis, ...b.perBulan, b.total, b.jumlahBulan, b.bulanTk]);
    ws.getColumn(3).numFmt = "@";
    gayaTabel(ws, 1, 6, [10, 34, 22, 30, 14, ...new Array<number>(12).fill(6), 12, 12, 40]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
