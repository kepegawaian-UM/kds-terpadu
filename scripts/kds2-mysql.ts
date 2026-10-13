import "dotenv/config";
import mysql from "mysql2/promise";

/**
 * Koneksi HANYA-BACA ke MySQL KDS2 (`kds2_produksi`, kunci jawaban paritas). Berlapis:
 *  1. sesi MySQL diset READ ONLY (server menolak INSERT/UPDATE/DELETE/DDL),
 *  2. fungsi `kueri` menolak pernyataan selain SELECT/SHOW/DESCRIBE.
 * JANGAN menyalin NIP/nama pegawai ke repo: pakai hanya untuk agregat (COUNT/SUM/checksum).
 */
export const KDS2_MYSQL_URL = process.env.KDS2_MYSQL_URL ?? "mysql://root@127.0.0.1:3306/kds2_produksi";

export type Kds2Baca = {
  kueri<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tutup(): Promise<void>;
};

const HANYA_BACA = /^\s*(select|show|describe|explain)\b/i;

export function pastikanHanyaBaca(sql: string): void {
  if (!HANYA_BACA.test(sql)) {
    throw new Error(`Hanya kueri baca yang diizinkan ke KDS2: ${sql.slice(0, 60)}`);
  }
}

export async function bukaKds2BacaSaja(): Promise<Kds2Baca> {
  const conn = await mysql.createConnection({ uri: KDS2_MYSQL_URL, dateStrings: true });
  await conn.query("SET SESSION TRANSACTION READ ONLY");
  return {
    async kueri<T>(sql: string, params: unknown[] = []) {
      pastikanHanyaBaca(sql);
      const [rows] = await conn.query(sql, params);
      return rows as T[];
    },
    tutup: () => conn.end(),
  };
}

/** Apakah MySQL KDS2 bisa dijangkau? Dipakai tes paritas untuk skip dengan pesan jelas. */
export async function kds2Tersedia(): Promise<boolean> {
  try {
    const k = await bukaKds2BacaSaja();
    await k.kueri("SELECT 1");
    await k.tutup();
    return true;
  } catch {
    return false;
  }
}
