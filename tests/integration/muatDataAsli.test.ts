/**
 * Pemuat data domain antar database (lib/muat/salinData.ts): sumber = kds_test dengan data sintetis lengkap (Standarisasi, Review, kamus, catatan, rekap, koreksi,
 * audit), tujuan = database lokal sementara kds_muat_test (skema dan master dari migrasi + seed, satu akun admin). Membuktikan: dry-run tidak menulis, muat sungguhan
 * identik (sidik jari seluruh baris), penunjuk pengguna diarahkan ke admin tujuan, urutan id sesuai sumber, tujuan tidak kosong ditolak, dan kegagalan di tengah
 * membatalkan seluruhnya.
 */
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { muatData, URUTAN_MUAT, kolomPengguna, tabelDb, verifikasiSalinan } from "@/lib/muat/salinData";
import { simpanStandarisasi } from "@/lib/standarisasi/proses";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";
import { buatBerkasRaw, type Vocab } from "../support/rawSimpega";

const urlSumber = process.env.TEST_DATABASE_URL ?? "";
const ada = Boolean(urlSumber);
const urlTujuan = urlSumber.replace(/\/kds_test(\?|$)/, "/kds_muat_test$1");
const urlAdmin = urlSumber.replace(/\/kds_test(\?|$)/, "/postgres$1");
const sumber = new PrismaClient({ datasourceUrl: urlSumber });
const tujuan = new PrismaClient({ datasourceUrl: urlTujuan });
let adminTujuanId = "";

async function kosongkanTujuan() {
  await kosongkanDomain(tujuan);
  for (const t of ["baris_bermasalah", "kamus_koreksi", "catatan_perubahan_batch", "koreksi_tanggal_mulai_kerja", "catatan_status_pegawai", "audit_log"]) {
    await tujuan.$executeRawUnsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
  }
}
async function hitungTujuan(): Promise<Record<string, number>> {
  const h: Record<string, number> = {};
  for (const m of URUTAN_MUAT) h[tabelDb(m)] = Number((await tujuan.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${tabelDb(m)}"`))[0].n);
  return h;
}

async function vocab(): Promise<Vocab> {
  const unit = await sumber.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await sumber.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await sumber.jabatanFungsionalTendik.findMany()).filter((x) => x.jenjang.trim() !== "-").map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()), umum: (await sumber.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await sumber.kategoriAkademisiLuar.findMany()).map((x) => x.nama), status: await sumber.statusKepegawaian.findMany(),
    role: (await sumber.jabatanTambahanRole.findMany()).map((x) => x.namaRole), prodi: (await sumber.programStudi.findMany()).map((x) => x.nama),
  };
}

/** Data sumber sintetis selengkap mungkin: batch Standarisasi ber-pengguna, antrean Review, kamus, catatan, rekap, koreksi, audit, koreksi TMT. */
async function isiSumber() {
  await kosongkanDomain(sumber);
  for (const t of ["kamus_koreksi", "catatan_status_pegawai", "audit_log", "koreksi_tanggal_mulai_kerja"]) await sumber.$executeRawUnsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
  const pengguna = await sumber.user.upsert({ where: { email: "sumber@uji.test" }, create: { email: "sumber@uji.test", passwordHash: "x", nama: "Sumber" }, update: {} });
  const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 9, tahun: 2026, jumlah: 80, benih: 301, tanpaPlaceholder: true });
  const r = await simpanStandarisasi(sumber, buffer, "sep.xlsx", { bulan: 9, tahun: 2026 }, { id: pengguna.id, nama: "Sumber" });
  await muatKeadaan(sumber, {
    nominatif: [{ nip: "198001012005011901", bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2010-01-01" }],
    rekap: [{ nip: "198001012005011901", bulan: 8, tahun: 2026, komponen: { I: "2", S: "0" } }],
    koreksi: [{ nip: "198001012005011901", dari_komponen: "TK", ke_komponen: "I", tanggal_mulai: "2026-08-03", jumlah_hari: 1 }],
  } as never);
  await sumber.kamusKoreksi.create({ data: { jenisField: "UnitKerja", kunciMentah: "unit lama", nilaiResolusi: "UA-001", dibuatOlehId: pengguna.id } });
  await sumber.catatanPerubahanBatch.create({ data: { uploadBatchAId: r.batchId, uploadBatchBId: null, kategori: "Hilang", nipUtama: "198001012005011901", nama: "Nama", alasan: "Pensiun", dibuatOlehId: pengguna.id, nipTerkait: ["1", "2"] } });
  await sumber.catatanStatusPegawai.create({ data: { nip: "198001012005011901", alasan: "Pensiun", sumber: "uji", dicatatPada: new Date("2026-09-30T00:00:00Z") } });
  await sumber.auditLog.create({ data: { namaTabel: "nominatif_bulanan", idRecord: "1", fieldDiubah: "nama", nilaiLama: null, nilaiBaru: "x", diubahOleh: "uji", diubahPada: new Date("2026-09-01T03:00:00Z"), aksi: "INSERT" } });
  await sumber.koreksiTanggalMulaiKerja.create({ data: { nip: "198001012005011901", tanggalMulaiKerja: new Date("2026-04-01T00:00:00Z"), alasan: "uji", dibuatOlehNama: "uji" } });
  return r;
}

describe.skipIf(!ada)("pemuat data antar database", () => {
  beforeAll(async () => {
    const admin = new PrismaClient({ datasourceUrl: urlAdmin });
    if ((await admin.$queryRawUnsafe<unknown[]>("SELECT 1 FROM pg_database WHERE datname = 'kds_muat_test'")).length === 0) await admin.$executeRawUnsafe("CREATE DATABASE kds_muat_test ENCODING 'UTF8'");
    await admin.$disconnect();
    const env = { ...process.env, DATABASE_URL: urlTujuan, DATABASE_URL_UNPOOLED: urlTujuan, SEED_ADMIN_EMAIL: "admin-muat@uji.test", SEED_ADMIN_PASSWORD: "SandiUji-12345" };
    const ada = (await tujuan.$queryRawUnsafe<{ n: number }[]>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'").catch(() => [{ n: 0 }]))[0].n;
    if (ada === 0) {
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, stdio: "ignore" });
      execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], { env, stdio: "ignore" });
    }
    adminTujuanId = (await tujuan.user.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  }, 240_000);
  afterAll(async () => {
    await kosongkanDomain(sumber);
    await sumber.$disconnect();
    await tujuan.$disconnect();
  });

  it("dry-run: melaporkan jumlah tiap tabel, tidak menulis apa pun, dan tidak menyentuh urutan id tujuan", async () => {
    await kosongkanTujuan();
    const r = await isiSumber();
    const lap = await muatData({ sumber, tujuan, adminTujuanId, dryRun: true });
    expect(lap.dryRun).toBe(true);
    expect(lap.tabel.map((t) => t.model)).toEqual([...URUTAN_MUAT]);
    expect(lap.tabel.find((t) => t.model === "UploadBatch")!.ditulis).toBeGreaterThanOrEqual(2);
    expect(Object.values(await hitungTujuan()).every((n) => n === 0)).toBe(true);
    const [seq] = await tujuan.$queryRawUnsafe<{ is_called: boolean }[]>(`SELECT is_called FROM ${(await tujuan.$queryRawUnsafe<{ n: string }[]>(`SELECT pg_get_serial_sequence('"upload_batch"', 'id') AS n`))[0].n}`);
    expect(seq.is_called).toBe(false);
    expect(r.ringkasan.perluReview).toBeGreaterThan(0);
  });

  it("muat sungguhan: jumlah dan sidik jari SEMUA tabel identik; penunjuk pengguna diarahkan ke admin tujuan; akun dan master tidak berubah", async () => {
    await kosongkanTujuan();
    await isiSumber();
    const penggunaSebelum = await tujuan.user.count();
    const masterSebelum = await tujuan.unitAsal.count();
    const lap = await muatData({ sumber, tujuan, adminTujuanId });
    expect(lap.tabel.every((t) => t.dibaca === t.ditulis)).toBe(true);

    const v = await verifikasiSalinan(sumber, tujuan);
    expect(v.filter((x) => !x.sama), JSON.stringify(v.filter((x) => !x.sama))).toEqual([]);
    expect(v.reduce((a, b) => a + b.jumlahTujuan, 0)).toBeGreaterThan(100);
    expect(v.find((x) => x.tabel === "baris_bermasalah")!.jumlahTujuan).toBeGreaterThan(0);
    expect(v.find((x) => x.tabel === "kamus_koreksi")!.jumlahTujuan).toBe(1);

    // semua penunjuk pengguna menunjuk admin tujuan (atau tetap kosong bila kosong di sumber)
    for (const m of URUTAN_MUAT) {
      for (const k of kolomPengguna(m)) {
        const [a] = await sumber.$queryRawUnsafe<{ ada: bigint; kosong: bigint }[]>(`SELECT count("${k}") AS ada, count(*) - count("${k}") AS kosong FROM "${tabelDb(m)}"`);
        const [b] = await tujuan.$queryRawUnsafe<{ ke_admin: bigint; kosong: bigint; lain: bigint }[]>(
          `SELECT count(*) FILTER (WHERE "${k}" = $1) AS ke_admin, count(*) FILTER (WHERE "${k}" IS NULL) AS kosong, count(*) FILTER (WHERE "${k}" IS NOT NULL AND "${k}" <> $1) AS lain FROM "${tabelDb(m)}"`,
          adminTujuanId,
        );
        expect(Number(b.ke_admin), `${tabelDb(m)}.${k}`).toBe(Number(a.ada));
        expect(Number(b.kosong), `${tabelDb(m)}.${k}`).toBe(Number(a.kosong));
        expect(Number(b.lain)).toBe(0);
      }
    }
    expect(await tujuan.user.count()).toBe(penggunaSebelum);
    expect(await tujuan.unitAsal.count()).toBe(masterSebelum);
  });

  it("urutan id tujuan mengikuti sumber: baris baru setelah pemuatan tidak bertabrakan dengan id yang dimuat", async () => {
    await kosongkanTujuan();
    await isiSumber();
    await muatData({ sumber, tujuan, adminTujuanId });
    const maks = (await tujuan.uploadBatch.aggregate({ _max: { id: true } }))._max.id!;
    const baru = await tujuan.uploadBatch.create({ data: { jenis: "uji", namaFileAsli: "baru.xlsx", diunggahOlehNama: "t" } });
    expect(baru.id).toBeGreaterThan(maks);
    const n = await tujuan.nominatifBulanan.aggregate({ _max: { id: true } });
    const contoh = await tujuan.nominatifBulanan.findFirstOrThrow();
    const { id: _i, ...sisa } = contoh;
    void _i;
    const nominatifBaru = await tujuan.nominatifBulanan.create({ data: { ...sisa, bulan: 12, tahun: 2030 } });
    expect(nominatifBaru.id).toBeGreaterThan(n._max.id!);
  });

  it("tujuan tidak kosong ditolak dengan pesan jelas dan tidak ada yang berubah", async () => {
    await kosongkanTujuan();
    await isiSumber();
    await muatData({ sumber, tujuan, adminTujuanId });
    const sebelum = await hitungTujuan();
    await expect(muatData({ sumber, tujuan, adminTujuanId })).rejects.toThrow(/Tujuan tidak kosong: .*pegawai/);
    expect(await hitungTujuan()).toEqual(sebelum);
  });

  it("audit yang sudah ada di tujuan (mis. ganti kata sandi) dipertahankan dengan id baru setelah riwayat, dan tidak mengganggu verifikasi; data lain di tujuan tetap menolak", async () => {
    await kosongkanTujuan();
    await isiSumber();
    const maksSumber = (await sumber.auditLog.aggregate({ _max: { id: true } }))._max.id!;
    await tujuan.auditLog.create({ data: { namaTabel: "users", idRecord: "x", fieldDiubah: "password", nilaiLama: null, nilaiBaru: "(diganti)", diubahOleh: "admin", diubahPada: new Date("2026-10-14T03:00:00Z"), aksi: "UPDATE" } });
    const lap = await muatData({ sumber, tujuan, adminTujuanId });
    expect(lap.auditDipertahankan).toBe(1);
    const jejak = await tujuan.auditLog.findMany({ where: { namaTabel: "users" } });
    expect(jejak).toHaveLength(1);
    expect(jejak[0].id).toBeGreaterThan(maksSumber);
    expect(await tujuan.auditLog.count()).toBe((await sumber.auditLog.count()) + 1);
    expect((await verifikasiSalinan(sumber, tujuan)).filter((x) => !x.sama)).toEqual([]);
    // tabel lain yang terisi tetap ditolak walau audit boleh
    await kosongkanTujuan();
    await tujuan.auditLog.create({ data: { namaTabel: "users", idRecord: "x", fieldDiubah: "password", nilaiLama: null, nilaiBaru: "(diganti)", diubahOleh: "admin", diubahPada: new Date("2026-10-14T03:00:00Z"), aksi: "UPDATE" } });
    await tujuan.catatanStatusPegawai.create({ data: { nip: "1", alasan: "x", sumber: "uji", dicatatPada: new Date("2026-09-30T00:00:00Z") } });
    await expect(muatData({ sumber, tujuan, adminTujuanId })).rejects.toThrow(/Tujuan tidak kosong: catatan_status_pegawai/);
    expect(await tujuan.auditLog.count()).toBe(1);
  });

  it("kegagalan di tengah (kode master yang dipakai tidak ada di tujuan) membatalkan SELURUHNYA, termasuk tabel yang sudah terisi", async () => {
    await kosongkanTujuan();
    await isiSumber();
    const unit = await sumber.nominatifBulanan.findFirstOrThrow({ select: { unitAsalKode: true } });
    const asal = await tujuan.unitAsal.findUniqueOrThrow({ where: { kode: unit.unitAsalKode } });
    await tujuan.unitAsal.delete({ where: { kode: unit.unitAsalKode } });
    try {
      await expect(muatData({ sumber, tujuan, adminTujuanId })).rejects.toThrow();
      expect(Object.values(await hitungTujuan()).every((n) => n === 0)).toBe(true);
    } finally {
      await tujuan.unitAsal.create({ data: asal });
    }
  });

  it("sidik jari peka: satu sel yang berbeda di tujuan terdeteksi hanya pada tabelnya", async () => {
    await kosongkanTujuan();
    await isiSumber();
    await muatData({ sumber, tujuan, adminTujuanId });
    const n = await tujuan.nominatifBulanan.findFirstOrThrow();
    await tujuan.nominatifBulanan.update({ where: { id: n.id }, data: { nama: n.nama + "!" } });
    const v = await verifikasiSalinan(sumber, tujuan);
    expect(v.filter((x) => !x.sama).map((x) => x.tabel)).toEqual(["nominatif_bulanan"]);
    await tujuan.nominatifBulanan.update({ where: { id: n.id }, data: { nama: n.nama } });
    expect((await verifikasiSalinan(sumber, tujuan)).every((x) => x.sama)).toBe(true);
  });
});
