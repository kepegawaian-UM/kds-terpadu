/**
 * Menjalankan rangkaian paritas PENUH (semua kombinasi filter) terhadap KDS2 lewat oracle. Lambat
 * (beberapa menit). Prasyarat: MySQL kds2_produksi, php, folder KDS2, dan kds_paritas terisi (F2).
 */
import { spawn } from "node:child_process";

const anak = spawn("npx", ["vitest", "run", "tests/paritas/penuh.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PARITAS_PENUH: "1" },
});
anak.on("exit", (kode) => process.exit(kode ?? 0));
