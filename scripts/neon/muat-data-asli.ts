/**
 * Memuat data domain asli dari salinan kerja lokal (kds_paritas, sudah dikoreksi) ke Neon Singapura. Lihat docs/12-rencana-muat-data-asli.md.
 *
 *   npx tsx scripts/neon/muat-data-asli.ts --dry-run    -> menjalankan semuanya di Neon lalu MEMBATALKAN transaksi (Neon tetap kosong); mengukur waktu
 *   npx tsx scripts/neon/muat-data-asli.ts --ya         -> memuat sungguhan (satu transaksi), lalu verifikasi otomatis
 *   npx tsx scripts/neon/muat-data-asli.ts --verifikasi -> hanya membandingkan Neon dengan sumber (tanpa menulis)
 *
 * Pengaman: sumber dipaksa kds_paritas; tujuan dipaksa Neon Singapura (alamat langsung, db neondb) dari .env.neon; tujuan harus KOSONG (tidak pernah menimpa);
 * tepat satu mode harus dipilih. Hanya angka yang dicetak (tidak ada NIP atau nama).
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { muatData, verifikasiSalinan } from "../../lib/muat/salinData";
import { bacaEnvNeon, ringkasAlamat } from "./env-neon";

const mode = ["--dry-run", "--ya", "--verifikasi"].filter((m) => process.argv.includes(m));
if (mode.length !== 1) throw new Error("Pilih TEPAT satu mode: --dry-run, --ya, atau --verifikasi.");

const urlSumber = process.env.PARITAS_DATABASE_URL ?? "";
if (!/\/kds_paritas(\?|$)/.test(urlSumber)) throw new Error("PARITAS_DATABASE_URL harus menunjuk database lokal kds_paritas.");
const env = bacaEnvNeon();
const r = ringkasAlamat(env.DATABASE_URL_UNPOOLED);
if (!r.ok || r.pooler || r.wilayah !== "ap-southeast-1" || !r.host?.endsWith(".neon.tech") || r.database !== "neondb") throw new Error("DATABASE_URL_UNPOOLED di .env.neon bukan alamat langsung Neon Singapura (neondb).");

const sumber = new PrismaClient({ datasourceUrl: urlSumber });
const tujuan = new PrismaClient({ datasourceUrl: env.DATABASE_URL_UNPOOLED });
const mb = (b: bigint | number) => (Number(b) / 1048576).toFixed(1);

async function cetakVerifikasi(): Promise<boolean> {
  const v = await verifikasiSalinan(sumber, tujuan);
  console.log("\nTABEL".padEnd(40), "SUMBER".padStart(9), "NEON".padStart(9), "STATUS");
  for (const x of v) console.log(x.tabel.padEnd(39), String(x.jumlahSumber).padStart(9), String(x.jumlahTujuan).padStart(9), x.sama ? "IDENTIK" : "BEDA");
  const semua = v.every((x) => x.sama);
  console.log(semua ? "\nVERIFIKASI: SEMUA TABEL IDENTIK (jumlah dan sidik jari seluruh baris)." : "\nVERIFIKASI GAGAL: ada tabel yang berbeda.");
  return semua;
}

async function main() {
  console.log(`Sumber : kds_paritas (lokal) | Tujuan : ${r.host} / ${r.database}`);
  if (mode[0] === "--verifikasi") {
    process.exitCode = (await cetakVerifikasi()) ? 0 : 1;
    return;
  }
  const pengguna = await tujuan.user.findMany({ select: { id: true, email: true } });
  if (pengguna.length !== 1) throw new Error(`Neon harus punya tepat satu akun admin (ada ${pengguna.length}).`);
  const lap = await muatData({ sumber, tujuan, adminTujuanId: pengguna[0].id, dryRun: mode[0] === "--dry-run", lapor: (p) => process.stdout.write(`\r${p.padEnd(60)}`) });
  console.log(`\n\n${lap.dryRun ? "DRY-RUN (dibatalkan)" : "PEMUATAN SUNGGUHAN"} selesai dalam ${(lap.durasiMs / 1000).toFixed(1)} detik.`);
  for (const t of lap.tabel) console.log(`  ${t.tabel.padEnd(38)} ${String(t.ditulis).padStart(9)} baris`);
  console.log(`  TOTAL ${lap.tabel.reduce((a, b) => a + b.ditulis, 0)} baris`);
  if (lap.dryRun) {
    const sisa = await tujuan.pegawai.count();
    console.log(`Neon setelah dry-run: pegawai=${sisa} (harapan 0: tidak ada yang tersimpan).`);
    process.exitCode = sisa === 0 ? 0 : 1;
    return;
  }
  const [u] = await tujuan.$queryRawUnsafe<{ ukuran: bigint }[]>("SELECT pg_database_size(current_database()) AS ukuran");
  console.log(`Ukuran database Neon sekarang: ${mb(u.ukuran)} MB (batas gratis 512 MB)`);
  process.exitCode = (await cetakVerifikasi()) ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("\nBERHENTI:", e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sumber.$disconnect();
    await tujuan.$disconnect();
  });
