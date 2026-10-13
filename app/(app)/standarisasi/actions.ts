"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type RingkasanStandarisasi, periksaStandarisasi, simpanStandarisasi } from "@/lib/standarisasi/proses";
import { type HasilTindakan, hapusKamus, hapusPegawaiBulan, kecualikanBaris } from "@/lib/standarisasi/tindakan";
import { KesalahanUpload } from "@/lib/upload/konstanta";
import { hapusPotongan, rakitBerkas, uploadIdValid } from "@/lib/upload/potongan";

/** Tahap Periksa dan Simpan Standarisasi berkas mentah SIMPEGA (alur sama dengan Upload Nominatif). */

type Masukan = { uploadId: string; totalPotongan: number; bulan: number; tahun: number; namaFile: string };
export type GalatStandarisasi = { ok: false; error: string; bidang?: "file" | "nama_sheet" | "bulan" | "tahun" };
export type HasilPeriksaStd = { ok: true; ringkasan: RingkasanStandarisasi } | GalatStandarisasi;
export type HasilSimpanStd = { ok: true; batchId: number; perluReview: number } | GalatStandarisasi;

function validasi(m: Masukan): GalatStandarisasi | null {
  if (!uploadIdValid(m.uploadId)) return { ok: false, error: "Unggahan tidak valid. Silakan pilih berkasnya lagi." };
  if (!Number.isInteger(m.bulan) || m.bulan < 1 || m.bulan > 12) return { ok: false, error: "Bulan tidak valid.", bidang: "bulan" };
  if (!Number.isInteger(m.tahun) || m.tahun < 2000 || m.tahun > 2100) return { ok: false, error: "Tahun harus antara 2000 dan 2100.", bidang: "tahun" };
  if (!m.namaFile.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "File harus berformat .xlsx.", bidang: "file" };
  return null;
}

function galat(e: unknown): GalatStandarisasi {
  if (e instanceof KesalahanUpload) return { ok: false, error: e.message, bidang: e.bidang };
  console.error("Standarisasi gagal:", e);
  return { ok: false, error: "Terjadi kesalahan di server saat memproses berkas. Tidak ada data yang diubah." };
}

export async function periksaUploadStandarisasi(m: Masukan): Promise<HasilPeriksaStd> {
  const sesi = await auth();
  if (!sesi?.user) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const tidakValid = validasi(m);
  if (tidakValid) return tidakValid;
  try {
    const berkas = await rakitBerkas(prisma, m.uploadId, m.totalPotongan);
    return { ok: true, ringkasan: await periksaStandarisasi(prisma, berkas, { bulan: m.bulan, tahun: m.tahun }) };
  } catch (e) {
    return galat(e);
  }
}

export async function simpanUploadStandarisasi(m: Masukan): Promise<HasilSimpanStd> {
  const sesi = await auth();
  if (!sesi?.user) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const tidakValid = validasi(m);
  if (tidakValid) return tidakValid;
  try {
    const berkas = await rakitBerkas(prisma, m.uploadId, m.totalPotongan);
    const ada = sesi.user.id ? await prisma.user.findUnique({ where: { id: sesi.user.id }, select: { id: true } }) : null;
    const r = await simpanStandarisasi(prisma, berkas, m.namaFile, { bulan: m.bulan, tahun: m.tahun }, { id: ada?.id ?? null, nama: sesi.user.name ?? "Admin" });
    await hapusPotongan(prisma, m.uploadId);
    revalidatePath("/standarisasi");
    return { ok: true, batchId: r.batchId, perluReview: r.ringkasan.perluReview };
  } catch (e) {
    return galat(e);
  }
}

export async function batalkanUploadStandarisasi(uploadId: string): Promise<void> {
  const sesi = await auth();
  if (!sesi?.user) return;
  await hapusPotongan(prisma, uploadId);
}

// ---- tindakan pada hasil ----

async function pengguna() {
  const sesi = await auth();
  return sesi?.user ? { id: sesi.user.id ?? null, nama: sesi.user.name ?? "Admin" } : null;
}
const SESI_HABIS: HasilTindakan = { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };

export async function kecualikanBarisAksi(batchId: number, barisId: string, permanen: boolean): Promise<HasilTindakan> {
  const p = await pengguna();
  if (!p) return SESI_HABIS;
  const h = await kecualikanBaris(prisma, batchId, barisId, permanen, p);
  revalidatePath(`/standarisasi/${batchId}`);
  revalidatePath(`/standarisasi/${batchId}/review`);
  return h;
}

export async function hapusPegawaiBulanAksi(batchId: number, nominatifId: number): Promise<HasilTindakan> {
  const p = await pengguna();
  if (!p) return SESI_HABIS;
  const h = await hapusPegawaiBulan(prisma, batchId, nominatifId, p);
  revalidatePath(`/standarisasi/${batchId}`);
  return h;
}

export async function hapusKamusAksi(id: string): Promise<HasilTindakan> {
  const p = await pengguna();
  if (!p) return SESI_HABIS;
  const h = await hapusKamus(prisma, id, p);
  revalidatePath("/kamus");
  return h;
}
