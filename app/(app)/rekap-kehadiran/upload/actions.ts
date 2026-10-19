"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type Catatan, type RingkasanRekap, periksaRekap, simpanRekap } from "@/lib/impor/rekapKehadiran";
import { KesalahanUpload } from "@/lib/upload/konstanta";
import { hapusPotongan, rakitBerkas, uploadIdValid } from "@/lib/upload/potongan";

/** Tahap Periksa dan Simpan Upload Rekap Kehadiran (lihat docs/08-rancangan-upload-f4.md). Berkas tiba lewat /api/upload-chunk. */

type Masukan = { uploadId: string; totalPotongan: number; bulan: number; tahun: number; namaSheet: string; namaFile: string };
export type GalatUpload = { ok: false; error: string; bidang?: "file" | "nama_sheet" | "bulan" | "tahun" };

/** Ringkasan untuk layar: daftar catatan dipotong agar respons tetap kecil; jumlah sebenarnya tetap ikut. */
export type RingkasanLayar = Omit<RingkasanRekap, "catatan"> & { catatan: Catatan[]; catatanTotal: number; anomaliTotal: number };
export type HasilPeriksa = { ok: true; ringkasan: RingkasanLayar } | GalatUpload;
export type HasilSimpan = { ok: true; batchId: number; koreksi: { barisDiubah: number; hariDipindah: number; sebagian: number; kurang: number } } | GalatUpload;

const BATAS_CATATAN_LAYAR = 300;
const BATAS_ANOMALI_LAYAR = 500; // urut penting, sedang, info: yang terpotong hanya yang paling ringan

function validasi(m: Masukan): GalatUpload | null {
  if (!uploadIdValid(m.uploadId)) return { ok: false, error: "Unggahan tidak valid. Silakan pilih berkasnya lagi." };
  if (!Number.isInteger(m.bulan) || m.bulan < 1 || m.bulan > 12) return { ok: false, error: "Bulan tidak valid.", bidang: "bulan" };
  if (!Number.isInteger(m.tahun) || m.tahun < 2000 || m.tahun > 2100) return { ok: false, error: "Tahun harus antara 2000 dan 2100.", bidang: "tahun" };
  if (m.namaSheet.length > 100) return { ok: false, error: "Nama sheet maksimal 100 karakter.", bidang: "nama_sheet" };
  if (!m.namaFile.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "File harus berformat .xlsx.", bidang: "file" };
  return null;
}

function galat(e: unknown): GalatUpload {
  if (e instanceof KesalahanUpload) return { ok: false, error: e.message, bidang: e.bidang };
  console.error("Upload Absensi gagal:", e);
  return { ok: false, error: "Terjadi kesalahan di server saat memproses berkas. Tidak ada data yang diubah." };
}

/** PERIKSA: membaca dan memvalidasi tanpa menulis apa pun; potongan tetap disimpan untuk tahap Simpan. */
export async function periksaUploadRekap(m: Masukan): Promise<HasilPeriksa> {
  const sesi = await auth();
  if (!sesi?.user) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const tidakValid = validasi(m);
  if (tidakValid) return tidakValid;
  try {
    const berkas = await rakitBerkas(prisma, m.uploadId, m.totalPotongan);
    const r = await periksaRekap(prisma, berkas, { bulan: m.bulan, tahun: m.tahun, namaSheet: m.namaSheet });
    return { ok: true, ringkasan: { ...r, catatanTotal: r.catatan.length, catatan: r.catatan.slice(0, BATAS_CATATAN_LAYAR), anomaliTotal: r.anomali.length, anomali: r.anomali.slice(0, BATAS_ANOMALI_LAYAR) } };
  } catch (e) {
    return galat(e);
  }
}

/** SIMPAN: membaca ulang, menulis dalam satu transaksi dan menerapkan koreksi; potongan dibuang setelahnya. */
export async function simpanUploadRekap(m: Masukan): Promise<HasilSimpan> {
  const sesi = await auth();
  if (!sesi?.user) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const tidakValid = validasi(m);
  if (tidakValid) return tidakValid;
  try {
    const berkas = await rakitBerkas(prisma, m.uploadId, m.totalPotongan);
    // Sesi lama bisa menyimpan id pengguna yang sudah tidak ada (mis. akun dibuat ulang): jangan gagal, cukup tanpa relasi.
    // Nama pengunggah tetap tercatat sebagai teks, seperti di KDS2.
    const ada = sesi.user.id ? await prisma.user.findUnique({ where: { id: sesi.user.id }, select: { id: true } }) : null;
    const r = await simpanRekap(prisma, berkas, m.namaFile, { bulan: m.bulan, tahun: m.tahun, namaSheet: m.namaSheet }, { id: ada?.id ?? null, nama: sesi.user.name ?? "Admin" });
    await hapusPotongan(prisma, m.uploadId);
    return {
      ok: true,
      batchId: r.batchId,
      koreksi: { barisDiubah: r.koreksi.barisDiubah, hariDipindah: r.koreksi.hariDipindah, sebagian: r.koreksi.sebagian.length, kurang: r.koreksi.kurang.length },
    };
  } catch (e) {
    return galat(e);
  }
}

/** BATAL: membuang potongan unggahan yang tidak jadi disimpan. */
export async function batalkanUploadRekap(uploadId: string): Promise<void> {
  const sesi = await auth();
  if (!sesi?.user) return;
  await hapusPotongan(prisma, uploadId);
}
