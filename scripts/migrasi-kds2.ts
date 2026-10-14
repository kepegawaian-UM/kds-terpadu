/**
 * Migrasi data domain MySQL `kds2_produksi` -> PostgreSQL (`KDS2_SALINAN_DATABASE_URL`).
 *
 *   npx tsx scripts/migrasi-kds2.ts --dry-run   # jalankan penuh lalu BATALKAN (tidak menyimpan)
 *   npx tsx scripts/migrasi-kds2.ts             # migrasi sungguhan (target harus kosong)
 *   npx tsx scripts/migrasi-kds2.ts --ganti     # kosongkan data domain target lalu migrasi ulang
 *
 * Target dipaksa database berakhiran "_paritas" (salinan data asli, hanya lokal). MySQL hanya dibaca.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { bukaKds2BacaSaja } from "./kds2-mysql";
import { jalankanMigrasi } from "./migrasi/migrasi";
import { sumberMysql } from "./migrasi/sumber";

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = process.env.KDS2_SALINAN_DATABASE_URL;
  if (!url) throw new Error("KDS2_SALINAN_DATABASE_URL belum diisi di .env (jalankan scripts/siapkan-db-lokal.ts).");
  const u = new URL(url);
  const nama = u.pathname.replace("/", "");
  if (!nama.endsWith("_paritas")) {
    throw new Error(`Target "${nama}" ditolak: nama database harus berakhiran _paritas.`);
  }

  const dryRun = args.has("--dry-run");
  const ganti = args.has("--ganti");
  console.log(`Target : ${u.hostname}:${u.port || 5432}/${nama}`);
  console.log(`Mode   : ${dryRun ? "DRY-RUN (dibatalkan di akhir)" : "SUNGGUHAN"}${ganti ? " + ganti" : ""}`);

  const prisma = new PrismaClient({ datasourceUrl: url });
  const kds2 = await bukaKds2BacaSaja();
  try {
    const lap = await jalankanMigrasi({ prisma, sumber: sumberMysql(kds2), dryRun, ganti, lapor: console.log });
    console.log("\nRingkasan:");
    for (const t of lap.tabel) console.log(`  ${t.mysql.padEnd(38)} ${String(t.ditulis).padStart(8)} baris`);
    console.log(`Selesai dalam ${(lap.durasiMs / 1000).toFixed(1)} detik${lap.dryRun ? " (DRY-RUN: tidak ada yang disimpan)" : ""}.`);
    if (!lap.dryRun) console.log("Langkah berikut: npx tsx scripts/verifikasi-migrasi.ts");
  } finally {
    await kds2.tutup();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nGAGAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
