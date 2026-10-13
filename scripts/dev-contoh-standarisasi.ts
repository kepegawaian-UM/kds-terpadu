/**
 * Mengisi database LOKAL kds_dev dengan satu batch Standarisasi SINTETIS (tanpa data pegawai asli) supaya halaman Standarisasi
 * bisa dicoba di browser. Menolak berjalan terhadap database selain kds_dev. Pakai: npx tsx scripts/dev-contoh-standarisasi.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { simpanStandarisasi } from "../lib/standarisasi/proses";
import { buatBerkasRaw } from "../tests/support/rawSimpega";

const url = process.env.DATABASE_URL ?? "";
if (!/\/kds_dev(\?|$)/.test(url)) throw new Error("Hanya boleh terhadap database lokal kds_dev.");
const prisma = new PrismaClient();

async function main() {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  const vocab = {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()), umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama), status: await prisma.statusKepegawaian.findMany(),
    role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole), prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
  const { buffer } = await buatBerkasRaw({ vocab, bulan: 10, tahun: 2026, jumlah: 60, benih: 5, tanpaPlaceholder: true });
  const r = await simpanStandarisasi(prisma, buffer, "contoh-sintetis.xlsx", { bulan: 10, tahun: 2026 }, { id: null, nama: "Contoh Sintetis" });
  console.log(`Batch ${r.batchId}: ${r.ringkasan.berhasil} berhasil, ${r.ringkasan.perluReview} perlu review.`);
}

main().finally(() => prisma.$disconnect());
