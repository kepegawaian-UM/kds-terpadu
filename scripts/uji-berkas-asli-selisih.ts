/**
 * Rincian agregat selisih Standarisasi berkas asli vs snapshot KDS2 (hanya-baca, kds_paritas, tanpa NIP/nama): pasangan teks mentah dan
 * kode untuk golongan, jabatan tambahan (jumlah slot), dan tanggal mulai kerja.
 *   npx tsx scripts/uji-berkas-asli-selisih.ts "<berkas.xlsx>" <bulan> <tahun>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { parseRawNominatif } from "../lib/excel/parseRawNominatif";
import { klasifikasiBerkas } from "../lib/standarisasi/proses";

const [, , jalur, bulanStr, tahunStr] = process.argv;
const url = process.env.PARITAS_DATABASE_URL ?? "";
if (!/\/kds_paritas(\?|$)/.test(url)) throw new Error("Harus kds_paritas.");
const prisma = new PrismaClient({ datasourceUrl: url });
const tab = (m: Map<string, number>, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} x${c}`).join(" | ") || "-";
const tambah = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const hari = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "kosong");

async function main() {
  const buf = readFileSync(jalur);
  const h = await klasifikasiBerkas(prisma, buf, Number(bulanStr), Number(tahunStr));
  const mentah = new Map((await parseRawNominatif(buf)).rows.map((r) => [r.nip, r]));
  const snap = new Map((await prisma.nominatifBulanan.findMany({ where: { bulan: Number(bulanStr), tahun: Number(tahunStr) }, include: { jabatanTambahan: true } })).map((s) => [s.pegawaiNip, s]));
  const slotHasil = new Map<number, number>();
  for (const j of h.jabatan) slotHasil.set(j.indeksNominatif, (slotHasil.get(j.indeksNominatif) ?? 0) + 1);
  const gol = new Map<string, number>();
  const jt = new Map<string, number>();
  const tmt = new Map<string, number>();
  for (const [i, n] of h.nominatif.entries()) {
    const s = snap.get(n.pegawaiNip);
    const r = mentah.get(n.pegawaiNip);
    if (!s || !r) continue;
    if (n.golonganKode !== s.golonganKode) tambah(gol, `mentah "${r.golonganPangkatRaw}" -> hasil ${n.golonganKode ?? "kosong"} | KDS2 ${s.golonganKode ?? "kosong"}`);
    const a = slotHasil.get(i) ?? 0;
    if (a !== s.jabatanTambahan.length) tambah(jt, `slot hasil=${a} KDS2=${s.jabatanTambahan.length} (mentah: ${r.jabatanTambahanRaw ? "ada teks" : "kosong"})`);
    if (hari(n.tanggalMulaiKerja) !== hari(s.tanggalMulaiKerja)) tambah(tmt, `hasil ${hari(n.tanggalMulaiKerja)} | KDS2 ${hari(s.tanggalMulaiKerja)}`);
  }
  console.log("Golongan:", tab(gol));
  console.log("Jabatan tambahan:", tab(jt));
  console.log("Tanggal mulai kerja:", tab(tmt));
}
main().finally(() => prisma.$disconnect());
