/**
 * Uji Standarisasi dengan berkas mentah SIMPEGA ASLI, HANYA-BACA terhadap kds_paritas (salinan data asli lokal): mengklasifikasi berkas
 * (klasifikasiBerkas, tanpa menulis apa pun), mengukur waktu, lalu membandingkan hasilnya dengan snapshot Nominatif bulan itu yang sudah
 * ada di kds_paritas (data KDS2). Hanya angka agregat yang dicetak: tidak ada NIP, nama, atau isi baris.
 *
 *   npx tsx scripts/uji-berkas-asli.ts "<berkas.xlsx>" <bulan> <tahun>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { klasifikasiBerkas } from "../lib/standarisasi/proses";

const [, , jalur, bulanStr, tahunStr] = process.argv;
const bulan = Number(bulanStr);
const tahun = Number(tahunStr);
const url = process.env.PARITAS_DATABASE_URL ?? "";
if (!/\/kds_paritas(\?|$)/.test(url)) throw new Error("PARITAS_DATABASE_URL harus menunjuk database lokal kds_paritas.");
if (!jalur || !bulan || !tahun) throw new Error('Pakai: npx tsx scripts/uji-berkas-asli.ts "<berkas.xlsx>" <bulan> <tahun>');
const prisma = new PrismaClient({ datasourceUrl: url });

const PERSEN = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);

async function main() {
  const buffer = readFileSync(jalur);
  const mulai = performance.now();
  const h = await klasifikasiBerkas(prisma, buffer, bulan, tahun);
  const detik = ((performance.now() - mulai) / 1000).toFixed(1);
  console.log(`Berkas ${(buffer.length / 1024 / 1024).toFixed(1)} MB | diklasifikasi dalam ${detik} dtk`);
  console.log(`Total baris=${h.jumlahTotal} | berhasil=${h.nominatif.length} | perlu Review=${h.bermasalah.length} | dikecualikan permanen=${h.jumlahDikecualikan}`);
  const alasan = new Map<string, number>();
  for (const b of h.bermasalah) alasan.set(b.alasanUtama, (alasan.get(b.alasanUtama) ?? 0) + 1);
  console.log("Review per alasan:", [...alasan.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(", ") || "-");
  const kolomHilang = Object.entries(h.petaKolom).filter(([, v]) => v === null).map(([k]) => k);
  console.log(`Kolom tidak terdeteksi: ${kolomHilang.join(", ") || "-"}`);

  const snapshot = await prisma.nominatifBulanan.findMany({ where: { bulan, tahun }, include: { jabatanTambahan: true } });
  console.log(`\nSnapshot ${bulan}/${tahun} di kds_paritas (KDS2): ${snapshot.length} baris`);
  if (snapshot.length === 0) return;
  const perNip = new Map(snapshot.map((s) => [s.pegawaiNip, s]));
  const nipHasil = new Set(h.nominatif.map((n) => n.pegawaiNip));
  const nipReview = new Set(h.bermasalah.map((b) => b.nip));
  const diBoth = h.nominatif.filter((n) => perNip.has(n.pegawaiNip));
  console.log(`NIP berhasil yang ada di snapshot KDS2: ${diBoth.length}/${h.nominatif.length} (${PERSEN(diBoth.length, h.nominatif.length)}) | NIP snapshot yang tidak ada di berkas (berhasil+review): ${snapshot.filter((s) => !nipHasil.has(s.pegawaiNip) && !nipReview.has(s.pegawaiNip)).length} | NIP Review yang ada di snapshot: ${[...nipReview].filter((n) => perNip.has(n)).length}/${nipReview.size}`);

  const kolom = ["nama", "jenisKelamin", "jenisPegawaiKode", "statusKepegawaianKode", "golonganKode", "jabatanFungsionalDosenKode", "jabatanFungsionalTendikKode", "jabatanFungsiUmumKode", "kategoriAkademisiLuarKode", "unitAsalKode", "pendidikanTerakhir"] as const;
  for (const k of kolom) {
    let cocok = 0;
    for (const n of diBoth) {
      const a = (n as Record<string, unknown>)[k] ?? null;
      const b = (perNip.get(n.pegawaiNip) as Record<string, unknown>)[k] ?? null;
      if (a === b) cocok++;
    }
    console.log(`  kolom ${k}: sama ${cocok}/${diBoth.length} (${PERSEN(cocok, diBoth.length)})`);
  }
  const tanggal = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  for (const k of ["tanggalLahir", "tanggalMulaiKerja"] as const) {
    let cocok = 0;
    for (const n of diBoth) if (tanggal(n[k] as Date | null) === tanggal(perNip.get(n.pegawaiNip)![k] as Date | null)) cocok++;
    console.log(`  kolom ${k}: sama ${cocok}/${diBoth.length} (${PERSEN(cocok, diBoth.length)})`);
  }
  // jabatan tambahan: banyak slot per pegawai
  const jtHasil = new Map<string, number>();
  for (const j of h.jabatan) { const nip = h.nominatif[j.indeksNominatif].pegawaiNip; jtHasil.set(nip, (jtHasil.get(nip) ?? 0) + 1); }
  let jtSama = 0;
  for (const n of diBoth) if ((jtHasil.get(n.pegawaiNip) ?? 0) === perNip.get(n.pegawaiNip)!.jabatanTambahan.length) jtSama++;
  console.log(`  jumlah slot jabatan tambahan sama: ${jtSama}/${diBoth.length} (${PERSEN(jtSama, diBoth.length)})`);
}

main().finally(() => prisma.$disconnect());
