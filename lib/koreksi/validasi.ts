/**
 * Validasi formulir Koreksi Rekap. Port dari App\Http\Requests\KoreksiRekapRequest (KDS2): kolom mana yang ditolak
 * identik (dibuktikan paritas, tests/paritas/koreksi-formulir.test.ts); pesan buatan KDS2 (Indonesia) dipakai persis, pesan
 * aturan dasar (wajib/maks/tidak valid) berbahasa Indonesia (KDS2: Inggris).
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { parseTanggalNominatif } from "@/lib/impor/tanggal";

import { komponenTersedia, type InputKoreksi } from "./layanan";

type Db = PrismaClient | Prisma.TransactionClient;

export const KOLOM_KOREKSI = [
  "jenis", "nip", "dari_komponen", "ke_komponen", "tanggal_mulai", "tanggal_selesai", "bulan", "tahun", "jumlah_hari", "alasan", "sumber",
] as const;
export type KolomKoreksi = (typeof KOLOM_KOREKSI)[number];
export type FormKoreksi = Partial<Record<KolomKoreksi, string | null | undefined>>;
export type GalatKoreksi = Partial<Record<KolomKoreksi, string[]>>;

/** Pesan buatan KDS2 (messages() pada KoreksiRekapRequest). */
export const PESAN_KOREKSI = {
  nipTidakAda: "NIP tidak ditemukan di data pegawai.",
  tujuanSama: "Komponen tujuan harus berbeda dari komponen asal.",
  selesaiSebelumMulai: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
  mulaiWajib: "Tanggal mulai wajib diisi untuk koreksi periode.",
  bulanWajib: "Bulan wajib diisi untuk koreksi angka.",
  tahunWajib: "Tahun wajib diisi untuk koreksi angka.",
  hariWajib: "Jumlah hari wajib diisi untuk koreksi angka.",
} as const;

const panjang = (s: string) => Array.from(s).length;
const bulatan = (s: string) => /^[+-]?\d+$/.test(s);

/** TrimStrings + ConvertEmptyStringsToNull (middleware HTTP Laravel). */
export function bersihkanKoreksi(f: FormKoreksi): Record<KolomKoreksi, string | null> {
  const h = {} as Record<KolomKoreksi, string | null>;
  for (const k of KOLOM_KOREKSI) {
    const v = f[k];
    const t = typeof v === "string" ? v.trim() : null;
    h[k] = t === "" ? null : t;
  }
  return h;
}

export async function validasiKoreksi(db: Db, mentah: FormKoreksi): Promise<{ input: InputKoreksi | null; galat: GalatKoreksi }> {
  const d = bersihkanKoreksi(mentah);
  const galat: GalatKoreksi = {};
  const tambah = (k: KolomKoreksi, pesan: string) => (galat[k] = [...(galat[k] ?? []), pesan]);
  const kode = (await komponenTersedia(db)).map((k) => k.kode);
  const angka = d.jenis === "angka";
  const periode = d.jenis === "periode";

  if (d.jenis === null) tambah("jenis", "Jenis koreksi wajib dipilih.");
  else if (!angka && !periode) tambah("jenis", "Jenis koreksi yang dipilih tidak valid.");

  if (d.nip === null) tambah("nip", "NIP wajib diisi.");
  else if (panjang(d.nip) > 18) tambah("nip", "NIP maksimal 18 karakter.");
  else if (!(await db.pegawai.findUnique({ where: { nip: d.nip }, select: { nip: true } }))) tambah("nip", PESAN_KOREKSI.nipTidakAda);

  if (d.dari_komponen === null) tambah("dari_komponen", "Komponen asal wajib dipilih.");
  else if (!kode.includes(d.dari_komponen)) tambah("dari_komponen", "Komponen asal yang dipilih tidak valid.");

  if (d.ke_komponen !== null) {
    if (!kode.includes(d.ke_komponen)) tambah("ke_komponen", "Komponen tujuan yang dipilih tidak valid.");
    if (d.ke_komponen === d.dari_komponen) tambah("ke_komponen", PESAN_KOREKSI.tujuanSama);
  }

  const mulai = d.tanggal_mulai === null ? null : parseTanggalNominatif(d.tanggal_mulai);
  const selesai = d.tanggal_selesai === null ? null : parseTanggalNominatif(d.tanggal_selesai);
  if (d.tanggal_mulai === null) {
    if (periode) tambah("tanggal_mulai", PESAN_KOREKSI.mulaiWajib);
  } else if (mulai === null) tambah("tanggal_mulai", "Tanggal mulai bukan tanggal yang valid.");
  if (d.tanggal_selesai !== null) {
    if (selesai === null) {
      // aturan after_or_equal Laravel juga gagal bila nilainya bukan tanggal, tetapi hanya saat tanggal mulai valid: dua pesan (seperti KDS2)
      tambah("tanggal_selesai", "Tanggal selesai bukan tanggal yang valid.");
      if (mulai !== null) tambah("tanggal_selesai", PESAN_KOREKSI.selesaiSebelumMulai);
    }
    else if (mulai !== null && selesai < mulai) tambah("tanggal_selesai", PESAN_KOREKSI.selesaiSebelumMulai);
  }

  const rentang = (k: "bulan" | "tahun" | "jumlah_hari", label: string, min: number, maks: number, wajibPesan: string) => {
    const v = d[k];
    if (v === null) {
      if (angka) tambah(k, wajibPesan);
    } else if (!bulatan(v)) tambah(k, `${label} harus berupa bilangan bulat.`);
    else if (Number(v) < min || Number(v) > maks) tambah(k, `${label} harus antara ${min} dan ${maks}.`);
  };
  rentang("bulan", "Bulan", 1, 12, PESAN_KOREKSI.bulanWajib);
  rentang("tahun", "Tahun", 2020, 2100, PESAN_KOREKSI.tahunWajib);
  rentang("jumlah_hari", "Jumlah hari", 1, 31, PESAN_KOREKSI.hariWajib);

  if (d.alasan === null) tambah("alasan", "Alasan wajib diisi.");
  else if (panjang(d.alasan) > 255) tambah("alasan", "Alasan maksimal 255 karakter.");
  if (d.sumber !== null && panjang(d.sumber) > 150) tambah("sumber", "Sumber maksimal 150 karakter.");

  if (Object.keys(galat).length > 0) return { input: null, galat };
  return {
    galat,
    input: {
      jenis: d.jenis as "periode" | "angka", nip: d.nip!, dariKomponen: d.dari_komponen!, keKomponen: d.ke_komponen,
      tanggalMulai: mulai, tanggalSelesai: selesai, bulan: d.bulan === null ? null : Number(d.bulan), tahun: d.tahun === null ? null : Number(d.tahun),
      jumlahHari: d.jumlah_hari === null ? null : Number(d.jumlah_hari), alasan: d.alasan!, sumber: d.sumber,
    },
  };
}
