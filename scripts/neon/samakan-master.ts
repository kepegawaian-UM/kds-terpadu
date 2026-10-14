/**
 * Menyamakan master Neon dengan salinan kerja lokal (kds_paritas): menambahkan unit kerja yang ada di lokal tetapi belum di Neon (unit asrama dari KDS1,
 * keputusan pengguna 14 Okt 2026) dengan KODE yang sama, lalu membuktikan semua tabel master identik. Hanya data master (bukan data pegawai).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { bacaEnvNeon } from "./env-neon";

const env = bacaEnvNeon();
const lokalUrl = process.env.PARITAS_DATABASE_URL ?? "";
if (!/\/kds_paritas(\?|$)/.test(lokalUrl)) throw new Error("PARITAS_DATABASE_URL harus kds_paritas.");
if (!/\.ap-southeast-1\.aws\.neon\.tech\//.test(env.DATABASE_URL_UNPOOLED ?? "")) throw new Error("DATABASE_URL_UNPOOLED di .env.neon bukan Neon Singapura.");
const lokal = new PrismaClient({ datasourceUrl: lokalUrl });
const neon = new PrismaClient({ datasourceUrl: env.DATABASE_URL_UNPOOLED });

const TABEL = ["mst_jenis_pegawai", "mst_status_kepegawaian", "mst_golongan", "mst_jabatan_fungsional_dosen", "mst_jabatan_fungsional_tendik", "mst_jabatan_fungsi_umum_pelaksana", "mst_kategori_akademisi_luar", "mst_unit_induk", "mst_unit_asal", "mst_program_studi", "mst_jabatan_tambahan_role", "mst_komponen_kehadiran"];
const ambil = async (p: PrismaClient, t: string) => (await p.$queryRawUnsafe<Record<string, unknown>[]>(`select * from ${t} order by 1`)).map((r) => JSON.stringify(r));

async function main() {
  const unitLokal = await lokal.unitAsal.findMany();
  const kodeNeon = new Set((await neon.unitAsal.findMany({ select: { kode: true } })).map((u) => u.kode));
  const tambah = unitLokal.filter((u) => !kodeNeon.has(u.kode));
  console.log(`Unit kerja di lokal yang belum ada di Neon: ${tambah.length}${tambah.length ? " -> " + tambah.map((u) => `${u.kode} ${u.nama}`).join(" | ") : ""}`);
  if (tambah.length > 0) {
    const induk = new Set((await neon.unitInduk.findMany({ select: { kode: true } })).map((u) => u.kode));
    for (const u of tambah) if (!induk.has(u.unitIndukKode)) throw new Error(`Unit induk ${u.unitIndukKode} tidak ada di Neon.`);
    await neon.unitAsal.createMany({ data: tambah.map((u) => ({ kode: u.kode, nama: u.nama, unitIndukKode: u.unitIndukKode })) });
    console.log("Ditambahkan ke Neon.");
  }
  let semuaSama = true;
  for (const t of TABEL) {
    const [a, b] = [await ambil(lokal, t), await ambil(neon, t)];
    const sama = a.length === b.length && a.every((x, i) => x === b[i]);
    if (!sama) semuaSama = false;
    console.log(`${t.padEnd(38)} lokal=${String(a.length).padStart(4)} neon=${String(b.length).padStart(4)} ${sama ? "IDENTIK" : "BEDA"}`);
  }
  console.log(semuaSama ? "\nSEMUA TABEL MASTER IDENTIK." : "\nADA TABEL MASTER YANG BEDA.");
  const data = await neon.$queryRawUnsafe<{ n: number }[]>(`select (select count(*) from nominatif_bulanan)::int + (select count(*) from pegawai)::int + (select count(*) from rekap_kehadiran_bulanan)::int as n`);
  console.log(`Baris data pegawai di Neon (harapan 0): ${data[0].n}`);
  if (!semuaSama || data[0].n !== 0) process.exit(1);
}
main().catch((e) => { console.error("Gagal:", e instanceof Error ? e.message.slice(0, 250) : e); process.exit(1); }).finally(async () => { await lokal.$disconnect(); await neon.$disconnect(); });
