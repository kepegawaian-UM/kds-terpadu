/**
 * Harness oracle paritas: menjalankan scripts/oracle/kds2-oracle.php (kode KDS2 asli, hanya-baca)
 * dan mengembalikan hasilnya. Banyak permintaan sekali jalan (Laravel di-boot sekali).
 * Berkas masukan/keluaran sementara berisi data pegawai asli dan SELALU dihapus.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PermintaanOracle = { id: string; laporan: string; params?: Record<string, unknown> };
export type HasilOracle = Record<string, unknown>;

const SKRIP = resolve(process.cwd(), "scripts", "oracle", "kds2-oracle.php");
const PHP = process.env.KDS2_PHP ?? "php";
export const KDS2_PATH = process.env.KDS2_PATH ?? "D:/ANAS/Project/Sistem Kepegawaian UM";

export async function oracleTersedia(): Promise<boolean> {
  if (!existsSync(KDS2_PATH) || !existsSync(SKRIP)) return false;
  try {
    const h = await tanyaOracle([{ id: "ping", laporan: "ping" }]);
    return (h.ping as { db?: string })?.db === (process.env.KDS2_DB ?? "kds2_produksi");
  } catch {
    return false;
  }
}

export async function tanyaOracle(permintaan: PermintaanOracle[]): Promise<HasilOracle> {
  const dir = mkdtempSync(join(tmpdir(), "kds-oracle-"));
  const masuk = join(dir, "masuk.json");
  const keluar = join(dir, "keluar.json");
  try {
    writeFileSync(masuk, JSON.stringify({ permintaan }));
    await execFileAsync(PHP, [SKRIP, masuk, keluar], {
      timeout: 10 * 60_000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, KDS2_PATH },
    });
    return JSON.parse(readFileSync(keluar, "utf8")) as HasilOracle;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Ambil hasil satu permintaan; melempar bila oracle melaporkan galat. */
export function hasil<T>(h: HasilOracle, id: string): T {
  const r = h[id] as { error?: string } | undefined;
  if (r === undefined) throw new Error(`oracle: tidak ada hasil untuk "${id}"`);
  if (r && typeof r === "object" && "error" in r && r.error) throw new Error(`oracle [${id}]: ${r.error}`);
  return r as T;
}
