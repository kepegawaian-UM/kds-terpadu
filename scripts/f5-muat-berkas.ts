/**
 * F5: memproses satu berkas mentah SIMPEGA ke database kds_f5 lewat layanan Standarisasi yang sama dengan halaman aplikasi
 * (periksaStandarisasi/simpanStandarisasi). HANYA kds_f5 (menolak database lain). Mengganti snapshot Nominatif bulan itu di kds_f5.
 * Hanya angka agregat yang dicetak. Cara lain yang setara: jalankan aplikasi dengan DATABASE_URL ke kds_f5 dan pakai halaman Standarisasi.
 *   npx tsx scripts/f5-muat-berkas.ts "<berkas.xlsx>" <bulan> <tahun>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { PrismaClient } from "@prisma/client";

import { simpanStandarisasi } from "../lib/standarisasi/proses";

const [, , jalur, bulanStr, tahunStr] = process.argv;
const url = process.env.F5_DATABASE_URL ?? "";
if (!/\/kds_f5(\?|$)/.test(url)) throw new Error("F5_DATABASE_URL harus menunjuk database lokal kds_f5 (jalankan scripts/f5-siapkan-db.ts).");
if (!jalur || !Number(bulanStr) || !Number(tahunStr)) throw new Error('Pakai: npx tsx scripts/f5-muat-berkas.ts "<berkas.xlsx>" <bulan> <tahun>');
const prisma = new PrismaClient({ datasourceUrl: url });

async function main() {
  const pengguna = await prisma.user.findFirst({ select: { id: true, nama: true }, orderBy: { id: "asc" } });
  const mulai = performance.now();
  const r = await simpanStandarisasi(prisma, readFileSync(jalur), basename(jalur), { bulan: Number(bulanStr), tahun: Number(tahunStr) }, { id: pengguna?.id ?? null, nama: pengguna?.nama ?? "F5" });
  console.log(`Batch ${r.batchId}: berhasil ${r.ringkasan.berhasil}, perlu Review ${r.ringkasan.perluReview} (${((performance.now() - mulai) / 1000).toFixed(1)} dtk). Menimpa ${r.ringkasan.akanMenimpa} baris lama di kds_f5.`);
}

main().finally(() => prisma.$disconnect());
