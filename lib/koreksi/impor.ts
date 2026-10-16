/**
 * Impor massal Koreksi Rekap dari Excel. Port dari App\Services\KoreksiRekapImporter (KDS2): dua tahap, parse() hanya membaca
 * dan memvalidasi (tanpa menyimpan) dan menghasilkan pratinjau per baris; simpan() membuat koreksi dan menerapkannya.
 * Kolom dibaca menurut NAMA header (bukan posisi). Paritas: tests/paritas/koreksi-impor.test.ts.
 */
import type { PrismaClient } from "@prisma/client";

import { phpTrim } from "@/lib/impor/phpString";
import { type BarisSheet, bacaSheet, type NilaiSel } from "@/lib/upload/bacaSheet";
import { periksaBerkas } from "@/lib/upload/penjagaBerkas";

import { type DataKoreksi, type Db, komponenTersedia, pratinjauKoreksi, simpanDanTerapkanKoreksi } from "./layanan";

export const MAKS_BARIS_KOREKSI = 2000;
export const HEADER_KOREKSI = ["NIP", "Jenis", "Dari Komponen", "Ke Komponen", "Tanggal Mulai", "Tanggal Selesai", "Bulan", "Tahun", "Jumlah Hari", "Alasan", "Sumber"];
const JUMLAH_KOLOM_BACA = 40;

export type StatusBaris = "valid" | "gagal" | "duplikat";
export type DataBarisKoreksi = {
  nip: string; jenis: string; dari_komponen: string; ke_komponen: string | null; tanggal_mulai: string | null; tanggal_selesai: string | null;
  bulan: number | null; tahun: number | null; jumlah_hari: number | null; alasan: string; sumber: string | null;
};
export type BarisKoreksi = { baris: number; status: StatusBaris; pesan: string; data: DataBarisKoreksi; dampak: { bulan: number; hari: number; sebagian: number } | null };
export type RingkasanKoreksi = { total: number; valid: number; gagal: number; duplikat: number; hari: number; sebagian: number };
export type HasilParseKoreksi = { baris: BarisKoreksi[]; ringkasan: RingkasanKoreksi; galat?: string };

// ---------- padanan fungsi PHP ----------
const keTeks = (v: NilaiSel | undefined): string => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "1" : "") : v instanceof Date ? String(v.getTime() / 86_400_000 + 25569) : String(v));
const bigU = (s: string) => s.replace(/[a-z]/g, (c) => c.toUpperCase());
const bigL = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** is_numeric PHP. */
function phpNumerik(v: NilaiSel | undefined): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(v);
  return false;
}
const phpInt = (v: NilaiSel | undefined): number => Math.trunc(typeof v === "number" ? v : Number(String(v).trim()));

function nipDariSel(v: NilaiSel | undefined): string {
  if (typeof v === "number") return Number.isInteger(v) ? BigInt(v).toString() : String(Math.round(v)); // sprintf('%.0f')
  return keTeks(v).replace(/[ \t\n\v\f\r]+/g, "");
}

const pad = (n: number, l = 2) => String(n).padStart(l, "0");
const ymd = (t: number, b: number, h: number) => `${pad(t, 4)}-${pad(b)}-${pad(h)}`;
const hariDalamBulan = (t: number, b: number) => new Date(Date.UTC(t, b, 0)).getUTCDate();
const dariYmd = (s: string): Date => {
  const [t, b, h] = s.split("-").map(Number);
  const d = new Date(0);
  d.setUTCFullYear(t, b - 1, h);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const keYmd = (d: Date) => ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

/** Nomor seri Excel -> tanggal (ExcelDate::excelToDateTimeObject + startOfDay). */
function dariSeri(seri: number): string {
  const hari = Math.floor(seri);
  const dasar = hari >= 61 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
  return keYmd(new Date(dasar + hari * 86_400_000));
}

/** null = kosong, false = format tidak valid. */
function bacaTanggal(v: NilaiSel | undefined): string | null | false {
  if (v === null || v === undefined || phpTrim(keTeks(v)) === "") return null;
  if (v instanceof Date) return keYmd(v);
  if (phpNumerik(v)) return dariSeri(Number(typeof v === "string" ? v.trim() : v));
  const s = phpTrim(keTeks(v));
  let m: RegExpExecArray | null;
  const sah = (t: number, b: number, h: number) => (b >= 1 && b <= 12 && h >= 1 && h <= hariDalamBulan(t, b) ? ymd(t, b, h) : false);
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return sah(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s))) return sah(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) return sah(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s))) return sah(+m[3], +m[2], +m[1]);
  return false;
}

function dataKosong(): DataBarisKoreksi {
  return { nip: "", jenis: "", dari_komponen: "", ke_komponen: null, tanggal_mulai: null, tanggal_selesai: null, bulan: null, tahun: null, jumlah_hari: null, alasan: "", sumber: null };
}

function bacaBaris(row: BarisSheet, kolom: Map<string, number>, komponen: string[], nipTerdaftar: ReadonlySet<string>): [DataBarisKoreksi, string | null] {
  const ambil = (k: string): NilaiSel | undefined => (kolom.has(k) ? (row[kolom.get(k)!] ?? null) : null);
  const teks = (k: string) => phpTrim(keTeks(ambil(k)));

  const nip = nipDariSel(ambil("nip"));
  const jenisMentah = bigL(teks("jenis"));
  const jenis = jenisMentah === "" || jenisMentah === "0" ? "periode" : jenisMentah;
  const dari = bigU(teks("darikomponen"));
  const keMentah = bigU(teks("kekomponen"));
  const ke = ["", "-", "HAPUS", "TIDAK DIHITUNG"].includes(keMentah) ? null : keMentah;
  const alasan = teks("alasan");
  const sumber = teks("sumber");

  const data: DataBarisKoreksi = { ...dataKosong(), nip, jenis, dari_komponen: dari, ke_komponen: ke, alasan, sumber: sumber === "" ? null : sumber };

  if (nip === "") return [data, "NIP kosong."];
  if (!nipTerdaftar.has(nip)) return [data, "NIP tidak ditemukan di data pegawai (cek format kolom NIP = Teks)."];
  if (jenis !== "periode" && jenis !== "angka") return [data, 'Jenis harus kosong, "periode", atau "angka".'];
  if (!komponen.includes(dari)) return [data, `Dari Komponen "${dari}" tidak dikenal.`];
  if (ke !== null && !komponen.includes(ke)) return [data, `Ke Komponen "${ke}" tidak dikenal.`];
  if (ke === dari) return [data, "Komponen tujuan harus berbeda dari komponen asal."];
  const panjang = (s: string) => Array.from(s).length;
  if (alasan === "" || panjang(alasan) > 255) return [data, "Alasan wajib diisi (maks 255 karakter)."];
  if (panjang(sumber) > 150) return [data, "Sumber maksimal 150 karakter."];

  if (jenis === "angka") {
    const bulan = ambil("bulan");
    const tahun = ambil("tahun");
    const hari = ambil("jumlahhari");
    if (!phpNumerik(bulan) || phpInt(bulan) < 1 || phpInt(bulan) > 12 || !phpNumerik(tahun) || phpInt(tahun) < 2020 || phpInt(tahun) > 2100) {
      return [data, "Jenis angka: Bulan (1-12) dan Tahun wajib valid."];
    }
    if (!phpNumerik(hari) || phpInt(hari) < 1 || phpInt(hari) > 31) return [data, "Jenis angka: Jumlah Hari harus 1-31."];
    const b = phpInt(bulan);
    const t = phpInt(tahun);
    data.bulan = b;
    data.tahun = t;
    data.jumlah_hari = phpInt(hari);
    data.tanggal_mulai = ymd(t, b, 1);
    data.tanggal_selesai = ymd(t, b, hariDalamBulan(t, b));
    return [data, null];
  }

  const mulai = bacaTanggal(ambil("tanggalmulai"));
  const selesai = bacaTanggal(ambil("tanggalselesai"));
  if (mulai === null) return [data, "Tanggal Mulai wajib diisi untuk jenis periode."];
  if (mulai === false || selesai === false) return [data, "Format tanggal tidak dikenali (pakai yyyy-mm-dd atau dd-mm-yyyy)."];
  if (selesai && dariYmd(selesai).getTime() < dariYmd(mulai).getTime()) return [data, "Tanggal Selesai tidak boleh sebelum Tanggal Mulai."];
  data.tanggal_mulai = mulai;
  data.tanggal_selesai = selesai;
  return [data, null];
}

const kunciBaris = (d: Pick<DataBarisKoreksi, "nip" | "jenis" | "dari_komponen" | "ke_komponen" | "tanggal_mulai" | "tanggal_selesai" | "jumlah_hari">) =>
  [d.nip, d.jenis, d.dari_komponen, d.ke_komponen ?? "", d.tanggal_mulai ?? "", d.tanggal_selesai ?? "", d.jumlah_hari ?? ""].join("|");

export const keDataKoreksi = (d: DataBarisKoreksi): DataKoreksi => ({
  nip: d.nip, jenis: d.jenis as "periode" | "angka", dariKomponen: d.dari_komponen, keKomponen: d.ke_komponen,
  tanggalMulai: dariYmd(d.tanggal_mulai!), tanggalSelesai: d.tanggal_selesai ? dariYmd(d.tanggal_selesai) : null, bulan: d.bulan, tahun: d.tahun,
  jumlahHari: d.jumlah_hari, alasan: d.alasan, sumber: d.sumber,
});

function ringkas(hasil: BarisKoreksi[]): RingkasanKoreksi {
  const hitung = (s: StatusBaris) => hasil.filter((b) => b.status === s).length;
  return {
    total: hasil.length, valid: hitung("valid"), gagal: hitung("gagal"), duplikat: hitung("duplikat"),
    hari: hasil.reduce((s, b) => s + (b.dampak?.hari ?? 0), 0), sebagian: hasil.reduce((s, b) => s + (b.dampak?.sebagian ?? 0), 0),
  };
}

/** Membaca berkas Excel (sheet pertama) menjadi baris mentah. Penjaga berkas (ukuran/sheet/baris) dijalankan lebih dulu. */
export async function bacaBarisKoreksi(berkas: Buffer): Promise<BarisSheet[]> {
  await periksaBerkas(berkas, null);
  return bacaSheet(berkas, null, JUMLAH_KOLOM_BACA);
}

/** Tahap PERIKSA: membaca dan memvalidasi tanpa menyimpan apa pun. */
export async function parseKoreksi(db: Db, baris: BarisSheet[]): Promise<HasilParseKoreksi> {
  if (baris.length === 0) return { baris: [], ringkasan: ringkas([]) };

  const kolom = new Map<string, number>();
  baris[0].forEach((nama, i) => kolom.set(bigL(keTeks(nama)).replace(/[^a-z0-9]/g, ""), i));

  const dataRows: [number, BarisSheet][] = [];
  for (let i = 1; i < baris.length; i++) if (baris[i].some((c) => c !== null && phpTrim(keTeks(c)) !== "")) dataRows.push([i, baris[i]]);

  if (dataRows.length > MAKS_BARIS_KOREKSI) return { baris: [], ringkasan: ringkas([]), galat: `Maksimal ${MAKS_BARIS_KOREKSI} baris per file.` };
  if (!kolom.has("nip") || !kolom.has("darikomponen") || !kolom.has("alasan")) {
    return { baris: [], ringkasan: ringkas([]), galat: "Header wajib tidak ditemukan: NIP, Dari Komponen, Alasan. Pakai template resmi." };
  }

  const komponen = (await komponenTersedia(db)).map((k) => k.kode);
  const nips = [...new Set(dataRows.map(([, r]) => nipDariSel(r[kolom.get("nip")!] ?? null)).filter((n) => n !== ""))];
  const nipTerdaftar = new Set<string>();
  for (let i = 0; i < nips.length; i += 1000) for (const p of await db.pegawai.findMany({ where: { nip: { in: nips.slice(i, i + 1000) } }, select: { nip: true } })) nipTerdaftar.add(p.nip);

  const tgl = (d: Date | null) => (d ? keYmd(d) : null);
  const sudahAda = new Set((await db.koreksiRekap.findMany({ where: { dibatalkanPada: null }, orderBy: { id: "asc" } })).map((k) =>
    kunciBaris({ nip: k.nip, jenis: k.jenis, dari_komponen: k.dariKomponen, ke_komponen: k.keKomponen, tanggal_mulai: tgl(k.tanggalMulai), tanggal_selesai: tgl(k.tanggalSelesai), jumlah_hari: k.jumlahHari })));
  const dalamFile = new Set<string>();
  const hasil: BarisKoreksi[] = [];

  for (const [indeks, row] of dataRows) {
    const nomor = indeks + 1;
    const [data, galat] = bacaBaris(row, kolom, komponen, nipTerdaftar);
    if (galat) {
      hasil.push({ baris: nomor, status: "gagal", pesan: galat, data, dampak: null });
      continue;
    }
    const kunci = kunciBaris(data);
    if (sudahAda.has(kunci) || dalamFile.has(kunci)) {
      hasil.push({ baris: nomor, status: "duplikat", pesan: sudahAda.has(kunci) ? "Koreksi yang sama sudah ada." : "Duplikat dengan baris lain di file ini.", data, dampak: null });
      continue;
    }
    dalamFile.add(kunci);
    const pratinjau = await pratinjauKoreksi(db, keDataKoreksi(data));
    hasil.push({
      baris: nomor, status: "valid", pesan: "", data,
      dampak: { bulan: pratinjau.filter((p) => p.dipindah > 0).length, hari: pratinjau.reduce((s, p) => s + p.dipindah, 0), sebagian: pratinjau.filter((p) => p.cakupan === "sebagian").length },
    });
  }
  return { baris: hasil, ringkasan: ringkas(hasil) };
}

export type HasilSimpanKoreksi = { disimpan: number; barisDiubah: number; hariDipindah: number; sebagian: number; kurang: number };

/** Tahap SIMPAN: membuat dan menerapkan semua baris berstatus valid dalam SATU transaksi (semua atau tidak sama sekali). */
export async function simpanKoreksiImpor(prisma: PrismaClient, baris: BarisKoreksi[], pengguna: string): Promise<HasilSimpanKoreksi> {
  return prisma.$transaction(
    async (tx) => {
      const hasil: HasilSimpanKoreksi = { disimpan: 0, barisDiubah: 0, hariDipindah: 0, sebagian: 0, kurang: 0 };
      for (const b of baris) {
        if (b.status !== "valid") continue;
        const { hasil: r } = await simpanDanTerapkanKoreksi(tx, keDataKoreksi(b.data), pengguna);
        hasil.disimpan++;
        hasil.barisDiubah += r.barisDiubah;
        hasil.hariDipindah += r.hariDipindah;
        hasil.sebagian += r.sebagian.length;
        hasil.kurang += r.kurang.length;
      }
      return hasil;
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

/** Pesan ringkasan impor (sama dengan KoreksiRekapController::imporSimpan). */
export function pesanImpor(h: HasilSimpanKoreksi): string {
  let p = `Impor selesai: ${h.disimpan} koreksi disimpan, ${h.barisDiubah} baris absensi diubah, ${h.hariDipindah} hari dipindah.`;
  if (h.sebagian > 0) p += ` ${h.sebagian} bulan hanya sebagian masuk periode sehingga TIDAK diubah (perlu koreksi angka).`;
  if (h.kurang > 0) p += ` ${h.kurang} koreksi angka hanya terpenuhi sebagian (hari tersedia kurang).`;
  return p;
}

