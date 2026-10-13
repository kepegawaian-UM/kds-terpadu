/**
 * Potongan upload (F4.1a) terhadap kds_test: simpan/timpa, rakit (lengkap, bolong, kelebihan), hapus,
 * pembersih potongan yatim, dan rute /api/upload-chunk (login, validasi, berkas 10 MB end-to-end).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { DELETE, POST } from "@/app/api/upload-chunk/route";
import { UKURAN_POTONGAN } from "@/lib/upload/konstanta";
import { unggahBerkas } from "@/lib/upload/klien";
import { bersihkanPotonganYatim, hapusPotongan, rakitBerkas, simpanPotongan } from "@/lib/upload/potongan";

const sesi = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!ada)("potongan upload", () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    sesi.user = { id: "u1" };
    await prisma.uploadChunk.deleteMany();
  });
  afterAll(async () => {
    await prisma.uploadChunk.deleteMany();
    await prisma.$disconnect();
  });

  const buf = (...b: number[]) => Buffer.from(b);

  it("merakit potongan berurutan menjadi satu berkas, tanpa memedulikan urutan kedatangan", async () => {
    const id = randomUUID();
    await simpanPotongan(prisma, id, 1, buf(4, 5));
    await simpanPotongan(prisma, id, 0, buf(1, 2, 3));
    await simpanPotongan(prisma, id, 2, buf(6));
    expect([...(await rakitBerkas(prisma, id, 3))]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("mengirim ulang potongan yang sama menimpa (percobaan ulang aman)", async () => {
    const id = randomUUID();
    await simpanPotongan(prisma, id, 0, buf(1));
    await simpanPotongan(prisma, id, 0, buf(9, 9));
    expect([...(await rakitBerkas(prisma, id, 1))]).toEqual([9, 9]);
    expect(await prisma.uploadChunk.count({ where: { uploadId: id } })).toBe(1);
  });

  it("menolak perakitan bila potongan bolong, kurang, atau berlebih", async () => {
    const id = randomUUID();
    await simpanPotongan(prisma, id, 0, buf(1));
    await simpanPotongan(prisma, id, 2, buf(3));
    await expect(rakitBerkas(prisma, id, 3)).rejects.toThrow(/tidak lengkap/); // bolong (indeks 1 hilang)
    await expect(rakitBerkas(prisma, id, 2)).rejects.toThrow(/tidak lengkap/); // jumlah tidak cocok
    await expect(rakitBerkas(prisma, id, 1)).rejects.toThrow(/tidak lengkap/); // berlebih
    await expect(rakitBerkas(prisma, randomUUID(), 1)).rejects.toThrow(/tidak lengkap/);
  });

  it("menolak masukan tidak valid", async () => {
    await expect(simpanPotongan(prisma, "bukan-uuid", 0, buf(1))).rejects.toThrow(/uploadId/);
    await expect(simpanPotongan(prisma, randomUUID(), -1, buf(1))).rejects.toThrow(/Nomor potongan/);
    await expect(simpanPotongan(prisma, randomUUID(), 1.5, buf(1))).rejects.toThrow(/Nomor potongan/);
    await expect(simpanPotongan(prisma, randomUUID(), 0, Buffer.alloc(0))).rejects.toThrow(/kosong/);
    await expect(simpanPotongan(prisma, randomUUID(), 0, Buffer.alloc(4 * 1024 * 1024 + 1))).rejects.toThrow(/terlalu besar/);
    await expect(rakitBerkas(prisma, randomUUID(), 0)).rejects.toThrow(/Jumlah potongan/);
  });

  it("hapusPotongan membuang hanya potongan unggahan itu", async () => {
    const a = randomUUID();
    const b = randomUUID();
    await simpanPotongan(prisma, a, 0, buf(1));
    await simpanPotongan(prisma, b, 0, buf(2));
    await hapusPotongan(prisma, a);
    expect(await prisma.uploadChunk.count({ where: { uploadId: a } })).toBe(0);
    expect(await prisma.uploadChunk.count({ where: { uploadId: b } })).toBe(1);
  });

  it("pembersih membuang potongan yatim (> 24 jam) dan mempertahankan yang baru", async () => {
    const lama = randomUUID();
    const baru = randomUUID();
    await simpanPotongan(prisma, lama, 0, buf(1));
    await simpanPotongan(prisma, baru, 0, buf(2));
    await prisma.$executeRaw`update upload_chunk set "dibuatPada" = (now() at time zone 'utc') - interval '25 hours' where "uploadId" = ${lama}`;
    expect(await bersihkanPotonganYatim(prisma)).toBe(1);
    expect(await prisma.uploadChunk.count({ where: { uploadId: lama } })).toBe(0);
    expect(await prisma.uploadChunk.count({ where: { uploadId: baru } })).toBe(1);
  });
});

describe.skipIf(!ada)("rute /api/upload-chunk", () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    sesi.user = { id: "u1" };
    await prisma.uploadChunk.deleteMany();
  });
  afterAll(async () => {
    await prisma.uploadChunk.deleteMany();
    await prisma.$disconnect();
  });

  const form = (uploadId: string, indeks: number | string, isi: Uint8Array | null) => {
    const f = new FormData();
    f.set("uploadId", uploadId);
    f.set("chunkIndex", String(indeks));
    if (isi) f.set("chunk", new Blob([isi as BlobPart]), "p");
    return new Request("http://localhost/api/upload-chunk", { method: "POST", body: f });
  };

  it("menolak tanpa sesi login (401) dan tidak menyimpan apa pun", async () => {
    sesi.user = null;
    const res = await POST(form(randomUUID(), 0, new Uint8Array([1])));
    expect(res.status).toBe(401);
    expect(await prisma.uploadChunk.count()).toBe(0);
    expect((await DELETE(new Request("http://localhost/api/upload-chunk?uploadId=" + randomUUID(), { method: "DELETE" }))).status).toBe(401);
  });

  it("menolak uploadId, indeks, dan potongan yang tidak valid dengan 400", async () => {
    expect((await POST(form("x", 0, new Uint8Array([1])))).status).toBe(400);
    expect((await POST(form(randomUUID(), 0, null))).status).toBe(400);
    expect((await POST(form(randomUUID(), "abc", new Uint8Array([1])))).status).toBe(400);
    expect((await POST(form(randomUUID(), 0, new Uint8Array(0)))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/upload-chunk", { method: "POST", body: "bukan form" }))).status).toBe(400);
    expect(await prisma.uploadChunk.count()).toBe(0);
  });

  it("menyimpan potongan, dan DELETE membatalkan unggahan", async () => {
    const id = randomUUID();
    expect((await POST(form(id, 0, new Uint8Array([1, 2])))).status).toBe(200);
    expect(await prisma.uploadChunk.count({ where: { uploadId: id } })).toBe(1);
    const res = await DELETE(new Request(`http://localhost/api/upload-chunk?uploadId=${id}`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await prisma.uploadChunk.count({ where: { uploadId: id } })).toBe(0);
    expect((await DELETE(new Request("http://localhost/api/upload-chunk?uploadId=xx", { method: "DELETE" }))).status).toBe(400);
  });

  it("unggahan awal (indeks 0) membersihkan potongan yatim unggahan lain", async () => {
    const yatim = randomUUID();
    await simpanPotongan(prisma, yatim, 0, Buffer.from([1]));
    await prisma.$executeRaw`update upload_chunk set "dibuatPada" = (now() at time zone 'utc') - interval '2 days' where "uploadId" = ${yatim}`;
    expect((await POST(form(randomUUID(), 0, new Uint8Array([1])))).status).toBe(200);
    expect(await prisma.uploadChunk.count({ where: { uploadId: yatim } })).toBe(0);
  });

  it("berkas 10 MB terkirim end-to-end lewat pengirim klien + rute, lalu terakit utuh bita demi bita", async () => {
    const isi = new Uint8Array(10 * 1024 * 1024 + 123);
    for (let i = 0; i < isi.length; i += 997) isi[i] = (i / 997) % 251;
    const fetchKeRute = (async (url: string, init?: RequestInit) => {
      const req = new Request(`http://localhost${url}`, init);
      return init?.method === "DELETE" ? DELETE(req) : POST(req);
    }) as unknown as typeof fetch;

    const hasil = await unggahBerkas(new File([isi as BlobPart], "besar.xlsx"), { fetchFn: fetchKeRute });
    expect(hasil.totalPotongan).toBe(Math.ceil(isi.length / UKURAN_POTONGAN));
    const rakitan = await rakitBerkas(prisma, hasil.uploadId, hasil.totalPotongan);
    expect(rakitan.length).toBe(isi.length);
    expect(Buffer.compare(rakitan, Buffer.from(isi))).toBe(0);
  });
});
