/** Pemeriksaan awal sebelum menulis ke Neon: nama variabel yang ada, nama server/database (tanpa rahasia), wilayah, dan apakah database masih kosong (hanya membaca). */
import { PrismaClient } from "@prisma/client";

import { bacaEnvNeon, ringkasAlamat } from "./env-neon";

async function main() {
  const env = bacaEnvNeon();
  const wajib = ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"];
  console.log("Variabel ada:", wajib.map((k) => `${k}=${env[k] ? "ya" : "TIDAK"}`).join(", "), "| AUTH_SECRET:", env.AUTH_SECRET ? "ya" : "belum");
  const pool = ringkasAlamat(env.DATABASE_URL);
  const langsung = ringkasAlamat(env.DATABASE_URL_UNPOOLED);
  console.log("DATABASE_URL          :", pool.ok ? `${pool.host} / db=${pool.database} / pooler=${pool.pooler} / wilayah=${pool.wilayah}` : `BERMASALAH (${pool.masalah})`);
  console.log("DATABASE_URL_UNPOOLED :", langsung.ok ? `${langsung.host} / db=${langsung.database} / pooler=${langsung.pooler} / wilayah=${langsung.wilayah}` : `BERMASALAH (${langsung.masalah})`);
  const masalah: string[] = [];
  for (const k of wajib) if (!env[k]) masalah.push(`${k} kosong`);
  if (pool.ok && !pool.pooler) masalah.push("DATABASE_URL seharusnya alamat POOLING (memuat -pooler)");
  if (langsung.ok && langsung.pooler) masalah.push("DATABASE_URL_UNPOOLED seharusnya alamat TANPA pooling (tanpa -pooler)");
  for (const [n, r] of [["DATABASE_URL", pool], ["DATABASE_URL_UNPOOLED", langsung]] as const) {
    if (r.ok && !r.host?.endsWith(".neon.tech")) masalah.push(`${n} bukan server Neon`);
    if (r.ok && r.wilayah !== "ap-southeast-1") masalah.push(`${n} bukan wilayah Singapura (ap-southeast-1): ${r.wilayah ?? "tidak terbaca"}`);
  }
  if (env.SEED_ADMIN_PASSWORD && !(env.SEED_ADMIN_PASSWORD.length >= 12 && /[A-Za-z]/.test(env.SEED_ADMIN_PASSWORD) && /\d/.test(env.SEED_ADMIN_PASSWORD))) masalah.push("SEED_ADMIN_PASSWORD harus minimal 12 karakter dan memuat huruf dan angka");
  if (env.SEED_ADMIN_EMAIL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.SEED_ADMIN_EMAIL)) masalah.push("SEED_ADMIN_EMAIL bukan alamat email");
  if (masalah.length > 0) {
    console.log("\nBERHENTI, ada masalah:\n- " + masalah.join("\n- "));
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL_UNPOOLED });
  try {
    const t = await prisma.$queryRawUnsafe<{ n: number }[]>("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    console.log(`\nTabel di database Neon sekarang: ${t[0].n} (harapan 0 = database kosong)`);
    if (t[0].n !== 0) {
      console.log("BERHENTI: database Neon tidak kosong. Tidak ada yang diubah.");
      process.exit(1);
    }
    console.log("PEMERIKSAAN LULUS: Neon Singapura, alamat benar, database kosong.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Gagal:", e instanceof Error ? e.message.split("\n").slice(-2).join(" ").slice(0, 200) : e);
  process.exit(1);
});
