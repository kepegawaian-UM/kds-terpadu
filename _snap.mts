import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { klasifikasiBerkas } from "./lib/standarisasi/proses";

const SP = "C:/Users/Admin/AppData/Local/Temp/claude/D--ANAS-Project-KDS-Terpadu/74a8ef02-47e4-44ba-90cb-098dc33c6a11/scratchpad";
const mode = process.argv[2]; // "simpan" | "bandingkan"
const db = new PrismaClient({ datasourceUrl: process.env.PARITAS_DATABASE_URL });
const hasil = await klasifikasiBerkas(db, readFileSync(`${SP}/bersih4.xlsx`), 10, 2026);
const role = new Map((await db.jabatanTambahanRole.findMany()).map((r) => [r.kode, r.namaRole]));
const unit = new Map((await db.unitAsal.findMany()).map((r) => [r.kode, r.nama]));
const nipPerIndeks = hasil.nominatif.map((n) => n.pegawaiNip);
const peta: Record<string, string> = {};
for (const n of hasil.nominatif) peta[n.pegawaiNip] = "";
for (const j of hasil.jabatan) peta[nipPerIndeks[j.indeksNominatif]] += `${role.get(j.jabatanTambahanRoleKode)} @ ${j.unitAsalKode ? unit.get(j.unitAsalKode) : (j.programStudiKode ?? "-")} [${j.statusPengangkatan}] ; `;
for (const b of hasil.bermasalah) peta[b.nip] = `REVIEW ${b.alasanUtama}`;
const berkasPeta = `${SP}/jt-baseline.json`;
if (mode === "simpan") {
  writeFileSync(berkasPeta, JSON.stringify(peta));
  console.log("baseline disimpan:", Object.keys(peta).length, "pegawai");
} else if (existsSync(berkasPeta)) {
  const lama = JSON.parse(readFileSync(berkasPeta, "utf8")) as Record<string, string>;
  const beda = Object.keys(peta).filter((k) => peta[k] !== lama[k]);
  console.log("baris yang berubah:", beda.length);
  for (const k of beda) console.log(`  SEBELUM: ${lama[k] || "(tanpa JT)"}\n  SESUDAH: ${peta[k] || "(tanpa JT)"}\n`);
}
await db.$disconnect();
