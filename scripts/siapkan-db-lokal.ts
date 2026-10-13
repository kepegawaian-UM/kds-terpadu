/**
 * Menyiapkan PostgreSQL lokal: membuat database kds_dev & kds_test (bila belum ada), lalu
 * menulis DATABASE_URL, DATABASE_URL_UNPOOLED, TEST_DATABASE_URL ke .env. Membaca
 * POSTGRES_PASSWORD dari .env; kata sandi tidak pernah dicetak.
 * Jalankan: npx tsx scripts/siapkan-db-lokal.ts
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const password = process.env.POSTGRES_PASSWORD;
if (!password) {
  console.error("POSTGRES_PASSWORD di .env masih kosong. Isi dulu, simpan, lalu jalankan ulang.");
  process.exit(1);
}
const pengguna = process.env.POSTGRES_USER ?? "postgres";
const host = process.env.POSTGRES_HOST ?? "localhost:5432";
const url = (db: string) =>
  `postgresql://${encodeURIComponent(pengguna)}:${encodeURIComponent(password)}@${host}/${db}`;

async function main() {
  const admin = new PrismaClient({ datasourceUrl: url("postgres") });
  try {
    for (const db of ["kds_dev", "kds_test"]) {
      const ada = await admin.$queryRawUnsafe<{ n: number }[]>(
        `SELECT 1 AS n FROM pg_database WHERE datname = '${db}'`
      );
      if (ada.length === 0) {
        await admin.$executeRawUnsafe(`CREATE DATABASE ${db} ENCODING 'UTF8'`);
        console.log(`Database ${db} dibuat.`);
      } else {
        console.log(`Database ${db} sudah ada.`);
      }
    }
  } finally {
    await admin.$disconnect();
  }

  const isi: Record<string, string> = {
    DATABASE_URL: url("kds_dev"),
    DATABASE_URL_UNPOOLED: url("kds_dev"),
    TEST_DATABASE_URL: url("kds_test"),
  };
  let env = readFileSync(".env", "utf8");
  for (const [k, v] of Object.entries(isi)) {
    const baris = `${k}="${v}"`;
    env = new RegExp(`^${k}=.*$`, "m").test(env)
      ? env.replace(new RegExp(`^${k}=.*$`, "m"), () => baris)
      : env + `\n${baris}\n`;
  }
  writeFileSync(".env", env);
  console.log(".env diperbarui (DATABASE_URL, DATABASE_URL_UNPOOLED, TEST_DATABASE_URL).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
