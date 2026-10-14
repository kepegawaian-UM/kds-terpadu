/**
 * Harness ORACLE KDS1: menjalankan kode KDS1 ASLI (importBatch, resolveRow) lewat scripts/oracle/kds1-oracle.ts terhadap database
 * lokal `kds1_oracle` (siapkan: npx tsx scripts/oracle/siapkan-kds1-oracle.ts). Zona waktu proses KDS1 dipaksa UTC (seperti Vercel).
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);
export const KDS1_PATH = process.env.KDS1_PATH ?? "D:/ANAS/Project/tool-standardisasi-nominatif-simpega-um";
const DRIVER = resolve(process.cwd(), "scripts", "oracle", "kds1-oracle.ts");

/** Alamat kds1_oracle: kredensial dan host sama dengan TEST_DATABASE_URL (PostgreSQL lokal), nama database diganti. */
export function urlKds1Oracle(): string | null {
  const t = process.env.TEST_DATABASE_URL;
  if (!t) return null;
  const u = new URL(t);
  if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return null;
  u.pathname = "/kds1_oracle";
  return u.toString();
}

export async function oracleKds1Tersedia(): Promise<boolean> {
  const url = urlKds1Oracle();
  if (!url || !existsSync(join(KDS1_PATH, "prisma", "schema.prisma")) || !existsSync(DRIVER)) return false;
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await db.$queryRawUnsafe("SELECT 1 FROM upload_batch LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await db.$disconnect();
  }
}

export type MasukanOracleKds1 = {
  master: Record<string, Record<string, unknown>[]>;
  kamus?: { jenisField: string; kunciMentah: string; nilaiResolusi: string }[];
  nipTerdaftar?: string[];
  nominatifLama?: { nip: string; bulan: number; tahun: number; jenisKode: string; statusKode: string; unitKode: string }[];
  kasus: {
    id: string;
    berkas: string;
    namaFile: string;
    bulan: number;
    tahun: number;
    langkahResolve?: { urutan: number; kelompok: string; data: Record<string, unknown>; ingat: Record<string, boolean> }[];
  }[];
};

export type KeluaranKasusKds1 = {
  galat: string | null;
  batch: { bulan: number; tahun: number; namaFileAsli: string; status: string; jumlahBarisTotal: number; jumlahBerhasil: number; jumlahPerluReview: number; petaKolomTerdeteksi: unknown } | null;
  batchLain: number;
  batchLamaStatus: string[];
  nominatif: {
    nip: string; bulan: number; tahun: number; nama: string; jenisKelamin: string; tanggalLahir: string | null; pendidikanTerakhir: string | null;
    jenisPegawaiKode: string; statusKepegawaianKode: string; golonganKode: string | null; jabatanFungsionalDosenKode: string | null; jabatanFungsionalTendikKode: string | null;
    jabatanFungsiUmumKode: string | null; kategoriAkademisiLuarKode: string | null; unitAsalKode: string; tanggalMulaiKerja: string; dariBatchBaru: boolean;
    jabatanTambahan: { role: string; unit: string | null; prodi: string | null; status: string }[];
  }[];
  barisBermasalah: { nip: string; alasanUtama: string; detailAlasan: string; status: string; dataMentah: unknown; resolvedFields: unknown }[];
  kamus: { jenisField: string; kunciMentah: string; nilaiResolusi: string }[];
  pegawai: string[];
};

export async function jalankanOracleKds1(masukan: MasukanOracleKds1): Promise<Record<string, KeluaranKasusKds1>> {
  const url = urlKds1Oracle();
  if (!url) throw new Error("kds1_oracle tidak tersedia (TEST_DATABASE_URL harus PostgreSQL lokal).");
  const dir = mkdtempSync(join(tmpdir(), "kds-kds1-oracle-"));
  const masuk = join(dir, "masuk.json");
  const keluar = join(dir, "keluar.json");
  try {
    writeFileSync(masuk, JSON.stringify(masukan));
    await execFileAsync("npx", ["tsx", "--tsconfig", join(KDS1_PATH, "tsconfig.json"), DRIVER, masuk, keluar], {
      cwd: KDS1_PATH, timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024, shell: true,
      env: { ...process.env, TZ: "UTC", DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, NODE_ENV: "test" },
    });
    return JSON.parse(readFileSync(keluar, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
