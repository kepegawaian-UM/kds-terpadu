/** Aksi server Tambah Pegawai (F4.3c): login wajib, sukses menulis Nominatif bulan berjalan + audit, galat per kolom, NIP sudah ada. */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { tambahPegawai } from "@/app/(app)/nominatif/baru/actions";
import { bulanTahunSekarang } from "@/lib/laporan/periode";
import type { InputTambahPegawai } from "@/lib/nominatif/tambahManual";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";

const sesi = vi.hoisted(() => ({ user: { id: "u1", name: "Admin Uji" } as { id: string; name: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();

describe.skipIf(!ada)("Aksi Tambah Pegawai", () => {
  let masukan: InputTambahPegawai;
  beforeEach(async () => {
    sesi.user = { id: "u1", name: "Admin Uji" };
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    const [unit, dosen, status] = await Promise.all([
      prisma.unitAsal.findFirstOrThrow({ orderBy: { kode: "asc" } }),
      prisma.jabatanFungsionalDosen.findFirstOrThrow({ orderBy: { kode: "asc" } }),
      prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }),
    ]);
    masukan = {
      nip: "900000000000000001", nama: "Uji Manual", jenis_kelamin: "P", tanggal_lahir: "1991-02-03", jenis_pegawai_kode: "DSN", status_kepegawaian_kode: status.kode,
      golongan_kode: "III/a", jabatan_fungsional_dosen_kode: dosen.kode, unit_asal_kode: unit.kode, tanggal_mulai_kerja: "2026-10-01",
    };
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  it("menolak tanpa login dan tidak menulis apa pun", async () => {
    sesi.user = null;
    expect(await tambahPegawai(masukan)).toMatchObject({ ok: false, pesan: expect.stringMatching(/login/) });
    expect(await prisma.nominatifBulanan.count()).toBe(0);
  });

  it("berhasil: baris Nominatif bulan berjalan (WIB), pegawai, batch semu, dan audit tercatat", async () => {
    const h = await tambahPegawai({ ...masukan, pendidikan_terakhir: "  " });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const [bulan, tahun] = bulanTahunSekarang(new Date());
    const n = await prisma.nominatifBulanan.findUniqueOrThrow({ where: { id: h.id } });
    expect(n).toMatchObject({ pegawaiNip: masukan.nip, bulan, tahun, nama: "Uji Manual", pendidikanTerakhir: null });
    expect(await prisma.pegawai.count({ where: { nip: masukan.nip! } })).toBe(1);
    const batch = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: n.uploadBatchId } });
    expect(batch).toMatchObject({ jenis: "tambah_pegawai_manual", diunggahOlehNama: "Admin Uji", jumlahBerhasil: 1 });
    expect((await prisma.auditLog.findMany({ where: { namaTabel: "nominatif_bulanan", idRecord: String(h.id) } })).every((a) => a.aksi === "INSERT" && a.diubahOleh === "Admin Uji")).toBe(true);
    expect(await prisma.auditLog.count({ where: { idRecord: String(h.id) } })).toBeGreaterThan(8);
  });

  it("galat per kolom dikembalikan dan tidak ada yang tertulis", async () => {
    const h = await tambahPegawai({ ...masukan, nama: "", jenis_kelamin: "X", unit_asal_kode: "ZZZ", golongan_kode: null });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(Object.keys(h.galat).sort()).toEqual(["golongan_kode", "jenis_kelamin", "nama", "unit_asal_kode"]);
    expect(await prisma.nominatifBulanan.count()).toBe(0);
    expect(await prisma.uploadBatch.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("NIP yang sudah ada di Nominatif bulan berjalan ditolak dengan pesan pada kolom NIP (KDS2: galat basis data)", async () => {
    expect((await tambahPegawai(masukan)).ok).toBe(true);
    const h = await tambahPegawai({ ...masukan, nama: "Ganda" });
    expect(h).toMatchObject({ ok: false, galat: { nip: [expect.stringMatching(/sudah ada/)] } });
    expect(await prisma.nominatifBulanan.count()).toBe(1);
    expect(await prisma.uploadBatch.count({ where: { jenis: "tambah_pegawai_manual" } })).toBe(1);
  });
});
