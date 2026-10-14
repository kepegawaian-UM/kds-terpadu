/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- driver ORACLE: dijalankan dengan tsconfig KDS1 (alias "@/" menunjuk ke KDS1), bukan diperiksa tsc proyek ini
/**
 * ORACLE PARITAS F4.5: menjalankan kode KDS1 ASLI (importBatch, resolveRow, bandingkan; folder referensi, TIDAK diubah) terhadap
 * database lokal `kds1_oracle` (lihat siapkan-kds1-oracle.ts) dengan master data yang DISUNTIKKAN dari tes (isi master kds_test),
 * lalu mengeluarkan keadaan akhir. Dijalankan lewat tsx dengan cwd = folder KDS1 dan tsconfig KDS1 (supaya alias "@/" KDS1 terbaca):
 *   npx tsx --tsconfig <KDS1>/tsconfig.json scripts/oracle/kds1-oracle.ts <masukan.json> <keluaran.json>
 * Pengaman: DATABASE_URL HARUS menunjuk kds1_oracle di host lokal; bila tidak, berhenti sebelum menyentuh apa pun.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [berkasMasuk, berkasKeluar] = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? "";
if (!/^postgresql:\/\/[^/]*@(localhost|127\.0\.0\.1)(:\d+)?\/kds1_oracle(\?|$)/.test(url) || process.env.DATABASE_URL_UNPOOLED !== url) {
  console.error("Ditolak: DATABASE_URL dan DATABASE_URL_UNPOOLED harus menunjuk postgresql lokal /kds1_oracle.");
  process.exit(3);
}

type Masukan = {
  master: Record<string, Record<string, unknown>[]>;
  kamus?: { jenisField: string; kunciMentah: string; nilaiResolusi: string }[];
  nipTerdaftar?: string[];
  nominatifLama?: { nip: string; bulan: number; tahun: number; jenisKode: string; statusKode: string; unitKode: string }[];
  kasus: {
    id: string;
    berkas: string;
    namaFile: string;
    bulan: number;
    tahun: number;
    langkahResolve?: { urutan: number; kelompok: "Dosen" | "Tendik" | "Akademisi Luar UM"; data: Record<string, unknown>; ingat: Record<string, boolean> }[];
  }[];
};

const masuk = JSON.parse(readFileSync(berkasMasuk, "utf8")) as Masukan;

// Urutan pembuatan master menurut kunci asing (model Prisma KDS1).
const URUTAN_MASTER: [string, string][] = [
  ["jenisPegawai", "jenisPegawai"], ["statusKepegawaian", "statusKepegawaian"], ["golongan", "golongan"], ["jabatanFungsionalDosen", "jabatanFungsionalDosen"],
  ["jabatanFungsionalTendik", "jabatanFungsionalTendik"], ["jabatanFungsiUmumPelaksana", "jabatanFungsiUmumPelaksana"], ["jabatanTambahanRole", "jabatanTambahanRole"],
  ["kategoriAkademisiLuar", "kategoriAkademisiLuar"], ["unitInduk", "unitInduk"], ["unitAsal", "unitAsal"], ["programStudi", "programStudi"],
];

async function main() {
  const { prisma } = await import("@/lib/db");
  const { importBatch } = await import("@/lib/services/importBatch");
  const { resolveRow } = await import("@/lib/services/resolveRow");

  const tabel = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  const keluar: Record<string, unknown> = {};

  for (const kasus of masuk.kasus) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tabel.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    const klien = prisma as unknown as Record<string, { createMany(a: unknown): Promise<unknown> }>;
    for (const [kunci, model] of URUTAN_MASTER) {
      const baris = masuk.master[kunci] ?? [];
      if (baris.length > 0) await klien[model].createMany({ data: baris });
    }
    // Kode placeholder "Belum Diketahui" KDS1 (DSN-99, UMM-99) tidak ada di master KDS2: tambahkan hanya di database oracle (nama sama), supaya kode KDS1 berjalan; tes menormalkannya ke kode master KDS2.
    const bdDosen = (masuk.master.jabatanFungsionalDosen ?? []).find((j) => /^belum diketahui/i.test(String(j.nama)));
    if (bdDosen) await prisma.jabatanFungsionalDosen.create({ data: { ...bdDosen, kode: "DSN-99", urutanJenjang: 99 } });
    const bdUmum = (masuk.master.jabatanFungsiUmumPelaksana ?? []).find((j) => /^belum diketahui/i.test(String(j.nama)));
    if (bdUmum) await prisma.jabatanFungsiUmumPelaksana.create({ data: { ...bdUmum, kode: "UMM-99" } });
    const admin = await prisma.user.create({ data: { email: "oracle@uji.test", passwordHash: "x", nama: "Admin Oracle" } });
    if (masuk.kamus?.length) await prisma.kamusKoreksi.createMany({ data: masuk.kamus.map((k) => ({ ...k, dibuatOlehId: admin.id })) });
    if (masuk.nipTerdaftar?.length) await prisma.pegawai.createMany({ data: masuk.nipTerdaftar.map((nip) => ({ nip })), skipDuplicates: true });
    if (masuk.nominatifLama?.length) {
      const lama = await prisma.uploadBatch.create({ data: { bulan: kasus.bulan, tahun: kasus.tahun, namaFileAsli: "lama.xlsx", status: "Selesai", diunggahOlehId: admin.id } });
      await prisma.pegawai.createMany({ data: masuk.nominatifLama.map((n) => ({ nip: n.nip })), skipDuplicates: true });
      for (const n of masuk.nominatifLama) {
        await prisma.nominatifBulanan.create({
          data: {
            pegawaiNip: n.nip, bulan: n.bulan, tahun: n.tahun, nama: `Lama ${n.nip}`, jenisKelamin: "L", jenisPegawaiKode: n.jenisKode, statusKepegawaianKode: n.statusKode,
            unitAsalKode: n.unitKode, tanggalMulaiKerja: new Date("2010-01-01T00:00:00Z"), uploadBatchId: lama.id,
          },
        });
      }
    }

    let galat: string | null = null;
    let batchId: string | null = null;
    try {
      const hasil = await importBatch(readFileSync(kasus.berkas), kasus.namaFile, kasus.bulan, kasus.tahun, admin.id);
      batchId = hasil.uploadBatchId;
      for (const r of kasus.langkahResolve ?? []) {
        const baris = await prisma.barisBermasalah.findMany({ where: { uploadBatchId: batchId, status: "Menunggu" }, orderBy: [{ nip: "asc" }, { id: "asc" }] });
        const target = baris[r.urutan];
        await resolveRow({
          barisBermasalahId: target.id, kelompok: r.kelompok, ingat: r.ingat as never, diselesaikanOlehId: admin.id,
          data: { ...r.data, tanggalLahir: r.data.tanggalLahir ? new Date(String(r.data.tanggalLahir)) : null, tanggalMulaiKerja: new Date(String(r.data.tanggalMulaiKerja)) } as never,
        });
      }
    } catch (e) {
      galat = `${(e as Error).constructor.name}: ${(e as Error).message}`;
    }

    const nominatif = await prisma.nominatifBulanan.findMany({ include: { jabatanTambahan: { orderBy: { id: "asc" } } }, orderBy: [{ pegawaiNip: "asc" }, { bulan: "asc" }, { tahun: "asc" }] });
    const batches = await prisma.uploadBatch.findMany({ orderBy: { diunggahPada: "asc" } });
    const baru = batchId ? batches.find((b) => b.id === batchId) : undefined;
    keluar[kasus.id] = {
      galat,
      batch: baru ? { bulan: baru.bulan, tahun: baru.tahun, namaFileAsli: baru.namaFileAsli, status: baru.status, jumlahBarisTotal: baru.jumlahBarisTotal, jumlahBerhasil: baru.jumlahBerhasil, jumlahPerluReview: baru.jumlahPerluReview, petaKolomTerdeteksi: baru.petaKolomTerdeteksi } : null,
      batchLain: batches.filter((b) => b.id !== batchId && b.namaFileAsli !== "lama.xlsx").length,
      batchLamaStatus: batches.filter((b) => b.namaFileAsli === "lama.xlsx").map((b) => b.status),
      nominatif: nominatif.map((n) => ({
        nip: n.pegawaiNip, bulan: n.bulan, tahun: n.tahun, nama: n.nama, jenisKelamin: n.jenisKelamin, tanggalLahir: n.tanggalLahir?.toISOString() ?? null, pendidikanTerakhir: n.pendidikanTerakhir,
        jenisPegawaiKode: n.jenisPegawaiKode, statusKepegawaianKode: n.statusKepegawaianKode, golonganKode: n.golonganKode, jabatanFungsionalDosenKode: n.jabatanFungsionalDosenKode,
        jabatanFungsionalTendikKode: n.jabatanFungsionalTendikKode, jabatanFungsiUmumKode: n.jabatanFungsiUmumKode, kategoriAkademisiLuarKode: n.kategoriAkademisiLuarKode, unitAsalKode: n.unitAsalKode,
        tanggalMulaiKerja: n.tanggalMulaiKerja.toISOString(), dariBatchBaru: n.uploadBatchId === batchId,
        jabatanTambahan: n.jabatanTambahan.map((j) => ({ role: j.jabatanTambahanRoleKode, unit: j.unitAsalKode, prodi: j.programStudiKode, status: j.statusPengangkatan })),
      })),
      barisBermasalah: (await prisma.barisBermasalah.findMany({ orderBy: [{ nip: "asc" }, { dibuatPada: "asc" }] })).map((b) => ({
        nip: b.nip, alasanUtama: b.alasanUtama, detailAlasan: b.detailAlasan, status: b.status, dataMentah: b.dataMentah, resolvedFields: b.resolvedFields,
      })),
      kamus: (await prisma.kamusKoreksi.findMany({ orderBy: [{ jenisField: "asc" }, { kunciMentah: "asc" }] })).map((k) => ({ jenisField: k.jenisField, kunciMentah: k.kunciMentah, nilaiResolusi: k.nilaiResolusi })),
      pegawai: (await prisma.pegawai.findMany({ orderBy: { nip: "asc" } })).map((p) => p.nip),
    };
  }
  writeFileSync(berkasKeluar, JSON.stringify(keluar));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
