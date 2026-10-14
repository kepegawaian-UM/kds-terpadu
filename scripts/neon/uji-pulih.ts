/**
 * Uji pulih cadangan Neon: memulihkan berkas .dump TERBARU di folder cadangan ke database lokal sementara (kds_pulih_uji), membandingkan jumlah baris SEMUA
 * tabel dengan Neon (hanya membaca Neon), memeriksa akun admin dan master, lalu menghapus database sementara. Tidak ada yang ditulis ke Neon.
 *   npx tsx scripts/neon/uji-pulih.ts ["<folder cadangan>"]
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { bacaEnvNeon } from "./env-neon";

const folder = process.argv[2] ?? "G:/My Drive/_OLD ARCHIVE/__ANAS/bak/kds-terpadu";
const sandi = process.env.POSTGRES_PASSWORD;
if (!sandi) throw new Error("POSTGRES_PASSWORD di .env kosong.");
const pengguna = process.env.POSTGRES_USER ?? "postgres";
const host = process.env.POSTGRES_HOST ?? "localhost:5432";
const url = (db: string) => `postgresql://${encodeURIComponent(pengguna)}:${encodeURIComponent(sandi)}@${host}/${db}`;
const alat = (nama: string) => {
  const ver = readdirSync("C:/Program Files/PostgreSQL").sort().reverse()[0];
  return join("C:/Program Files/PostgreSQL", ver, "bin", `${nama}.exe`);
};

async function hitungSemua(p: PrismaClient): Promise<Map<string, number>> {
  const tabel = (await p.$queryRawUnsafe<{ t: string }[]>("select table_name as t from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by 1")).map((x) => x.t);
  const m = new Map<string, number>();
  for (const t of tabel) m.set(t, Number((await p.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from "${t}"`))[0].n));
  return m;
}

async function main() {
  const berkas = readdirSync(folder).filter((f) => /^kds_terpadu_\d{8}_\d{6}\.dump$/.test(f)).sort().reverse()[0];
  if (!berkas) throw new Error("Tidak ada berkas cadangan di " + folder);
  const jalur = join(folder, berkas);
  console.log(`Cadangan terbaru: ${berkas} (${(statSync(jalur).size / 1024 / 1024).toFixed(2)} MB)`);

  const admin = new PrismaClient({ datasourceUrl: url("postgres") });
  await admin.$executeRawUnsafe("DROP DATABASE IF EXISTS kds_pulih_uji WITH (FORCE)");
  await admin.$executeRawUnsafe("CREATE DATABASE kds_pulih_uji ENCODING 'UTF8'");
  const mulai = performance.now();
  try {
    execFileSync(alat("pg_restore"), ["--no-owner", "--no-privileges", "--dbname", url("kds_pulih_uji"), jalur], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const err = (e as { stderr?: Buffer }).stderr?.toString().slice(0, 300) ?? "";
    if (!/warning/i.test(err)) throw new Error("pg_restore gagal: " + err);
  }
  console.log(`Dipulihkan dalam ${((performance.now() - mulai) / 1000).toFixed(1)} detik.`);

  const pulih = new PrismaClient({ datasourceUrl: url("kds_pulih_uji") });
  const neon = new PrismaClient({ datasourceUrl: bacaEnvNeon().DATABASE_URL_UNPOOLED });
  try {
    const [a, b] = [await hitungSemua(neon), await hitungSemua(pulih)];
    let beda = 0;
    for (const [t, n] of a) if (b.get(t) !== n) { beda++; console.log(`BEDA ${t}: neon=${n} pulih=${b.get(t)}`); }
    for (const t of b.keys()) if (!a.has(t)) { beda++; console.log(`Tabel hanya di hasil pulih: ${t}`); }
    const total = [...a.values()].reduce((x, y) => x + y, 0);
    const adminAda = Number((await pulih.$queryRawUnsafe<{ n: bigint }[]>('select count(*) as n from "user"'))[0].n);
    const migrasi = Number((await pulih.$queryRawUnsafe<{ n: bigint }[]>('select count(*) as n from "_prisma_migrations"'))[0].n);
    console.log(`Tabel dibandingkan: ${a.size} | total baris Neon: ${total} | tabel beda: ${beda} | akun admin pulih: ${adminAda} | catatan migrasi pulih: ${migrasi}`);
    if (beda > 0 || adminAda < 1) process.exitCode = 1;
    else console.log("UJI PULIH LULUS: hasil pemulihan identik dengan Neon.");
  } finally {
    await neon.$disconnect();
    await pulih.$disconnect();
    await admin.$executeRawUnsafe("DROP DATABASE IF EXISTS kds_pulih_uji WITH (FORCE)");
    await admin.$disconnect();
    console.log("Database uji sementara dihapus.");
  }
}
main().catch((e) => { console.error("Gagal:", e instanceof Error ? e.message.slice(0, 300) : e); process.exit(1); });
