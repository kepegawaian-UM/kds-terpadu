/**
 * Menghapus SEMUA data domain di Neon (pegawai, nominatif, rekap, batch, baris bermasalah, catatan, koreksi, audit) setelah uji dengan data sintetis,
 * dan membuktikan jumlahnya kembali 0 dengan akun admin dan master tetap utuh. HANYA untuk tahap uji (sebelum data asli); menolak berjalan tanpa --ya.
 */
import { PrismaClient } from "@prisma/client";

import { kosongkanDomain } from "../migrasi/migrasi";
import { TABEL_DOMAIN } from "../migrasi/tabel";
import { bacaEnvNeon } from "./env-neon";

const env = bacaEnvNeon();
if (!process.argv.includes("--ya")) throw new Error("Tambahkan --ya untuk menghapus data domain di Neon (hanya tahap uji).");
if (!/\.ap-southeast-1\.aws\.neon\.tech\//.test(env.DATABASE_URL_UNPOOLED ?? "")) throw new Error("DATABASE_URL_UNPOOLED bukan Neon Singapura.");
const neon = new PrismaClient({ datasourceUrl: env.DATABASE_URL_UNPOOLED });
const hitung = async (t: string) => Number((await neon.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from "${t}"`))[0].n);
const TAMBAHAN = ["baris_bermasalah", "catatan_perubahan_batch", "upload_chunk", "koreksi_tanggal_mulai_kerja", "kamus_koreksi"];
const DOMAIN = [...TABEL_DOMAIN.map((t) => t.pgTabel), ...TAMBAHAN];

async function main() {
  const sebelum = Object.fromEntries(await Promise.all(DOMAIN.map(async (t) => [t, await hitung(t)] as const)));
  console.log("Sebelum:", Object.entries(sebelum).filter(([, n]) => n > 0).map(([t, n]) => `${t}=${n}`).join(", ") || "(kosong)");
  const kamusAwal = sebelum.kamus_koreksi;
  await neon.$transaction(async (tx) => {
    await kosongkanDomain(tx);
    await tx.$executeRawUnsafe('TRUNCATE TABLE "upload_chunk"');
  });
  const sesudah = Object.fromEntries(await Promise.all(DOMAIN.map(async (t) => [t, await hitung(t)] as const)));
  const sisa = Object.entries(sesudah).filter(([, n]) => n > 0);
  const admin = await hitung("user");
  const master = await hitung("mst_unit_asal");
  console.log("Sesudah :", sisa.length ? sisa.map(([t, n]) => `${t}=${n}`).join(", ") : "semua tabel domain = 0");
  console.log(`Akun admin tetap: ${admin} | master unit kerja tetap: ${master} | kamus tidak berubah: ${sesudah.kamus_koreksi === kamusAwal}`);
  if (sisa.length > 0 || admin !== 1 || master !== 218) process.exit(1);
  console.log("BERSIH: Neon kembali tanpa data pegawai.");
}
main().catch((e) => { console.error("Gagal:", e instanceof Error ? e.message.slice(0, 250) : e); process.exit(1); }).finally(() => neon.$disconnect());
