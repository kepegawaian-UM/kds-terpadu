"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { JENIS_FIELD_IDENTITAS_EKSTERNAL, kunciIdentitasEksternal } from "@/lib/domain/identitasEksternal";
import type { RawNominatifRow } from "@/lib/excel/types";
import { uraiFormResolve } from "@/lib/standarisasi/formResolve";
import { tambahProgramStudiBaru, tambahRoleJabatanTambahan, tambahUnitAsalBaru } from "@/lib/standarisasi/master";
import { selesaikanBaris } from "@/lib/standarisasi/resolve";

export type ResolveState = { error?: string };

const SESI_HABIS = "Sesi login sudah habis, silakan masuk ulang.";

async function pengguna() {
  const sesi = await auth();
  return sesi?.user ? { id: sesi.user.id ?? null, nama: sesi.user.name ?? "Admin" } : null;
}

/** Simpan hasil penyelesaian manual satu baris Review, lalu kembali ke daftar Review. */
export async function resolveBarisBermasalah(batchId: number, barisId: string, _prev: ResolveState, formData: FormData): Promise<ResolveState> {
  const p = await pengguna();
  if (!p) return { error: SESI_HABIS };
  const u = await uraiFormResolve(prisma, formData);
  if (!u.ok) return { error: u.error };
  const baris = await prisma.barisBermasalah.findUnique({ where: { id: barisId }, select: { uploadBatchId: true } });
  if (!baris || baris.uploadBatchId !== batchId) return { error: "Baris tidak ditemukan di batch ini." };
  try {
    await selesaikanBaris(prisma, { barisBermasalahId: barisId, kelompok: u.kelompok, data: u.data, ingat: u.ingat, pengguna: p });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal menyimpan baris." };
  }
  revalidatePath(`/standarisasi/${batchId}`);
  redirect(`/standarisasi/${batchId}/review`);
}

/** Konfirmasi identitas Akademisi Luar UM ber-NIP placeholder (pilih NIP lama atau tetapkan sebagai orang baru). */
export async function pilihIdentitasEksternal(batchId: number, barisId: string, formData: FormData): Promise<void> {
  const p = await pengguna();
  if (!p) throw new Error(SESI_HABIS);
  const nipTerpilih = String(formData.get("nipTerpilih") ?? "").trim();
  if (!/^\d+$/.test(nipTerpilih)) throw new Error("NIP tidak valid.");

  const baris = await prisma.barisBermasalah.findUniqueOrThrow({ where: { id: barisId } });
  if (baris.uploadBatchId !== batchId) throw new Error("Baris tidak ditemukan di batch ini.");
  const raw = baris.dataMentah as unknown as RawNominatifRow;
  const namaMentah = raw.namaDenganGelar || raw.namaTanpaGelar;
  // NIP lama yang dipilih harus pernah tercatat; mencegah salah ketik NIP tanpa riwayat.
  if (nipTerpilih !== baris.nip && !(await prisma.pegawai.findUnique({ where: { nip: nipTerpilih } }))) {
    throw new Error(`NIP ${nipTerpilih} tidak ditemukan di riwayat pegawai manapun.`);
  }
  const ada = p.id ? await prisma.user.findUnique({ where: { id: p.id }, select: { id: true } }) : null;
  const pembuat = ada?.id ?? (await prisma.user.findFirst({ select: { id: true }, orderBy: { id: "asc" } }))?.id;
  if (!pembuat) throw new Error("Tidak ada pengguna terdaftar untuk mencatat kamus.");

  const kunci = kunciIdentitasEksternal(namaMentah);
  await prisma.$transaction(async (tx) => {
    await tx.kamusKoreksi.upsert({
      where: { jenisField_kunciMentah: { jenisField: JENIS_FIELD_IDENTITAS_EKSTERNAL, kunciMentah: kunci } },
      create: { jenisField: JENIS_FIELD_IDENTITAS_EKSTERNAL, kunciMentah: kunci, nilaiResolusi: nipTerpilih, dibuatOlehId: pembuat },
      update: { nilaiResolusi: nipTerpilih },
    });
    await tx.auditLog.create({
      data: { namaTabel: "kamus_koreksi", idRecord: baris.id, fieldDiubah: "identitas_eksternal", nilaiLama: baris.nip, nilaiBaru: nipTerpilih, diubahOleh: p.nama, diubahPada: new Date(), aksi: "UPDATE" },
    });
  });
  redirect(`/standarisasi/${batchId}/review/${barisId}`);
}

// ---- master (dipakai mini-form di layar Review) ----

async function wajibMasuk() {
  if (!(await pengguna())) throw new Error(SESI_HABIS);
}
export async function tambahJabatanTambahanRole(namaRole: string, berlakuUntuk: "Dosen" | "Tendik") {
  await wajibMasuk();
  return tambahRoleJabatanTambahan(prisma, namaRole, berlakuUntuk);
}
export async function tambahUnitAsal(nama: string, unitIndukKode: string) {
  await wajibMasuk();
  return tambahUnitAsalBaru(prisma, nama, unitIndukKode);
}
export async function tambahProgramStudi(nama: string, jenjang: string, unitAsalKode: string) {
  await wajibMasuk();
  return tambahProgramStudiBaru(prisma, nama, jenjang, unitAsalKode);
}
