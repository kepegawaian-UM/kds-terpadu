"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hapusKoreksiTmt, simpanKoreksiTmt } from "@/lib/koreksi/tanggalMulaiKerja";

export type HasilKoreksiPegawai = { ok: true; pesan: string } | { ok: false; error: string } | null;

async function pengguna() {
  const sesi = await auth();
  return sesi?.user ? { nama: sesi.user.name ?? "Admin" } : null;
}

export async function simpanKoreksiTmtAksi(_prev: HasilKoreksiPegawai, formData: FormData): Promise<HasilKoreksiPegawai> {
  const p = await pengguna();
  if (!p) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const h = await simpanKoreksiTmt(
    prisma,
    { nip: String(formData.get("nip") ?? ""), tanggal: String(formData.get("tanggal") ?? ""), alasan: String(formData.get("alasan") ?? ""), terapkanKeSnapshot: formData.get("terapkanKeSnapshot") === "on" },
    p,
  );
  if (!h.ok) return h;
  revalidatePath("/koreksi-pegawai");
  return { ok: true, pesan: h.snapshotDiubah > 0 ? `Koreksi disimpan; ${h.snapshotDiubah} snapshot Nominatif ikut diubah.` : "Koreksi disimpan; dipakai pada Standarisasi berikutnya." };
}

export async function hapusKoreksiTmtAksi(id: number): Promise<{ ok: boolean; error?: string }> {
  const p = await pengguna();
  if (!p) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const h = await hapusKoreksiTmt(prisma, id, p);
  revalidatePath("/koreksi-pegawai");
  return h.ok ? { ok: true } : { ok: false, error: h.error };
}
