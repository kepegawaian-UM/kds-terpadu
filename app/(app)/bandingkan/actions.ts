"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { simpanCatatanPerubahan as simpan } from "@/lib/standarisasi/bandingkan";

const angkaAtauNull = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

export async function simpanCatatanPerubahan(formData: FormData): Promise<void> {
  const sesi = await auth();
  if (!sesi?.user) throw new Error("Sesi login sudah habis, silakan masuk ulang.");
  let nipTerkait: string[] | undefined;
  const mentah = String(formData.get("nipTerkait") ?? "");
  if (mentah) {
    try {
      const j: unknown = JSON.parse(mentah);
      if (Array.isArray(j) && j.every((x) => typeof x === "string")) nipTerkait = j;
    } catch {
      throw new Error("Data catatan tidak valid.");
    }
  }
  const h = await simpan(
    prisma,
    {
      uploadBatchAId: angkaAtauNull(formData.get("uploadBatchAId")),
      uploadBatchBId: angkaAtauNull(formData.get("uploadBatchBId")),
      kategori: String(formData.get("kategori") ?? ""),
      nipUtama: String(formData.get("nipUtama") ?? ""),
      nama: String(formData.get("nama") ?? ""),
      alasan: String(formData.get("alasan") ?? ""),
      nipTerkait,
    },
    sesi.user.id ?? null,
  );
  if (!h.ok) throw new Error(h.error);
  revalidatePath("/bandingkan");
}
