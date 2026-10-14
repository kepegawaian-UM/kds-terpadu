/**
 * Reset darurat kata sandi admin (lupa kata sandi / akun terkunci). Dijalankan oleh pemilik server yang punya akses ke database;
 * tidak memakai email. Kata sandi diketik di terminal (tidak tampil di layar), tidak pernah dicetak, disimpan hanya sebagai hash.
 * Membuka kunci akun, dan mencatat satu baris di audit_log (tanpa kata sandi).
 *
 *   npm run admin:reset-sandi -- admin@contoh.ac.id
 *
 * Terhadap database yang ditunjuk DATABASE_URL (di .env atau variabel lingkungan). Untuk Neon, isi DATABASE_URL_UNPOOLED/DATABASE_URL
 * sementara di terminal Anda sendiri; jangan menuliskannya ke berkas yang di-commit.
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { resetSandiAdmin } from "../lib/auth/masuk";

/** Membaca satu baris dari terminal tanpa menampilkan ketikan. */
function bacaTersembunyi(pertanyaan: string): Promise<string> {
  return new Promise((selesai, gagal) => {
    if (!process.stdin.isTTY) return gagal(new Error("Skrip ini harus dijalankan di terminal interaktif (kata sandi diketik langsung)."));
    process.stdout.write(pertanyaan);
    const stdin = process.stdin;
    let isi = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const saatData = (c: string) => {
      for (const ch of c) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", saatData);
          process.stdout.write("\n");
          return selesai(isi);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          return gagal(new Error("Dibatalkan."));
        }
        if (ch === "\u007f" || ch === "\b") isi = isi.slice(0, -1);
        else isi += ch;
      }
    };
    stdin.on("data", saatData);
  });
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Pakai: npm run admin:reset-sandi -- <email admin>");
  const prisma = new PrismaClient();
  try {
    const nama = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] ?? "(tidak diketahui)";
    console.log(`Database: ${nama}`);
    const baru = await bacaTersembunyi("Kata sandi baru: ");
    const ulang = await bacaTersembunyi("Ulangi kata sandi baru: ");
    if (baru !== ulang) throw new Error("Kedua isian tidak sama.");
    const h = await resetSandiAdmin(prisma, email, baru);
    if (!h.ok) throw new Error(h.error);
    console.log("Kata sandi diganti dan kunci akun dibuka. Masuk dengan kata sandi baru.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Gagal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
