"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type GalatTambah, type InputTambahPegawai, tambahPegawaiManual } from "@/lib/nominatif/tambahManual";

export type HasilTambahPegawai = { ok: true; id: number } | { ok: false; galat: GalatTambah; pesan?: string };

/** Tambah Pegawai manual ke Nominatif bulan berjalan (lihat lib/nominatif/tambahManual.ts). */
export async function tambahPegawai(input: InputTambahPegawai): Promise<HasilTambahPegawai> {
  const sesi = await auth();
  if (!sesi?.user) return { ok: false, galat: {}, pesan: "Sesi login sudah habis, silakan masuk ulang." };
  try {
    // Sesi lama bisa menyimpan id pengguna yang sudah tidak ada: jangan gagal, cukup tanpa relasi (nama tetap tercatat).
    const ada = sesi.user.id ? await prisma.user.findUnique({ where: { id: sesi.user.id }, select: { id: true } }) : null;
    const h = await tambahPegawaiManual(prisma, input, { id: ada?.id ?? null, nama: sesi.user.name ?? "Admin" });
    return h.ok ? { ok: true, id: h.id } : { ok: false, galat: h.galat };
  } catch (e) {
    console.error("Tambah Pegawai gagal:", e);
    return { ok: false, galat: {}, pesan: "Terjadi kesalahan di server. Tidak ada data yang diubah." };
  }
}
