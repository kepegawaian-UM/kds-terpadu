/**
 * Menjalankan server pengembangan (port 3001) dengan database `kds_paritas` (salinan data asli,
 * hanya lokal) - untuk memeriksa tampilan laporan dengan data sungguhan. Login memakai akun
 * admin yang sama seperti di kds_dev (kata sandi dari SEED_ADMIN_PASSWORD di .env).
 */
import "dotenv/config";
import { spawn } from "node:child_process";

const url = process.env.PARITAS_DATABASE_URL;
if (!url) {
  console.error("PARITAS_DATABASE_URL belum diisi di .env (jalankan scripts/siapkan-db-lokal.ts).");
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };
const anak = spawn("npx", ["next", "dev", "-p", "3001"], { stdio: "inherit", env, shell: true });
anak.on("exit", (kode) => process.exit(kode ?? 0));
