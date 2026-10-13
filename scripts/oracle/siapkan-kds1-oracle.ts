/**
 * Menyiapkan database lokal `kds1_oracle` untuk ORACLE paritas F4.5: kode KDS1 ASLI (folder referensi, tidak diubah)
 * dijalankan terhadap database ini. Membuat database (bila belum ada) di PostgreSQL lokal yang sama dengan kds_dev, lalu
 * menerapkan migrasi KDS1 (prisma migrate deploy). TIDAK menyentuh database mana pun milik KDS1 (Neon/produksi):
 * alamat database dipaksa ke kds1_oracle lokal dan dicek sebelum perintah apa pun dijalankan.
 * Jalankan: npx tsx scripts/oracle/siapkan-kds1-oracle.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const KDS1 = process.env.KDS1_PATH ?? "D:/ANAS/Project/tool-standardisasi-nominatif-simpega-um";
const password = process.env.POSTGRES_PASSWORD as string;
if (!password) throw new Error("POSTGRES_PASSWORD di .env kosong.");
const pengguna = process.env.POSTGRES_USER ?? "postgres";
const host = process.env.POSTGRES_HOST ?? "localhost:5432";
export const URL_KDS1_ORACLE = `postgresql://${encodeURIComponent(pengguna)}:${encodeURIComponent(password)}@${host}/kds1_oracle`;

async function main() {
  if (!existsSync(`${KDS1}/prisma/schema.prisma`)) throw new Error(`KDS1 tidak ditemukan di ${KDS1}`);
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) throw new Error("Oracle KDS1 hanya boleh memakai PostgreSQL lokal.");

  const admin = new PrismaClient({ datasourceUrl: `postgresql://${encodeURIComponent(pengguna)}:${encodeURIComponent(password)}@${host}/postgres` });
  try {
    const ada = await admin.$queryRawUnsafe<{ n: number }[]>(`SELECT 1 AS n FROM pg_database WHERE datname = 'kds1_oracle'`);
    if (ada.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE kds1_oracle ENCODING 'UTF8'`);
      console.log("Database kds1_oracle dibuat.");
    } else console.log("Database kds1_oracle sudah ada.");
  } finally {
    await admin.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: URL_KDS1_ORACLE, DATABASE_URL_UNPOOLED: URL_KDS1_ORACLE };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: KDS1, env, stdio: "inherit", shell: true });
  console.log("Migrasi KDS1 diterapkan ke kds1_oracle.");
}
main();
