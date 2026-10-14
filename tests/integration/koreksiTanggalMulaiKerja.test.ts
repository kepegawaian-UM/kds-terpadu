/**
 * Koreksi tanggal mulai kerja (TMT) per pegawai: validasi, audit, penerapan ke snapshot yang sudah ada, dan pemakaian oleh Standarisasi
 * (TMT dari berkas diganti hanya untuk NIP yang dikoreksi). Data sintetis di kds_test.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { bacaTanggalIso, hapusKoreksiTmt, simpanKoreksiTmt } from "@/lib/koreksi/tanggalMulaiKerja";
import { klasifikasiBerkas, periksaStandarisasi, simpanStandarisasi } from "@/lib/standarisasi/proses";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { buatBerkasRaw, type Vocab } from "../support/rawSimpega";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const admin = { nama: "Admin Uji" };

async function vocab(): Promise<Vocab> {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).filter((x) => x.jenjang.trim() !== "-").map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()), umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama), status: await prisma.statusKepegawaian.findMany(),
    role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole), prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
}

const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;

describe("bacaTanggalIso", () => {
  it("hanya menerima tanggal yang ada di kalender", () => {
    expect(bacaTanggalIso("2026-04-01")?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(bacaTanggalIso(" 2024-02-29 ")).not.toBeNull();
    for (const buruk of ["2026-02-30", "2025-02-29", "2026-13-01", "01/04/2026", "2026-4-1", "", "abc"]) expect(bacaTanggalIso(buruk), buruk).toBeNull();
  });
});

describe.skipIf(!ada)("koreksi TMT per pegawai", () => {
  beforeEach(async () => {
    await kosongkanDomain(prisma);
    await prisma.koreksiTanggalMulaiKerja.deleteMany();
    await prisma.kamusKoreksi.deleteMany();
    await prisma.auditLog.deleteMany();
  });
  afterEach(async () => {
    await prisma.koreksiTanggalMulaiKerja.deleteMany();
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  async function snapshotTiapBulan() {
    const { buffer, nips } = await buatBerkasRaw({ vocab: await vocab(), bulan: 9, tahun: 2026, jumlah: 60, benih: 61, tanpaPlaceholder: true });
    await simpanStandarisasi(prisma, buffer, "sep.xlsx", { bulan: 9, tahun: 2026 }, { id: null, nama: "t" });
    await simpanStandarisasi(prisma, buffer, "okt.xlsx", { bulan: 10, tahun: 2026 }, { id: null, nama: "t" });
    return { buffer, nips };
  }

  it("validasi: NIP, tanggal, alasan, dan NIP yang belum pernah tercatat ditolak tanpa menulis apa pun", async () => {
    const { nips } = await snapshotTiapBulan();
    const nip = (await prisma.nominatifBulanan.findFirstOrThrow({ where: { pegawaiNip: { in: nips } } })).pegawaiNip;
    const dasar = { nip, tanggal: "2026-04-01", alasan: "sesuai SK", terapkanKeSnapshot: false };
    expect(await simpanKoreksiTmt(prisma, { ...dasar, nip: "12ab" }, admin)).toMatchObject({ ok: false, error: expect.stringContaining("NIP harus") });
    expect(await simpanKoreksiTmt(prisma, { ...dasar, tanggal: "2026-02-30" }, admin)).toMatchObject({ ok: false, error: expect.stringContaining("Tanggal tidak valid") });
    expect(await simpanKoreksiTmt(prisma, { ...dasar, tanggal: "1900-01-01" }, admin)).toMatchObject({ ok: false, error: expect.stringContaining("kewajaran") });
    expect(await simpanKoreksiTmt(prisma, { ...dasar, tanggal: "2099-01-01" }, admin)).toMatchObject({ ok: false, error: expect.stringContaining("kewajaran") });
    expect(await simpanKoreksiTmt(prisma, { ...dasar, alasan: " x " }, admin)).toMatchObject({ ok: false, error: expect.stringContaining("Alasan") });
    expect(await simpanKoreksiTmt(prisma, { ...dasar, nip: "99999999999999999" }, admin)).toMatchObject({ ok: false, error: expect.stringContaining("belum pernah tercatat") });
    expect(await prisma.koreksiTanggalMulaiKerja.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("simpan baru lalu ubah: satu baris per NIP, audit INSERT lalu UPDATE; tanpa 'terapkan ke snapshot' snapshot tidak berubah", async () => {
    const { nips } = await snapshotTiapBulan();
    const target = await prisma.nominatifBulanan.findFirstOrThrow({ where: { pegawaiNip: { in: nips }, bulan: 9 } });
    const m = { nip: target.pegawaiNip, tanggal: "2026-04-01", alasan: "sesuai SK", terapkanKeSnapshot: false };
    expect(await simpanKoreksiTmt(prisma, m, admin)).toEqual({ ok: true, snapshotDiubah: 0 });
    expect(await simpanKoreksiTmt(prisma, { ...m, tanggal: "2026-06-01", alasan: "ralat SK" }, admin)).toEqual({ ok: true, snapshotDiubah: 0 });
    const k = await prisma.koreksiTanggalMulaiKerja.findMany();
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ nip: target.pegawaiNip, alasan: "ralat SK", dibuatOlehNama: "Admin Uji" });
    expect(iso(k[0].tanggalMulaiKerja)).toBe("2026-06-01");
    const audit = await prisma.auditLog.findMany({ where: { namaTabel: "koreksi_tanggal_mulai_kerja" }, orderBy: { id: "asc" } });
    expect(audit.map((a) => [a.aksi, a.nilaiLama, a.nilaiBaru])).toEqual([["INSERT", null, "2026-04-01"], ["UPDATE", "2026-04-01", "2026-06-01"]]);
    expect(iso((await prisma.nominatifBulanan.findUniqueOrThrow({ where: { id: target.id } })).tanggalMulaiKerja)).toBe(iso(target.tanggalMulaiKerja));
  });

  it("'terapkan ke snapshot': semua bulan NIP itu berubah dan tercatat di audit; pegawai lain tidak tersentuh; yang sudah sama dilewati", async () => {
    const { nips } = await snapshotTiapBulan();
    const baris = await prisma.nominatifBulanan.findMany({ where: { pegawaiNip: { in: nips } }, orderBy: [{ pegawaiNip: "asc" }, { bulan: "asc" }] });
    const target = baris[0].pegawaiNip;
    const lain = baris.filter((b) => b.pegawaiNip !== target);
    const m = { nip: target, tanggal: "2026-04-01", alasan: "sesuai SK", terapkanKeSnapshot: true };
    const r = await simpanKoreksiTmt(prisma, m, admin);
    const semuaTarget = baris.filter((b) => b.pegawaiNip === target);
    const perluUbah = semuaTarget.filter((b) => iso(b.tanggalMulaiKerja) !== "2026-04-01").length;
    expect(r).toEqual({ ok: true, snapshotDiubah: perluUbah });
    expect(perluUbah).toBeGreaterThanOrEqual(1);
    for (const b of await prisma.nominatifBulanan.findMany({ where: { pegawaiNip: target } })) expect(iso(b.tanggalMulaiKerja)).toBe("2026-04-01");
    for (const b of lain.slice(0, 10)) expect(iso((await prisma.nominatifBulanan.findUniqueOrThrow({ where: { id: b.id } })).tanggalMulaiKerja)).toBe(iso(b.tanggalMulaiKerja));
    expect(await prisma.auditLog.count({ where: { namaTabel: "nominatif_bulanan", fieldDiubah: "tanggal_mulai_kerja", nilaiBaru: "2026-04-01" } })).toBe(perluUbah);
    // menyimpan lagi tanpa perubahan tidak mengubah apa pun
    expect(await simpanKoreksiTmt(prisma, m, admin)).toEqual({ ok: true, snapshotDiubah: 0 });
  });

  it("Standarisasi memakai koreksi: hanya NIP yang dikoreksi berubah, hitungannya dilaporkan di Periksa, dan tersimpan ke snapshot", async () => {
    const { buffer, nips } = await snapshotTiapBulan();
    // Setelah dua bulan tersimpan, sebagian baris baru bisa masuk Review (pegawai kini terdaftar): pakai hanya NIP yang tetap lolos klasifikasi.
    const lolos = new Set((await klasifikasiBerkas(prisma, buffer, 9, 2026)).nominatif.map((n) => n.pegawaiNip));
    const awal = new Map((await prisma.nominatifBulanan.findMany({ where: { pegawaiNip: { in: nips.filter((n) => lolos.has(n)) }, bulan: 9, tahun: 2026 } })).map((n) => [n.pegawaiNip, iso(n.tanggalMulaiKerja)]));
    const [a, b] = [...awal.keys()];
    expect(await simpanKoreksiTmt(prisma, { nip: a, tanggal: "2026-04-01", alasan: "sesuai SK", terapkanKeSnapshot: false }, admin)).toMatchObject({ ok: true });
    // koreksi yang sama dengan tanggal berkas tidak dihitung
    expect(await simpanKoreksiTmt(prisma, { nip: b, tanggal: awal.get(b)!, alasan: "sama dengan berkas", terapkanKeSnapshot: false }, admin)).toMatchObject({ ok: true });

    const h = await klasifikasiBerkas(prisma, buffer, 9, 2026);
    expect(h.tmtDikoreksi).toBe(awal.get(a) === "2026-04-01" ? 0 : 1);
    const hasil = new Map(h.nominatif.map((n) => [n.pegawaiNip, iso(n.tanggalMulaiKerja)]));
    expect(hasil.get(a)).toBe("2026-04-01");
    expect(hasil.get(b)).toBe(awal.get(b));
    for (const [nip, t] of awal) if (nip !== a) expect(hasil.get(nip), nip).toBe(t);

    const ringkasan = await periksaStandarisasi(prisma, buffer, { bulan: 9, tahun: 2026 });
    expect(ringkasan.tmtDikoreksi).toBe(h.tmtDikoreksi);
    await simpanStandarisasi(prisma, buffer, "sep-ulang.xlsx", { bulan: 9, tahun: 2026 }, { id: null, nama: "t" });
    expect(iso((await prisma.nominatifBulanan.findFirstOrThrow({ where: { pegawaiNip: a, bulan: 9, tahun: 2026 } })).tanggalMulaiKerja)).toBe("2026-04-01");
  });

  it("hapus: Standarisasi kembali memakai tanggal berkas; audit DELETE; id tak dikenal ditolak", async () => {
    const { buffer, nips } = await snapshotTiapBulan();
    const awal = await prisma.nominatifBulanan.findFirstOrThrow({ where: { pegawaiNip: { in: nips }, bulan: 9, tahun: 2026 } });
    await simpanKoreksiTmt(prisma, { nip: awal.pegawaiNip, tanggal: "2026-04-01", alasan: "sesuai SK", terapkanKeSnapshot: false }, admin);
    const k = await prisma.koreksiTanggalMulaiKerja.findFirstOrThrow();
    expect(await hapusKoreksiTmt(prisma, k.id + 999, admin)).toEqual({ ok: false, error: "Koreksi tidak ditemukan." });
    expect(await hapusKoreksiTmt(prisma, k.id, admin)).toEqual({ ok: true });
    expect(await prisma.koreksiTanggalMulaiKerja.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { namaTabel: "koreksi_tanggal_mulai_kerja", aksi: "DELETE" } })).toBe(1);
    const h = await klasifikasiBerkas(prisma, buffer, 9, 2026);
    expect(h.tmtDikoreksi).toBe(0);
    expect(iso(h.nominatif.find((n) => n.pegawaiNip === awal.pegawaiNip)!.tanggalMulaiKerja)).toBe(iso(awal.tanggalMulaiKerja));
  });
});
