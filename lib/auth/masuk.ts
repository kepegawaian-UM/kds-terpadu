/**
 * Keamanan akun: pembatasan percobaan masuk, ganti kata sandi, dan reset darurat. Fungsi murni terhadap klien Prisma (mudah dites).
 *
 * Aturan: 5 kali gagal beruntun mengunci akun 15 menit (setara KDS2). Selama terkunci kata sandi TIDAK diperiksa (jawaban benar pun
 * ditolak), supaya penebak tidak tahu kapan tebakannya benar. Berhasil masuk mengembalikan hitungan ke nol. Pengguna yang tidak ada
 * diperlakukan sama dengan kata sandi salah (waktu bcrypt disamakan) sehingga alamat email tidak bisa ditebak dari responsnya.
 * Kata sandi tidak pernah ditulis ke log, audit, atau pesan galat.
 */
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

export const MAKS_GAGAL = 5;
export const MASA_KUNCI_MENIT = 15;
export const MIN_PANJANG_SANDI = 12;
const BIAYA_BCRYPT = 10;
// Hash tiruan untuk menyamakan waktu pemeriksaan bila email tidak ada.
const HASH_TIRUAN = bcrypt.hashSync("tiruan-untuk-menyamakan-waktu", BIAYA_BCRYPT);

export type HasilMasuk =
  | { ok: true; user: { id: string; email: string; nama: string } }
  | { ok: false; alasan: "salah" }
  | { ok: false; alasan: "terkunci"; sisaMenit: number };

const normalEmail = (e: string) => e.trim().toLowerCase();

async function catatAudit(prisma: PrismaClient, userId: string, field: string, oleh: string, sekarang: Date) {
  await prisma.auditLog.create({
    data: { namaTabel: "user", idRecord: userId, fieldDiubah: field, nilaiLama: null, nilaiBaru: null, diubahOleh: oleh, diubahPada: sekarang, aksi: "UPDATE" },
  });
}

export async function periksaMasuk(prisma: PrismaClient, emailMentah: string, sandi: string, sekarang: Date = new Date()): Promise<HasilMasuk> {
  const email = normalEmail(emailMentah);
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (!user) {
    await bcrypt.compare(sandi, HASH_TIRUAN);
    return { ok: false, alasan: "salah" };
  }
  if (user.terkunciSampai && user.terkunciSampai > sekarang) {
    return { ok: false, alasan: "terkunci", sisaMenit: Math.max(1, Math.ceil((user.terkunciSampai.getTime() - sekarang.getTime()) / 60_000)) };
  }
  if (await bcrypt.compare(sandi, user.passwordHash)) {
    if (user.gagalMasuk !== 0 || user.terkunciSampai) await prisma.user.update({ where: { id: user.id }, data: { gagalMasuk: 0, terkunciSampai: null } });
    return { ok: true, user: { id: user.id, email: user.email, nama: user.nama } };
  }
  // Gagal: tambah hitungan secara atomik; bila mencapai batas, kunci dan mulai hitungan baru.
  const sesudah = await prisma.user.update({ where: { id: user.id }, data: { gagalMasuk: { increment: 1 } }, select: { gagalMasuk: true } });
  if (sesudah.gagalMasuk >= MAKS_GAGAL) {
    await prisma.user.update({ where: { id: user.id }, data: { gagalMasuk: 0, terkunciSampai: new Date(sekarang.getTime() + MASA_KUNCI_MENIT * 60_000) } });
    await catatAudit(prisma, user.id, "terkunciSampai", "sistem (terlalu banyak percobaan masuk)", sekarang);
    return { ok: false, alasan: "terkunci", sisaMenit: MASA_KUNCI_MENIT };
  }
  return { ok: false, alasan: "salah" };
}

/** Aturan kata sandi baru. Mengembalikan pesan galat atau null bila boleh. */
export function periksaKebijakanSandi(baru: string, konteks: { email?: string; lama?: string } = {}): string | null {
  if (baru.length < MIN_PANJANG_SANDI) return `Kata sandi minimal ${MIN_PANJANG_SANDI} karakter.`;
  if (baru.length > 200) return "Kata sandi terlalu panjang (maksimal 200 karakter).";
  if (!/[A-Za-z]/.test(baru) || !/\d/.test(baru)) return "Kata sandi harus memuat huruf dan angka.";
  if (konteks.email && baru.toLowerCase().includes(konteks.email.split("@")[0].toLowerCase()) && konteks.email.split("@")[0].length >= 4) return "Kata sandi tidak boleh memuat bagian dari email.";
  if (konteks.lama !== undefined && baru === konteks.lama) return "Kata sandi baru harus berbeda dari yang lama.";
  return null;
}

export type HasilGanti = { ok: true } | { ok: false; error: string };

/**
 * Ganti kata sandi sendiri. Kata sandi lama diperiksa lewat periksaMasuk, jadi tebakan salah ikut dihitung dan dapat mengunci akun
 * (melindungi dari orang yang memakai sesi yang tertinggal).
 */
export async function gantiSandi(prisma: PrismaClient, userId: string, lama: string, baru: string, konfirmasi: string, sekarang: Date = new Date()): Promise<HasilGanti> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Akun tidak ditemukan. Silakan masuk ulang." };
  if (baru !== konfirmasi) return { ok: false, error: "Konfirmasi kata sandi baru tidak sama." };
  const aturan = periksaKebijakanSandi(baru, { email: user.email, lama });
  if (aturan) return { ok: false, error: aturan };
  const cek = await periksaMasuk(prisma, user.email, lama, sekarang);
  if (!cek.ok) {
    return { ok: false, error: cek.alasan === "terkunci" ? `Terlalu banyak percobaan. Coba lagi dalam ${cek.sisaMenit} menit.` : "Kata sandi saat ini salah." };
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(baru, BIAYA_BCRYPT), sandiDiubahPada: sekarang } });
  await catatAudit(prisma, user.id, "passwordHash", user.nama, sekarang);
  return { ok: true };
}

/** Ganti nama tampilan. */
export async function gantiNama(prisma: PrismaClient, userId: string, namaMentah: string): Promise<HasilGanti> {
  const nama = namaMentah.trim().replace(/\s+/g, " ");
  if (nama.length < 2 || nama.length > 100) return { ok: false, error: "Nama harus 2 sampai 100 karakter." };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Akun tidak ditemukan. Silakan masuk ulang." };
  if (user.nama === nama) return { ok: true };
  await prisma.user.update({ where: { id: userId }, data: { nama } });
  await prisma.auditLog.create({ data: { namaTabel: "user", idRecord: userId, fieldDiubah: "nama", nilaiLama: user.nama, nilaiBaru: nama, diubahOleh: nama, diubahPada: new Date(), aksi: "UPDATE" } });
  return { ok: true };
}

/**
 * Reset darurat oleh pemilik server (skrip admin:reset-sandi): tanpa kata sandi lama, membuka kunci, mengikuti kebijakan sandi yang sama.
 */
export async function resetSandiAdmin(prisma: PrismaClient, emailMentah: string, baru: string, sekarang: Date = new Date()): Promise<HasilGanti> {
  const user = await prisma.user.findFirst({ where: { email: { equals: normalEmail(emailMentah), mode: "insensitive" } } });
  if (!user) return { ok: false, error: "Tidak ada akun dengan email itu." };
  const aturan = periksaKebijakanSandi(baru, { email: user.email });
  if (aturan) return { ok: false, error: aturan };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(baru, BIAYA_BCRYPT), sandiDiubahPada: sekarang, gagalMasuk: 0, terkunciSampai: null } });
  await catatAudit(prisma, user.id, "passwordHash", "sistem (skrip reset darurat)", sekarang);
  return { ok: true };
}
