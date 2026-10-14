/**
 * Koreksi riwayat golongan Non-ASN di salinan data asli lokal (kds_paritas) mengikuti riwayat KDS1 (cocok dengan SIMPEGA); KDS2 salah satu tingkat
 * lebih rendah atau kosong (keputusan pengguna 14 Okt 2026, lihat docs/09 §10). KDS1 (Neon) hanya dibaca (READ ONLY); KDS2 tidak disentuh.
 *
 *   npm run koreksi:golongan-kds1             -> DRY-RUN (hanya menghitung, tidak menulis apa pun)
 *   npm run koreksi:golongan-kds1 -- --terapkan -> menulis dalam SATU transaksi, dengan satu baris audit_log per perubahan, lalu memverifikasi
 *
 * Sebelum --terapkan: buat cadangan tabel nominatif_bulanan dan audit_log (lihat docs/09 §10). Hanya hitungan yang dicetak, tanpa NIP/nama.
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { type BarisKds1, type BarisTarget, rencanakanKoreksiGolongan } from "../lib/migrasi/golonganKds1";
import { denganKds1 } from "./kds1-neon/sambung";

const terapkan = process.argv.includes("--terapkan");
const url = process.env.PARITAS_DATABASE_URL ?? "";
if (!/\/kds_paritas(\?|$)/.test(url)) throw new Error("PARITAS_DATABASE_URL harus menunjuk database lokal kds_paritas.");
const pg = new PrismaClient({ datasourceUrl: url });
const OLEH = "sistem (koreksi riwayat golongan dari KDS1, keputusan pengguna 14 Okt 2026)";

async function rencana() {
  const kds1 = await denganKds1((q) =>
    q<BarisKds1>(`select n."pegawaiNip" as nip, n."bulan", n."tahun", n."statusKepegawaianKode" as status, n."golonganKode" as golongan from nominatif_bulanan n join upload_batch b on b."id" = n."uploadBatchId" where b."status" <> 'Dibatalkan'`),
  );
  const bulanKds1 = new Set(kds1.map((r) => `${r.tahun}-${r.bulan}`));
  const target: BarisTarget[] = (await pg.nominatifBulanan.findMany({ select: { id: true, pegawaiNip: true, bulan: true, tahun: true, statusKepegawaianKode: true, golonganKode: true } }))
    .filter((r) => bulanKds1.has(`${r.tahun}-${r.bulan}`))
    .map((r) => ({ id: r.id, nip: r.pegawaiNip, bulan: r.bulan, tahun: r.tahun, status: r.statusKepegawaianKode, golongan: r.golonganKode }));
  const kategoriStatus = new Map((await pg.statusKepegawaian.findMany()).map((s) => [s.kode, s.kategori]));
  const golonganMaster = new Set((await pg.golongan.findMany()).map((g) => g.kode));
  return { target, ...{ r: rencanakanKoreksiGolongan(kds1, target, { kategoriStatus, golonganMaster }) }, kds1, kategoriStatus, golonganMaster };
}

async function main() {
  const { r, target } = await rencana();
  console.log(`Baris target pada bulan yang ada di KDS1: ${target.length}`);
  console.log("bulan   | akan diubah | di antaranya kosong -> isi");
  for (const [bulan, b] of [...r.perBulan.entries()].sort()) console.log(`${bulan} | ${String(b.diubah).padStart(11)} | ${b.kosongMenjadiIsi}`);
  console.log(`TOTAL akan diubah: ${r.perubahan.length} | sudah sama: ${r.sudahSama}`);
  console.log("Pasangan nilai (KDS2 -> KDS1):", [...r.pasangan.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(" | ") || "-");
  for (const [alasan, n] of r.dilewati) console.log(`Dilewati x${n}: ${alasan}`);

  if (!terapkan) {
    console.log("\nDRY-RUN: tidak ada yang ditulis. Buat cadangan, lalu jalankan dengan --terapkan.");
    return;
  }
  if (r.perubahan.length === 0) {
    console.log("Tidak ada yang perlu diubah.");
    return;
  }
  const sebelum = await pg.auditLog.count({ where: { diubahOleh: OLEH } });
  await pg.$transaction(
    async (tx) => {
      const waktu = new Date();
      for (const p of r.perubahan) await tx.nominatifBulanan.update({ where: { id: p.id }, data: { golonganKode: p.baru } });
      await tx.auditLog.createMany({
        data: r.perubahan.map((p) => ({ namaTabel: "nominatif_bulanan", idRecord: String(p.id), fieldDiubah: "golongan_kode", nilaiLama: p.lama, nilaiBaru: p.baru, diubahOleh: OLEH, diubahPada: waktu, aksi: "UPDATE" })),
      });
    },
    { timeout: 300_000, maxWait: 30_000 },
  );

  // Verifikasi: rencana ulang kosong, jumlah audit bertambah tepat, dan baris ASN tidak berubah (hitungan golongan ASN sebelum = sesudah tidak dicek di sini
  // karena skrip tidak pernah menyentuhnya; aturan itu dibuktikan oleh tes unit).
  const ulang = (await rencana()).r;
  const audit = (await pg.auditLog.count({ where: { diubahOleh: OLEH } })) - sebelum;
  const ok = ulang.perubahan.length === 0 && audit === r.perubahan.length;
  console.log(`Sesudah: rencana ulang ${ulang.perubahan.length} perubahan, audit bertambah ${audit} (harapan ${r.perubahan.length}).`);
  console.log(ok ? "VERIFIKASI LULUS." : "VERIFIKASI GAGAL.");
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("Gagal:", e instanceof Error ? e.message.slice(0, 300) : e); process.exit(1); }).finally(() => pg.$disconnect());
