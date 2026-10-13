"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type BarisKoreksi, bacaBarisKoreksi, parseKoreksi, pesanImpor, type RingkasanKoreksi, simpanKoreksiImpor } from "@/lib/koreksi/impor";
import { type BarisPratinjau, batalkanKoreksi, buatDataKoreksi, type HasilTerapan, pratinjauKoreksi, simpanDanTerapkanKoreksi, terapkanUntukBulan } from "@/lib/koreksi/layanan";
import { type FormKoreksi, type GalatKoreksi, validasiKoreksi } from "@/lib/koreksi/validasi";
import { KesalahanUpload } from "@/lib/upload/konstanta";
import { hapusPotongan, rakitBerkas, uploadIdValid } from "@/lib/upload/potongan";

/** Aksi server halaman Koreksi Rekap (formulir, daftar, terapkan ulang, impor Excel). Semua wajib login. */

const BELUM_LOGIN = "Sesi login sudah habis, silakan masuk ulang.";
const GALAT_SERVER = "Terjadi kesalahan di server. Tidak ada data yang diubah.";

async function pengguna(): Promise<string | null> {
  const sesi = await auth();
  return sesi?.user ? (sesi.user.name ?? "Admin") : null;
}

/** Pesan ringkasan penerapan (sama dengan KoreksiRekapController::ringkasan). */
function ringkasan(h: HasilTerapan, awal: string): string {
  let p = `${awal}: ${h.barisDiubah} baris rekap diubah, ${h.hariDipindah} hari dipindah.`;
  if (h.sebagian.length > 0) p += ` ${h.sebagian.length} bulan hanya sebagian masuk periode sehingga TIDAK diubah (perlu koreksi angka).`;
  if (h.kurang.length > 0) p += ` ${h.kurang.length} koreksi angka hanya terpenuhi sebagian karena hari yang tersedia di komponen asal kurang dari yang diminta.`;
  return p;
}

type Gagal = { ok: false; pesan?: string; galat?: GalatKoreksi };

export type HasilPratinjau = { ok: true; nama: string | null; pratinjau: BarisPratinjau[] } | Gagal;

/** Nama pegawai dari snapshot Nominatif TERBARU (KDS2: pluck terakhir menimpa). */
async function namaPegawai(nip: string): Promise<string | null> {
  const n = await prisma.nominatifBulanan.findFirst({ where: { pegawaiNip: nip }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }], select: { nama: true } });
  return n?.nama ?? null;
}

export async function pratinjauKoreksiAksi(form: FormKoreksi): Promise<HasilPratinjau> {
  if (!(await pengguna())) return { ok: false, pesan: BELUM_LOGIN };
  try {
    const { input, galat } = await validasiKoreksi(prisma, form);
    if (!input) return { ok: false, galat };
    return { ok: true, nama: await namaPegawai(input.nip), pratinjau: await pratinjauKoreksi(prisma, buatDataKoreksi(input)) };
  } catch (e) {
    console.error("Pratinjau koreksi gagal:", e);
    return { ok: false, pesan: GALAT_SERVER };
  }
}

export type HasilSimpan = { ok: true; pesan: string } | Gagal;

export async function simpanKoreksiAksi(form: FormKoreksi): Promise<HasilSimpan> {
  const nama = await pengguna();
  if (!nama) return { ok: false, pesan: BELUM_LOGIN };
  try {
    const { input, galat } = await validasiKoreksi(prisma, form);
    if (!input) return { ok: false, galat };
    const { hasil } = await simpanDanTerapkanKoreksi(prisma, buatDataKoreksi(input), nama);
    revalidatePath("/koreksi-rekap");
    return { ok: true, pesan: ringkasan(hasil, "Koreksi disimpan dan diterapkan") };
  } catch (e) {
    console.error("Simpan koreksi gagal:", e);
    return { ok: false, pesan: GALAT_SERVER };
  }
}

export async function batalkanKoreksiAksi(id: number): Promise<{ ok: boolean; pesan: string }> {
  const nama = await pengguna();
  if (!nama) return { ok: false, pesan: BELUM_LOGIN };
  if (!Number.isInteger(id)) return { ok: false, pesan: "Koreksi tidak valid." };
  try {
    await batalkanKoreksi(prisma, id, nama);
    revalidatePath("/koreksi-rekap");
    return { ok: true, pesan: "Koreksi dibatalkan. Angka yang sudah terlanjur dikoreksi TIDAK dikembalikan otomatis - kembali ke angka asli hanya saat bulan itu di-upload ulang." };
  } catch (e) {
    console.error("Batalkan koreksi gagal:", e);
    return { ok: false, pesan: "Koreksi tidak ditemukan." };
  }
}

export async function terapkanUlangAksi(bulan: number, tahun: number): Promise<{ ok: boolean; pesan: string }> {
  const nama = await pengguna();
  if (!nama) return { ok: false, pesan: BELUM_LOGIN };
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12 || !Number.isInteger(tahun) || tahun < 2020 || tahun > 2100) return { ok: false, pesan: "Bulan (1-12) dan tahun (2020-2100) harus valid." };
  try {
    const h = await terapkanUntukBulan(prisma, bulan, tahun, nama);
    revalidatePath("/koreksi-rekap");
    return { ok: true, pesan: ringkasan(h, "Koreksi diterapkan ulang") };
  } catch (e) {
    console.error("Terapkan ulang gagal:", e);
    return { ok: false, pesan: GALAT_SERVER };
  }
}

// ---------- impor Excel (berkas tiba lewat /api/upload-chunk) ----------
type MasukanImpor = { uploadId: string; totalPotongan: number; namaFile: string };
const BATAS_BARIS_LAYAR = 500;

function galatBerkas(e: unknown): Gagal {
  if (e instanceof KesalahanUpload) return { ok: false, pesan: e.message };
  console.error("Impor koreksi gagal:", e);
  return { ok: false, pesan: GALAT_SERVER };
}

export type HasilPeriksaImpor = { ok: true; baris: BarisKoreksi[]; barisTotal: number; ringkasan: RingkasanKoreksi } | Gagal;

/** PERIKSA: parse tanpa menyimpan; potongan tetap disimpan untuk tahap Simpan. */
export async function periksaImporKoreksi(m: MasukanImpor): Promise<HasilPeriksaImpor> {
  if (!(await pengguna())) return { ok: false, pesan: BELUM_LOGIN };
  if (!uploadIdValid(m.uploadId)) return { ok: false, pesan: "Unggahan tidak valid. Silakan pilih berkasnya lagi." };
  if (!m.namaFile.toLowerCase().endsWith(".xlsx")) return { ok: false, pesan: "File harus berformat .xlsx." };
  try {
    const berkas = await rakitBerkas(prisma, m.uploadId, m.totalPotongan);
    const h = await parseKoreksi(prisma, await bacaBarisKoreksi(berkas));
    if (h.galat) return { ok: false, pesan: h.galat };
    return { ok: true, baris: h.baris.slice(0, BATAS_BARIS_LAYAR), barisTotal: h.baris.length, ringkasan: h.ringkasan };
  } catch (e) {
    return galatBerkas(e);
  }
}

/** SIMPAN: membaca ulang berkas, menyimpan dan menerapkan baris valid dalam satu transaksi, lalu membuang potongan. */
export async function simpanImporKoreksi(m: MasukanImpor): Promise<HasilSimpan> {
  const nama = await pengguna();
  if (!nama) return { ok: false, pesan: BELUM_LOGIN };
  if (!uploadIdValid(m.uploadId)) return { ok: false, pesan: "Unggahan tidak valid. Silakan pilih berkasnya lagi." };
  try {
    const berkas = await rakitBerkas(prisma, m.uploadId, m.totalPotongan);
    const h = await parseKoreksi(prisma, await bacaBarisKoreksi(berkas));
    if (h.galat) return { ok: false, pesan: h.galat };
    const hasil = await simpanKoreksiImpor(prisma, h.baris, nama);
    await hapusPotongan(prisma, m.uploadId);
    revalidatePath("/koreksi-rekap");
    return { ok: true, pesan: pesanImpor(hasil) };
  } catch (e) {
    return galatBerkas(e);
  }
}

export async function batalkanImporKoreksi(uploadId: string): Promise<void> {
  if (!(await pengguna())) return;
  await hapusPotongan(prisma, uploadId);
}
