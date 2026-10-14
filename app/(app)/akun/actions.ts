"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { gantiNama, gantiSandi } from "@/lib/auth/masuk";
import { prisma } from "@/lib/db";

export type HasilAkun = { ok: true; pesan: string } | { ok: false; error: string } | null;

export async function simpanSandi(_prev: HasilAkun, formData: FormData): Promise<HasilAkun> {
  const sesi = await auth();
  if (!sesi?.user?.id) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const h = await gantiSandi(prisma, sesi.user.id, String(formData.get("lama") ?? ""), String(formData.get("baru") ?? ""), String(formData.get("konfirmasi") ?? ""));
  return h.ok ? { ok: true, pesan: "Kata sandi berhasil diganti." } : h;
}

export async function simpanNama(_prev: HasilAkun, formData: FormData): Promise<HasilAkun> {
  const sesi = await auth();
  if (!sesi?.user?.id) return { ok: false, error: "Sesi login sudah habis, silakan masuk ulang." };
  const h = await gantiNama(prisma, sesi.user.id, String(formData.get("nama") ?? ""));
  if (h.ok) revalidatePath("/", "layout");
  return h.ok ? { ok: true, pesan: "Nama berhasil disimpan." } : h;
}
