/**
 * Migrasi data KDS1 (Neon, BACA-SAJA) ke database LOKAL kds_paritas (F4.5c): Kamus Koreksi dan Catatan Perubahan Batch.
 * Riwayat batch dan snapshot Nominatif KDS1 TIDAK dibawa: Nominatif resmi sudah ada dari KDS2 (F2), batch KDS1 tidak punya padanan.
 *
 *   npm run migrasi:kds1             -> DRY-RUN (hanya membaca dan menghitung, tidak menulis apa pun)
 *   npm run migrasi:kds1 -- --terapkan -> menulis dalam SATU transaksi ke kds_paritas, lalu memverifikasi
 *
 * Target dipaksa kds_paritas (salinan data asli, lokal saja). Entri yang sudah ada di target (kunci sama) tidak ditimpa.
 * Tidak ada nilai pegawai yang dicetak; hanya jumlah dan alasan penolakan.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { buatPenerjemah, type KamusHasil, type KamusKds1, type MasterLengkap, type TabelMaster } from "../lib/migrasi/kds1";
import { tambahUnitAsalBaru } from "../lib/standarisasi/master";
import { denganKds1 } from "./kds1-neon/sambung";

const terapkan = process.argv.includes("--terapkan");

const TABEL: Record<TabelMaster, { tabel: string; nama: string }> = {
  golongan: { tabel: "mst_golongan", nama: `"kode"` },
  status: { tabel: "mst_status_kepegawaian", nama: `"nama"` },
  dosen: { tabel: "mst_jabatan_fungsional_dosen", nama: `"nama"` },
  tendik: { tabel: "mst_jabatan_fungsional_tendik", nama: `"jabatanPokok" || ' ' || "jenjang"` },
  umum: { tabel: "mst_jabatan_fungsi_umum_pelaksana", nama: `"nama"` },
  kategori: { tabel: "mst_kategori_akademisi_luar", nama: `"nama"` },
  unit: { tabel: "mst_unit_asal", nama: `"nama"` },
  prodi: { tabel: "mst_program_studi", nama: `"nama"` },
  role: { tabel: "mst_jabatan_tambahan_role", nama: `"namaRole"` },
};
type Q = <R = unknown>(sql: string, ...nilai: unknown[]) => Promise<R[]>;

async function bacaMaster(q: Q): Promise<MasterLengkap> {
  const h = {} as MasterLengkap;
  for (const [k, m] of Object.entries(TABEL)) h[k as TabelMaster] = await q(`select "kode", ${m.nama} as nama from ${m.tabel}`);
  return h;
}

type CatatanKds1 = { kategori: string; nipUtama: string; nipTerkait: unknown; nama: string; alasan: string; dibuatPada: Date; diperbaruiPada: Date };

async function main() {
  const url = process.env.PARITAS_DATABASE_URL ?? "";
  if (!/\/kds_paritas(\?|$)/.test(url)) throw new Error("PARITAS_DATABASE_URL harus menunjuk database lokal kds_paritas.");
  const lokal = new PrismaClient({ datasourceUrl: url });
  try {
    const asal = await denganKds1(async (q) => ({
      kamus: await q<KamusKds1>('select "id", "jenisField", "kunciMentah", "nilaiResolusi", "catatan", "dibuatPada" from kamus_koreksi order by "dibuatPada", "id"'),
      catatan: await q<CatatanKds1>('select "kategori", "nipUtama", "nipTerkait", "nama", "alasan", "dibuatPada", "diperbaruiPada" from catatan_perubahan_batch order by "dibuatPada", "id"'),
      master: await bacaMaster(q),
      unitDetail: await q<{ kode: string; nama: string; unitIndukKode: string }>('select "kode", "nama", "unitIndukKode" from mst_unit_asal'),
    }));
    const tujuanMaster = {} as MasterLengkap;
    for (const [k, m] of Object.entries(TABEL)) tujuanMaster[k as TabelMaster] = await lokal.$queryRawUnsafe(`select "kode", ${m.nama} as nama from ${m.tabel}`);
    let terjemah = buatPenerjemah(asal.master, tujuanMaster);

    // Unit kerja yang hanya ada di KDS1 tetapi dipakai entri kamus (mis. asrama) ditambahkan ke master KDS Terpadu (keputusan pengguna
    // 14 Okt 2026), dengan induk yang sama. Pada dry-run hanya disimulasikan; kode baru dibuat saat --terapkan.
    const perluUnit = new Map<string, { kode: string; nama: string; unitIndukKode: string }>();
    for (const e of asal.kamus) {
      const t = terjemah(e);
      const m = !t.ok ? t.alasan.match(/master unit "(UA-\d+)"/) : null;
      const u = m ? asal.unitDetail.find((x) => x.kode === m[1]) : undefined;
      if (u) perluUnit.set(u.kode, u);
    }
    if (perluUnit.size > 0) {
      const indukAda = new Set((await lokal.unitInduk.findMany({ select: { kode: true } })).map((x) => x.kode));
      for (const u of perluUnit.values()) if (!indukAda.has(u.unitIndukKode)) throw new Error(`Unit induk ${u.unitIndukKode} tidak ada di target.`);
      console.log(`Unit kerja yang akan ditambah ke master (hanya ada di KDS1, dipakai kamus): ${[...perluUnit.values()].map((u) => u.nama).join(" | ")}`);
      if (terapkan) {
        for (const u of perluUnit.values()) await tambahUnitAsalBaru(lokal, u.nama, u.unitIndukKode);
      } else {
        tujuanMaster.unit = [...tujuanMaster.unit, ...[...perluUnit.values()].map((u) => ({ kode: `(baru ${u.kode})`, nama: u.nama }))];
      }
      if (terapkan) for (const [k, m] of Object.entries(TABEL)) tujuanMaster[k as TabelMaster] = await lokal.$queryRawUnsafe(`select "kode", ${m.nama} as nama from ${m.tabel}`);
      terjemah = buatPenerjemah(asal.master, tujuanMaster);
    }

    const pengguna = await lokal.user.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
    if (!pengguna) throw new Error("kds_paritas belum punya pengguna (kolom pembuat wajib).");
    const adaKamus = new Set((await lokal.kamusKoreksi.findMany({ select: { jenisField: true, kunciMentah: true } })).map((x) => `${x.jenisField}::${x.kunciMentah}`));
    const adaCatatan = new Set((await lokal.catatanPerubahanBatch.findMany({ select: { kategori: true, nipUtama: true } })).map((x) => `${x.kategori}::${x.nipUtama}`));

    const kamusBaru: KamusHasil[] = [];
    const ditolak = new Map<string, number>();
    let sudahAda = 0;
    let ganda = 0;
    const lihat = new Set<string>();
    for (const e of asal.kamus) {
      const t = terjemah(e);
      if (!t.ok) {
        ditolak.set(`${e.jenisField}: ${t.alasan}`, (ditolak.get(`${e.jenisField}: ${t.alasan}`) ?? 0) + 1);
        continue;
      }
      const kunci = `${t.hasil.jenisField}::${t.hasil.kunciMentah}`;
      if (lihat.has(kunci)) ganda++;
      else if (adaKamus.has(kunci)) sudahAda++;
      else kamusBaru.push(t.hasil);
      lihat.add(kunci);
    }
    const catatanBaru = asal.catatan.filter((c) => !adaCatatan.has(`${c.kategori}::${c.nipUtama}`));

    console.log(`Kamus Koreksi KDS1: ${asal.kamus.length} | akan dibuat: ${kamusBaru.length} | sudah ada di target: ${sudahAda} | kunci ganda setelah terjemah: ${ganda} | ditolak: ${[...ditolak.values()].reduce((a, b) => a + b, 0)}`);
    for (const [alasan, n] of ditolak) console.log(`   ditolak x${n}: ${alasan}`);
    console.log(`Catatan Perubahan KDS1: ${asal.catatan.length} | akan dibuat: ${catatanBaru.length} | sudah ada di target: ${asal.catatan.length - catatanBaru.length}`);
    const sebelum = { kamus: await lokal.kamusKoreksi.count(), catatan: await lokal.catatanPerubahanBatch.count() };
    console.log(`Target kds_paritas sebelum: kamus=${sebelum.kamus}, catatan=${sebelum.catatan}`);

    if (!terapkan) {
      console.log("\nDRY-RUN: tidak ada yang ditulis. Jalankan dengan --terapkan untuk menulis.");
      return;
    }

    await lokal.$transaction(
      async (tx) => {
        await tx.kamusKoreksi.createMany({ data: kamusBaru.map((k) => ({ ...k, dibuatOlehId: pengguna.id })) });
        await tx.catatanPerubahanBatch.createMany({
          data: catatanBaru.map((c) => ({ kategori: c.kategori, nipUtama: c.nipUtama, nipTerkait: (c.nipTerkait ?? undefined) as never, nama: c.nama, alasan: c.alasan, dibuatPada: c.dibuatPada, diperbaruiPada: c.diperbaruiPada, dibuatOlehId: pengguna.id })),
        });
      },
      { timeout: 120_000 },
    );

    // Verifikasi: jumlah bertambah tepat sebanyak yang direncanakan dan setiap entri terjemahan ada dengan nilai yang sama.
    const sesudah = { kamus: await lokal.kamusKoreksi.count(), catatan: await lokal.catatanPerubahanBatch.count() };
    const tersimpan = new Map((await lokal.kamusKoreksi.findMany()).map((x) => [`${x.jenisField}::${x.kunciMentah}`, x.nilaiResolusi]));
    const salah = kamusBaru.filter((k) => tersimpan.get(`${k.jenisField}::${k.kunciMentah}`) !== k.nilaiResolusi).length;
    const ok = sesudah.kamus === sebelum.kamus + kamusBaru.length && sesudah.catatan === sebelum.catatan + catatanBaru.length && salah === 0;
    console.log(`Sesudah: kamus=${sesudah.kamus}, catatan=${sesudah.catatan} | entri kamus tidak cocok: ${salah}`);
    console.log(ok ? "VERIFIKASI LULUS." : "VERIFIKASI GAGAL.");
    if (!ok) process.exit(1);
  } finally {
    await lokal.$disconnect();
  }
}

main().catch((e) => {
  console.error("Gagal:", e instanceof Error ? e.message.slice(0, 500) : e);
  process.exit(1);
});
