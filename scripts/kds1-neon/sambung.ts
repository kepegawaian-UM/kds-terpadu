/**
 * Koneksi BACA-SAJA ke database KDS1 (Neon) untuk migrasi F4.5c. Alamat koneksi dibaca dari berkas .env KDS1 (BACA SAJA, tidak pernah
 * dicetak atau disalin ke berkas lain). Semua kueri dijalankan di dalam transaksi yang dipaksa READ ONLY: server menolak INSERT/UPDATE/
 * DELETE/DDL apa pun. Hanya SELECT yang dipakai.
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

const ENV_KDS1 = "D:/ANAS/Project/tool-standardisasi-nominatif-simpega-um/.env";

function alamatKds1(): string {
  const baris = readFileSync(ENV_KDS1, "utf8").split(/\r?\n/);
  const ambil = (kunci: string) => {
    const b = baris.find((x) => x.startsWith(`${kunci}=`));
    return b ? b.slice(kunci.length + 1).trim().replace(/^["']|["']$/g, "") : null;
  };
  const url = ambil("DATABASE_URL_UNPOOLED") ?? ambil("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL tidak ditemukan di .env KDS1.");
  if (!url.startsWith("postgres")) throw new Error("Alamat KDS1 bukan PostgreSQL.");
  return url;
}

/** Menjalankan `fn` dengan klien bertransaksi READ ONLY terhadap Neon KDS1. */
export async function denganKds1<T>(fn: (q: <R = unknown>(sql: string, ...nilai: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasourceUrl: alamatKds1() });
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const q = async <R = unknown>(sql: string, ...nilai: unknown[]): Promise<R[]> => {
          if (!/^\s*select\b/i.test(sql)) throw new Error("Hanya SELECT yang diizinkan.");
          return (await tx.$queryRawUnsafe(sql, ...nilai)) as R[];
        };
        return fn(q);
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
