/**
 * F5.2: membuat database LOKAL kds_f5 sebagai salinan kds_paritas (data asli, hanya di komputer ini) dan menulis F5_DATABASE_URL ke .env.
 * Menolak bila kds_f5 sudah ada (tambahkan --ganti untuk menghapus dan membuat ulang). Membaca POSTGRES_PASSWORD dari .env; tidak dicetak.
 *   npx tsx scripts/f5-siapkan-db.ts [--ganti]
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

const password = process.env.POSTGRES_PASSWORD;
if (!password) throw new Error("POSTGRES_PASSWORD di .env kosong.");
const pengguna = process.env.POSTGRES_USER ?? "postgres";
const host = process.env.POSTGRES_HOST ?? "localhost:5432";
const url = (db: string) => `postgresql://${encodeURIComponent(pengguna)}:${encodeURIComponent(password)}@${host}/${db}`;
const ganti = process.argv.includes("--ganti");

async function main() {
  const admin = new PrismaClient({ datasourceUrl: url("postgres") });
  try {
    const ada = (await admin.$queryRawUnsafe<{ n: number }[]>("SELECT 1 AS n FROM pg_database WHERE datname = 'kds_f5'")).length > 0;
    if (ada && !ganti) throw new Error("Database kds_f5 sudah ada. Pakai --ganti untuk membuat ulang (data kds_f5 hilang; kds_paritas tidak tersentuh).");
    if (ada) {
      await admin.$executeRawUnsafe("DROP DATABASE kds_f5 WITH (FORCE)");
      console.log("kds_f5 lama dihapus.");
    }
    // Salinan fisik lewat TEMPLATE: butuh kds_paritas tanpa koneksi lain yang aktif.
    await admin.$executeRawUnsafe("CREATE DATABASE kds_f5 TEMPLATE kds_paritas");
    console.log("kds_f5 dibuat sebagai salinan kds_paritas.");
  } finally {
    await admin.$disconnect();
  }
  let env = readFileSync(".env", "utf8");
  const baris = `F5_DATABASE_URL="${url("kds_f5")}"`;
  env = /^F5_DATABASE_URL=.*$/m.test(env) ? env.replace(/^F5_DATABASE_URL=.*$/m, () => baris) : `${env.trimEnd()}\n${baris}\n`;
  writeFileSync(".env", env);
  console.log(".env diperbarui (F5_DATABASE_URL).");
}

main().catch((e) => {
  console.error("Gagal:", e instanceof Error ? e.message.slice(0, 300) : e);
  process.exit(1);
});
