import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { KesalahanUpload } from "@/lib/upload/konstanta";
import { bersihkanPotonganYatim, hapusPotongan, simpanPotongan, uploadIdValid } from "@/lib/upload/potongan";

// Satu potongan berkas (≤ 3 MB, jauh di bawah batas body Vercel 4,5 MB) per permintaan; browser memanggilnya
// berulang untuk merakit satu berkas utuh di tabel UploadChunk. Lihat docs/08-rancangan-upload-f4.md.

export async function POST(request: Request): Promise<NextResponse> {
  const sesi = await auth();
  if (!sesi?.user) return NextResponse.json({ error: "Sesi login sudah habis." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const uploadId = form.get("uploadId");
  const potongan = form.get("chunk");
  if (!uploadIdValid(uploadId)) return NextResponse.json({ error: "uploadId tidak valid." }, { status: 400 });
  if (!(potongan instanceof Blob)) return NextResponse.json({ error: "Bagian berkas tidak ditemukan." }, { status: 400 });

  try {
    const indeks = Number(form.get("chunkIndex"));
    // Awal unggahan baru = saat yang murah untuk membuang potongan yatim dari unggahan yang tak pernah selesai.
    if (indeks === 0) await bersihkanPotonganYatim(prisma);
    await simpanPotongan(prisma, uploadId, indeks, Buffer.from(await potongan.arrayBuffer()));
  } catch (e) {
    if (e instanceof KesalahanUpload) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}

/** Membatalkan unggahan: membuang semua potongannya. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const sesi = await auth();
  if (!sesi?.user) return NextResponse.json({ error: "Sesi login sudah habis." }, { status: 401 });
  const uploadId = new URL(request.url).searchParams.get("uploadId");
  if (!uploadIdValid(uploadId)) return NextResponse.json({ error: "uploadId tidak valid." }, { status: 400 });
  await hapusPotongan(prisma, uploadId);
  return NextResponse.json({ ok: true });
}
