/**
 * Harness oracle importer: menjalankan scripts/oracle/kds2-impor.php (importer KDS2 ASLI di SQLite memori,
 * tanpa MySQL dan tanpa data asli). Banyak kasus sekali jalan (Laravel + migrasi hanya di-boot sekali).
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { petakanIstilah } from "./istilah";
import { KDS2_PATH } from "./oracle";

const execFileAsync = promisify(execFile);
const SKRIP = resolve(process.cwd(), "scripts", "oracle", "kds2-impor.php");
const SKRIP_NOMINATIF = resolve(process.cwd(), "scripts", "oracle", "kds2-nominatif.php");
const SKRIP_TAMBAH = resolve(process.cwd(), "scripts", "oracle", "kds2-tambah-pegawai.php");
const SKRIP_KOREKSI = resolve(process.cwd(), "scripts", "oracle", "kds2-koreksi.php");
const PHP = process.env.KDS2_PHP ?? "php";

export type Sel = string | number | null | { f: string; v: number };

export type KeadaanImpor = {
  pegawai?: string[];
  nominatif?: { nama?: string; nip: string; bulan: number; tahun: number; jenis: string; tmt: string; jt?: { role: string; unit?: string | null; prodi?: string | null; status: string }[] }[];
  rekap?: { nip: string; bulan: number; tahun: number; komponen: Record<string, string> }[];
};

export type KasusOracleImpor = {
  id: string;
  keadaan: KeadaanImpor;
  berkas: string;
  tulisBerkas?: { baris: Sel[][]; namaSheet?: string[]; indeksData?: number };
  bulan: number;
  tahun: number;
  namaSheet?: string | null;
  namaFileAsli?: string;
};

export type HasilKasusImpor = {
  galat: string | null;
  batch: {
    jenis: string;
    nama_file: string;
    diupload_oleh: string;
    total_baris: number;
    baris_berhasil: number;
    baris_gagal: number;
  } | null;
  rekap: { nip: string; bulan: number; tahun: number; baru: boolean; detail: [string, string][] }[];
  catatan: [number, string, string][];
};

export async function oracleImporTersedia(): Promise<boolean> {
  return existsSync(join(KDS2_PATH, "vendor", "autoload.php")) && existsSync(SKRIP);
}

export async function jalankanOracleImpor(kasus: KasusOracleImpor[]): Promise<Record<string, HasilKasusImpor> & { _konfigurasi: Record<string, unknown> }> {
  return jalankanSkrip(SKRIP, kasus);
}

/** Oracle Koreksi Rekap: kasus = {id, keadaan, langkah[]} (lihat scripts/oracle/kds2-koreksi.php). */
/** Oracle Nominatif: masukan {master?, kasus[]} (lihat scripts/oracle/kds2-nominatif.php). */
export async function jalankanOracleNominatif(masukan: { master?: Record<string, unknown[]>; kasus: unknown[] }): Promise<Record<string, unknown>> {
  return jalankanSkrip(SKRIP_NOMINATIF, masukan.kasus, masukan.master);
}

/** Oracle Tambah Pegawai manual (lihat scripts/oracle/kds2-tambah-pegawai.php). */
export async function jalankanOracleTambahPegawai(masukan: { master?: Record<string, unknown[]>; kasus: unknown[] }): Promise<Record<string, unknown>> {
  return jalankanSkrip(SKRIP_TAMBAH, masukan.kasus, masukan.master);
}

export async function jalankanOracleKoreksi(kasus: unknown[]): Promise<Record<string, unknown>> {
  return jalankanSkrip(SKRIP_KOREKSI, kasus);
}

async function jalankanSkrip<T>(skrip: string, kasus: unknown[], master?: Record<string, unknown[]>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "kds-impor-oracle-"));
  const masuk = join(dir, "masuk.json");
  const keluar = join(dir, "keluar.json");
  try {
    writeFileSync(masuk, JSON.stringify({ kasus, master }));
    await execFileAsync(PHP, [skrip, masuk, keluar], { timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, KDS2_PATH } });
    return petakanIstilah(JSON.parse(readFileSync(keluar, "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
