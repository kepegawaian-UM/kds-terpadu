/**
 * Mengukur waktu hitung semua laporan F3 terhadap `kds_paritas` (data asli, lokal): terbaik dari 5 kali
 * jalan setelah pemanasan, dalam milidetik. Hanya lapisan data (kueri + agregasi + penyusunan hasil);
 * waktu render halaman dan jaringan tidak termasuk, kecuali baris "xlsx" yang memasukkan penulisan berkas.
 *   npm run ukur-kinerja
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { laporanBelumUpload } from "../lib/laporan/belumUpload";
import { dataDashboard } from "../lib/laporan/dashboard";
import { daftarNominatif, detailNominatif, eksporNominatif } from "../lib/laporan/nominatif";
import { eksporRekapBulanan, laporanRekapBulanan } from "../lib/laporan/rekapBulanan";
import { eksporRekapTahunan, laporanRekapTahunan } from "../lib/laporan/rekapTahunan";
import { statistikDosen, statistikTendik } from "../lib/laporan/statistik";
import { buatXlsx } from "../lib/laporan/xlsx";

const semua = { jenis: [], status: [], keaktifan: "semua" as const };
const aktif = { jenis: [], status: [], keaktifan: "aktif" as const };

type Hasil = { nama: string; ms: number; baris: string };

async function ukur(nama: string, f: () => Promise<unknown>, ulang = 5): Promise<Hasil> {
  await f(); // pemanasan (koneksi, JIT)
  let terbaik = Infinity;
  let hasil: unknown;
  for (let i = 0; i < ulang; i++) {
    const t0 = performance.now();
    hasil = await f();
    terbaik = Math.min(terbaik, performance.now() - t0);
  }
  const h = hasil as Record<string, unknown> | unknown[] | undefined;
  const daftar = Array.isArray(h) ? h : (h?.baris ?? h?.rows ?? h?.belum ?? h?.laporan ?? h?.statistik);
  return { nama, ms: Math.round(terbaik), baris: Array.isArray(daftar) ? String(daftar.length) : "-" };
}

async function main() {
  const url = process.env.PARITAS_DATABASE_URL;
  if (!url) throw new Error("PARITAS_DATABASE_URL belum diisi di .env");
  const db = new PrismaClient({ datasourceUrl: url });

  const hasil: Hasil[] = [];
  hasil.push(await ukur("Nominatif: daftar Okt 2026", () => daftarNominatif(db, 10, 2026)));
  hasil.push(
    await ukur("Nominatif: detail satu pegawai", async () => {
      const id = (await db.nominatifBulanan.findFirstOrThrow({ where: { bulan: 10, tahun: 2026 }, select: { id: true } })).id;
      return detailNominatif(db, id);
    })
  );
  hasil.push(await ukur("Nominatif: data ekspor Okt 2026", () => eksporNominatif(db, 10, 2026)));
  hasil.push(await ukur("Belum Ada Rekap: Okt 2026 (semua belum)", () => laporanBelumUpload(db, 10, 2026)));
  hasil.push(await ukur("Rekap Bulanan: Sep 2026 (aktif)", () => laporanRekapBulanan(db, 9, 2026, aktif)));
  hasil.push(await ukur("Rekap Bulanan: Sep 2026 (semua)", () => laporanRekapBulanan(db, 9, 2026, semua)));
  hasil.push(await ukur("Rekap Bulanan: data ekspor Sep 2026", () => eksporRekapBulanan(db, 9, 2026, aktif)));
  hasil.push(await ukur("Rekap Tahunan: 2026 (aktif)", () => laporanRekapTahunan(db, 2026, aktif)));
  hasil.push(await ukur("Rekap Tahunan: 2026 (semua)", () => laporanRekapTahunan(db, 2026, semua)));
  hasil.push(await ukur("Rekap Tahunan: data ekspor 2026", () => eksporRekapTahunan(db, 2026, aktif)));
  hasil.push(await ukur("Statistik Dosen: Okt 2026", () => statistikDosen(db, 10, 2026)));
  hasil.push(await ukur("Statistik Tendik: Okt 2026", () => statistikTendik(db, 10, 2026)));
  hasil.push(await ukur("Dashboard: bawaan (pegawai + kinerja)", () => dataDashboard(db, {})));
  hasil.push(
    await ukur(
      "Ekspor + penulisan xlsx: Rekap Tahunan 2026",
      async () => {
        const e = await eksporRekapTahunan(db, 2026, aktif);
        await buatXlsx(e.headings, e.rows);
        return e;
      },
      3
    )
  );
  hasil.push(
    await ukur(
      "Ekspor + penulisan xlsx: Rekap Bulanan Sep 2026",
      async () => {
        const e = await eksporRekapBulanan(db, 9, 2026, aktif);
        await buatXlsx(e.headings, e.rows);
        return e;
      },
      3
    )
  );

  console.log("| Laporan | Waktu (ms) | Baris |\n|---|---:|---:|");
  for (const h of hasil) console.log(`| ${h.nama} | ${h.ms} | ${h.baris} |`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
