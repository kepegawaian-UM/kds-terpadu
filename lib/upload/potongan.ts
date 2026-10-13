import type { Prisma, PrismaClient } from "@prisma/client";

import { KesalahanUpload, MAKS_POTONGAN, MAKS_UKURAN_BERKAS, MAKS_UKURAN_POTONGAN, POLA_UPLOAD_ID, UMUR_POTONGAN_YATIM_JAM } from "./konstanta";

type Klien = PrismaClient | Prisma.TransactionClient;

export function uploadIdValid(id: unknown): id is string {
  return typeof id === "string" && POLA_UPLOAD_ID.test(id);
}

/** Menyimpan satu potongan; mengirim ulang potongan yang sama menimpanya (aman untuk percobaan ulang). */
export async function simpanPotongan(db: Klien, uploadId: string, indeks: number, data: Uint8Array<ArrayBuffer>): Promise<void> {
  if (!uploadIdValid(uploadId)) throw new KesalahanUpload("uploadId tidak valid.");
  if (!Number.isInteger(indeks) || indeks < 0 || indeks >= MAKS_POTONGAN) throw new KesalahanUpload("Nomor potongan tidak valid.");
  if (data.length === 0) throw new KesalahanUpload("Potongan berkas kosong.");
  if (data.length > MAKS_UKURAN_POTONGAN) throw new KesalahanUpload("Potongan berkas terlalu besar.");
  await db.uploadChunk.upsert({
    where: { uploadId_chunkIndex: { uploadId, chunkIndex: indeks } },
    create: { uploadId, chunkIndex: indeks, data },
    update: { data, dibuatPada: new Date() },
  });
}

/** Menggabungkan semua potongan menjadi satu berkas; menolak bila ada yang hilang atau jumlahnya tidak cocok. */
export async function rakitBerkas(db: Klien, uploadId: string, totalPotongan: number): Promise<Buffer> {
  if (!uploadIdValid(uploadId)) throw new KesalahanUpload("uploadId tidak valid.");
  if (!Number.isInteger(totalPotongan) || totalPotongan < 1 || totalPotongan > MAKS_POTONGAN) {
    throw new KesalahanUpload("Jumlah potongan tidak valid.");
  }
  const potongan = await db.uploadChunk.findMany({ where: { uploadId }, orderBy: { chunkIndex: "asc" } });
  if (potongan.length !== totalPotongan || potongan.some((p, i) => p.chunkIndex !== i)) {
    throw new KesalahanUpload("Bagian berkas yang diterima tidak lengkap. Silakan unggah ulang berkasnya.");
  }
  const berkas = Buffer.concat(potongan.map((p) => p.data));
  if (berkas.length > MAKS_UKURAN_BERKAS) {
    throw new KesalahanUpload(`Berkas terlalu besar (maksimum ${MAKS_UKURAN_BERKAS / 1024 / 1024} MB).`);
  }
  return berkas;
}

export async function hapusPotongan(db: Klien, uploadId: string): Promise<void> {
  if (!uploadIdValid(uploadId)) return;
  await db.uploadChunk.deleteMany({ where: { uploadId } });
}

/** Menghapus potongan yatim (unggahan yang tidak pernah selesai). Mengembalikan jumlah baris yang dihapus. */
export async function bersihkanPotonganYatim(db: Klien, sekarang = new Date()): Promise<number> {
  const batas = new Date(sekarang.getTime() - UMUR_POTONGAN_YATIM_JAM * 3600_000);
  const { count } = await db.uploadChunk.deleteMany({ where: { dibuatPada: { lt: batas } } });
  return count;
}
