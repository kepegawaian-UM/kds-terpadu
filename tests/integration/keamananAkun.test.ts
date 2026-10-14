/**
 * Keamanan akun: pembatasan percobaan masuk (5 gagal = kunci 15 menit), ganti kata sandi, ganti nama, dan reset darurat.
 * Pengguna uji dibuat dan dihapus sendiri; kata sandi uji hanya nilai sintetis di berkas ini.
 */
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { MASA_KUNCI_MENIT, MAKS_GAGAL, gantiNama, gantiSandi, periksaKebijakanSandi, periksaMasuk, resetSandiAdmin } from "@/lib/auth/masuk";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const EMAIL = "uji-keamanan@contoh.test";
const SANDI = "SandiUji-12345";
const T0 = new Date("2026-10-14T03:00:00.000Z");
const menit = (n: number) => new Date(T0.getTime() + n * 60_000);

async function buatPengguna() {
  return prisma.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(SANDI, 4), nama: "Admin Uji" } });
}
const ambil = () => prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });

describe("kebijakan kata sandi", () => {
  it("menolak yang pendek, tanpa angka/huruf, memuat email, atau sama dengan yang lama; menerima yang baik", () => {
    expect(periksaKebijakanSandi("Pendek1")).toMatch(/minimal 12/);
    expect(periksaKebijakanSandi("hanyahurufsajaaaa")).toMatch(/huruf dan angka/);
    expect(periksaKebijakanSandi("123456789012345")).toMatch(/huruf dan angka/);
    expect(periksaKebijakanSandi("xx-admin-1234567", { email: "admin@contoh.ac.id" })).toMatch(/bagian dari email/);
    expect(periksaKebijakanSandi("SandiLama-12345", { lama: "SandiLama-12345" })).toMatch(/berbeda/);
    expect(periksaKebijakanSandi("a".repeat(150) + "1" + "b".repeat(60))).toMatch(/terlalu panjang/);
    expect(periksaKebijakanSandi("SandiBaru-67890", { email: "admin@contoh.ac.id", lama: "SandiLama-12345" })).toBeNull();
  });
});

describe.skipIf(!ada)("masuk, ganti sandi, dan reset", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await buatPengguna();
  });
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { namaTabel: "user" } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  });
  afterAll(() => prisma.$disconnect());

  it("kata sandi benar masuk; email tidak peka huruf besar/kecil; salah atau email tak dikenal sama-sama 'salah'", async () => {
    expect(await periksaMasuk(prisma, EMAIL, SANDI, T0)).toMatchObject({ ok: true, user: { email: EMAIL, nama: "Admin Uji" } });
    expect(await periksaMasuk(prisma, ` ${EMAIL.toUpperCase()} `, SANDI, T0)).toMatchObject({ ok: true });
    expect(await periksaMasuk(prisma, EMAIL, "salah", T0)).toEqual({ ok: false, alasan: "salah" });
    expect(await periksaMasuk(prisma, "tidak-ada@contoh.test", SANDI, T0)).toEqual({ ok: false, alasan: "salah" });
  });

  it("5 gagal beruntun mengunci 15 menit; selama terkunci kata sandi BENAR pun ditolak; hitungan gagal ke-1..4 tidak mengunci", async () => {
    for (let i = 1; i < MAKS_GAGAL; i++) {
      expect(await periksaMasuk(prisma, EMAIL, "salah", menit(i))).toEqual({ ok: false, alasan: "salah" });
      expect((await ambil()).gagalMasuk).toBe(i);
    }
    expect(await periksaMasuk(prisma, EMAIL, "salah", menit(5))).toEqual({ ok: false, alasan: "terkunci", sisaMenit: MASA_KUNCI_MENIT });
    const terkunci = await ambil();
    expect(terkunci.gagalMasuk).toBe(0);
    expect(terkunci.terkunciSampai?.toISOString()).toBe(menit(5 + MASA_KUNCI_MENIT).toISOString());

    expect(await periksaMasuk(prisma, EMAIL, SANDI, menit(6))).toEqual({ ok: false, alasan: "terkunci", sisaMenit: MASA_KUNCI_MENIT - 1 });
    expect(await periksaMasuk(prisma, EMAIL, SANDI, menit(5 + MASA_KUNCI_MENIT - 1))).toMatchObject({ ok: false, alasan: "terkunci", sisaMenit: 1 });
    // percobaan saat terkunci tidak memperpanjang kunci
    expect((await ambil()).terkunciSampai?.toISOString()).toBe(menit(5 + MASA_KUNCI_MENIT).toISOString());
    expect(await prisma.auditLog.count({ where: { namaTabel: "user", fieldDiubah: "terkunciSampai" } })).toBe(1);
  });

  it("kunci kedaluwarsa: bisa masuk lagi; hitungan mulai dari nol; berhasil masuk mengembalikan hitungan gagal ke nol", async () => {
    for (let i = 0; i < MAKS_GAGAL; i++) await periksaMasuk(prisma, EMAIL, "salah", menit(i));
    expect(await periksaMasuk(prisma, EMAIL, SANDI, menit(5 + MASA_KUNCI_MENIT))).toMatchObject({ ok: true });
    expect(await ambil()).toMatchObject({ gagalMasuk: 0, terkunciSampai: null });

    for (let i = 0; i < 3; i++) await periksaMasuk(prisma, EMAIL, "salah", menit(100 + i));
    expect((await ambil()).gagalMasuk).toBe(3);
    await periksaMasuk(prisma, EMAIL, SANDI, menit(104));
    expect((await ambil()).gagalMasuk).toBe(0);
    // setelah reset, perlu 5 gagal lagi untuk terkunci
    for (let i = 0; i < MAKS_GAGAL - 1; i++) await periksaMasuk(prisma, EMAIL, "salah", menit(110 + i));
    expect(await periksaMasuk(prisma, EMAIL, SANDI, menit(120))).toMatchObject({ ok: true });
  });

  it("ganti sandi: konfirmasi tak sama, kebijakan, sandi lama salah (dihitung gagal), lalu berhasil; sandi lama tidak lagi berlaku; audit tanpa kata sandi", async () => {
    const user = await ambil();
    const baru = "SandiBaru-67890";
    expect(await gantiSandi(prisma, user.id, SANDI, baru, "beda-12345678", T0)).toEqual({ ok: false, error: "Konfirmasi kata sandi baru tidak sama." });
    expect(await gantiSandi(prisma, user.id, SANDI, "pendek1", "pendek1", T0)).toMatchObject({ ok: false, error: expect.stringContaining("minimal 12") });
    expect(await gantiSandi(prisma, user.id, SANDI, SANDI, SANDI, T0)).toMatchObject({ ok: false, error: expect.stringContaining("berbeda") });
    expect(await gantiSandi(prisma, user.id, "salah-sekali", baru, baru, T0)).toEqual({ ok: false, error: "Kata sandi saat ini salah." });
    expect((await ambil()).gagalMasuk).toBe(1);
    expect((await ambil()).passwordHash).toBe(user.passwordHash);

    expect(await gantiSandi(prisma, user.id, SANDI, baru, baru, T0)).toEqual({ ok: true });
    expect(await periksaMasuk(prisma, EMAIL, SANDI, T0)).toEqual({ ok: false, alasan: "salah" });
    expect(await periksaMasuk(prisma, EMAIL, baru, T0)).toMatchObject({ ok: true });
    expect((await ambil()).sandiDiubahPada?.toISOString()).toBe(T0.toISOString());

    const audit = await prisma.auditLog.findMany({ where: { namaTabel: "user", fieldDiubah: "passwordHash" } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(baru);
    expect(JSON.stringify(audit)).not.toContain(SANDI);
    expect(audit[0]).toMatchObject({ nilaiLama: null, nilaiBaru: null, aksi: "UPDATE", diubahOleh: "Admin Uji" });
  });

  it("menebak sandi lama lewat halaman Akun ikut mengunci akun", async () => {
    const user = await ambil();
    for (let i = 0; i < MAKS_GAGAL - 1; i++) await gantiSandi(prisma, user.id, "tebakan", "SandiBaru-67890", "SandiBaru-67890", menit(i));
    const h = await gantiSandi(prisma, user.id, "tebakan", "SandiBaru-67890", "SandiBaru-67890", menit(5));
    expect(h).toEqual({ ok: false, error: `Terlalu banyak percobaan. Coba lagi dalam ${MASA_KUNCI_MENIT} menit.` });
    expect(await periksaMasuk(prisma, EMAIL, SANDI, menit(6))).toMatchObject({ ok: false, alasan: "terkunci" });
  });

  it("reset darurat: membuka kunci, mengikuti kebijakan, mencatat audit tanpa kata sandi, dan menolak email tak dikenal", async () => {
    for (let i = 0; i < MAKS_GAGAL; i++) await periksaMasuk(prisma, EMAIL, "salah", menit(i));
    expect(await resetSandiAdmin(prisma, "tidak-ada@contoh.test", "SandiBaru-67890")).toEqual({ ok: false, error: "Tidak ada akun dengan email itu." });
    expect(await resetSandiAdmin(prisma, EMAIL, "pendek")).toMatchObject({ ok: false });
    const baru = "DaruratBaru-24680";
    expect(await resetSandiAdmin(prisma, EMAIL.toUpperCase(), baru, menit(6))).toEqual({ ok: true });
    expect(await ambil()).toMatchObject({ gagalMasuk: 0, terkunciSampai: null });
    expect(await periksaMasuk(prisma, EMAIL, baru, menit(7))).toMatchObject({ ok: true });
    const audit = await prisma.auditLog.findMany({ where: { namaTabel: "user", fieldDiubah: "passwordHash" } });
    expect(audit.map((a) => a.diubahOleh)).toEqual(["sistem (skrip reset darurat)"]);
    expect(JSON.stringify(audit)).not.toContain(baru);
  });

  it("ganti nama: dipangkas, dibatasi panjangnya, dan tercatat", async () => {
    const user = await ambil();
    expect(await gantiNama(prisma, user.id, " ")).toMatchObject({ ok: false });
    expect(await gantiNama(prisma, user.id, "x".repeat(101))).toMatchObject({ ok: false });
    expect(await gantiNama(prisma, user.id, "  Nama   Baru  ")).toEqual({ ok: true });
    expect((await ambil()).nama).toBe("Nama Baru");
    expect(await prisma.auditLog.count({ where: { namaTabel: "user", fieldDiubah: "nama" } })).toBe(1);
    expect(await gantiNama(prisma, "tidak-ada", "Nama Lain")).toMatchObject({ ok: false });
  });
});
