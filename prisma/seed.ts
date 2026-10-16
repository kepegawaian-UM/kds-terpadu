import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import jenisPegawai from "./seed-data/jenisPegawai.json";
import statusKepegawaian from "./seed-data/statusKepegawaian.json";
import golongan from "./seed-data/golongan.json";
import jabatanFungsionalDosen from "./seed-data/jabatanFungsionalDosen.json";
import jabatanFungsionalTendik from "./seed-data/jabatanFungsionalTendik.json";
import jabatanFungsiUmumPelaksana from "./seed-data/jabatanFungsiUmumPelaksana.json";
import jabatanTambahanRole from "./seed-data/jabatanTambahanRole.json";
import unitInduk from "./seed-data/unitInduk.json";
import unitAsal from "./seed-data/unitAsal.json";
import programStudi from "./seed-data/programStudi.json";
import kategoriAkademisiLuar from "./seed-data/kategoriAkademisiLuar.json";
import komponenKehadiran from "./seed-data/komponenKehadiran.json";
import tambahanTerpadu from "./seed-data/tambahanTerpadu.json";

const prisma = new PrismaClient();

// Upsert per baris: dataset master kecil (maks ~220 baris), idempoten, dan urutannya mengikuti
// dependensi FK (unit induk sebelum unit asal, unit asal sebelum program studi, dst).
async function main() {
  for (const row of jenisPegawai) {
    await prisma.jenisPegawai.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of statusKepegawaian) {
    await prisma.statusKepegawaian.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of golongan) {
    await prisma.golongan.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of jabatanFungsionalDosen) {
    await prisma.jabatanFungsionalDosen.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of jabatanFungsionalTendik) {
    await prisma.jabatanFungsionalTendik.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of jabatanFungsiUmumPelaksana) {
    await prisma.jabatanFungsiUmumPelaksana.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of tambahanTerpadu.jabatanFungsiUmumPelaksana) {
    await prisma.jabatanFungsiUmumPelaksana.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of jabatanTambahanRole) {
    await prisma.jabatanTambahanRole.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of unitInduk) {
    await prisma.unitInduk.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of unitAsal) {
    await prisma.unitAsal.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of programStudi) {
    await prisma.programStudi.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of kategoriAkademisiLuar) {
    await prisma.kategoriAkademisiLuar.upsert({ where: { kode: row.kode }, create: row, update: row });
  }
  for (const row of komponenKehadiran) {
    await prisma.komponenKehadiran.upsert({ where: { kode: row.kode }, create: row, update: row });
  }

  // Akun admin: email & kata sandi WAJIB dari environment (.env lokal / pengaturan hosting),
  // tidak pernah ditulis di kode. Tanpa keduanya, master tetap di-seed tapi akun dilewati.
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email },
      create: { email, nama: "Admin SDM", passwordHash },
      update: {}, // jangan menimpa kata sandi yang sudah diganti
    });
    console.log(`Akun admin siap: ${email}`);
  } else {
    console.warn("SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD kosong - akun admin tidak dibuat.");
  }

  console.log("Seed selesai.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
