/**
 * Membandingkan MySQL `kds2_produksi` dengan PostgreSQL `KDS2_SALINAN_DATABASE_URL` baris demi baris.
 * Keluar dengan kode 1 bila ada perbedaan. Laporan hanya angka (tanpa isi baris).
 *   npx tsx scripts/verifikasi-migrasi.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { bukaKds2BacaSaja } from "./kds2-mysql";
import { jalankanVerifikasi } from "./migrasi/verifikasi";

async function main() {
  const url = process.env.KDS2_SALINAN_DATABASE_URL;
  if (!url) throw new Error("KDS2_SALINAN_DATABASE_URL belum diisi di .env.");
  const prisma = new PrismaClient({ datasourceUrl: url });
  const kds2 = await bukaKds2BacaSaja();
  try {
    const lap = await jalankanVerifikasi(prisma, kds2);
    console.log("TABEL".padEnd(38), "SUMBER".padStart(8), "TARGET".padStart(8), "HILANG", "LEBIH", " BEDA", " STATUS");
    for (const t of lap.tabel) {
      console.log(
        t.tabel.padEnd(38),
        String(t.sumber).padStart(8),
        String(t.target).padStart(8),
        String(t.hilang).padStart(6),
        String(t.berlebih).padStart(5),
        String(t.beda).padStart(5),
        t.ok ? " OK" : ` GAGAL ${t.kolomBeda.join(",")} id:${t.contohId.join(",")}`
      );
    }
    console.log("\nCEK AGREGAT");
    for (const c of lap.cek) console.log(`${c.ok ? "OK   " : "GAGAL"} ${c.nama}: ${c.detail}`);
    console.log(`\nHASIL: ${lap.ok ? "SEMUA COCOK" : "ADA PERBEDAAN"}`);
    process.exitCode = lap.ok ? 0 : 1;
  } finally {
    await kds2.tutup();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("GAGAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
