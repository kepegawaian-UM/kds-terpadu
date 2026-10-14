/**
 * Membandingkan golongan riwayat KDS1 (Neon, BACA-SAJA) dengan data KDS2 yang ada di kds_paritas, per bulan. Yang dicetak hanya hitungan per bulan
 * dan pasangan KODE golongan teratas; tidak ada NIP atau nama. Data KDS1 hanya dibaca ke memori. Dipakai untuk memutuskan koreksi golongan Non-ASN
 * (SIMPEGA benar, KDS2 satu tingkat lebih rendah; keputusan pengguna 14 Okt 2026).
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { denganKds1 } from "./sambung";

const url = process.env.PARITAS_DATABASE_URL ?? "";
if (!/\/kds_paritas(\?|$)/.test(url)) throw new Error("PARITAS_DATABASE_URL harus menunjuk kds_paritas.");
const pg = new PrismaClient({ datasourceUrl: url });

type BarisKds1 = { nip: string; bulan: number; tahun: number; st: string; gol: string | null };

async function main() {
  const kds1 = await denganKds1((q) =>
    q<BarisKds1>(
      `select n."pegawaiNip" as nip, n."bulan", n."tahun", n."statusKepegawaianKode" as st, n."golonganKode" as gol from nominatif_bulanan n join upload_batch b on b."id" = n."uploadBatchId" where b."status" <> 'Dibatalkan'`,
    ),
  );
  const kategori = new Map((await pg.statusKepegawaian.findMany()).map((s) => [s.kode, s.kategori]));
  const periode = [...new Set(kds1.map((r) => `${r.tahun}-${String(r.bulan).padStart(2, "0")}`))].sort();
  console.log(`KDS1: ${kds1.length} baris di ${periode.length} bulan (${periode[0]} s.d. ${periode[periode.length - 1]})`);
  console.log("bulan   | KDS1 | KDS2 | NIP bersama | Non-ASN beda | ASN beda | hanya KDS1 | hanya KDS2 | pasangan teratas (KDS2 -> KDS1)");

  for (const p of periode) {
    const [tahun, bulan] = p.split("-").map(Number);
    const a = kds1.filter((r) => r.tahun === tahun && r.bulan === bulan);
    const b = await pg.nominatifBulanan.findMany({ where: { tahun, bulan }, select: { pegawaiNip: true, statusKepegawaianKode: true, golonganKode: true } });
    const peta = new Map(b.map((r) => [r.pegawaiNip, r]));
    let bersama = 0, nonAsn = 0, asn = 0, hanyaKds1 = 0;
    const pasangan = new Map<string, number>();
    for (const r of a) {
      const t = peta.get(r.nip);
      if (!t) { hanyaKds1++; continue; }
      bersama++;
      if ((r.gol ?? null) === (t.golonganKode ?? null)) continue;
      const k = `${t.golonganKode ?? "kosong"}->${r.gol ?? "kosong"}`;
      if (kategori.get(t.statusKepegawaianKode) === "Non-ASN") { nonAsn++; pasangan.set(k, (pasangan.get(k) ?? 0) + 1); }
      else asn++;
    }
    const nipKds1 = new Set(a.map((r) => r.nip));
    const hanyaKds2 = b.filter((r) => !nipKds1.has(r.pegawaiNip)).length;
    const atas = [...pasangan.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${k} x${n}`).join(", ");
    console.log(`${p} | ${String(a.length).padStart(4)} | ${String(b.length).padStart(4)} | ${String(bersama).padStart(11)} | ${String(nonAsn).padStart(12)} | ${String(asn).padStart(8)} | ${String(hanyaKds1).padStart(10)} | ${String(hanyaKds2).padStart(10)} | ${atas}`);
  }
}

main().catch((e) => { console.error("Gagal:", e instanceof Error ? e.message.slice(0, 300) : e); process.exit(1); }).finally(() => pg.$disconnect());
