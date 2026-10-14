/**
 * Membaca berkas .env.neon (rahasia produksi, diabaikan git) tanpa pernah mencetak nilainya. Dipakai skrip pengisian Neon.
 */
import { existsSync, readFileSync } from "node:fs";

export const BERKAS_NEON = ".env.neon";

export function bacaEnvNeon(): Record<string, string> {
  if (!existsSync(BERKAS_NEON)) throw new Error(`Berkas ${BERKAS_NEON} tidak ditemukan di folder proyek.`);
  const hasil: Record<string, string> = {};
  for (const baris of readFileSync(BERKAS_NEON, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(baris);
    if (!m) continue;
    hasil[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return hasil;
}

/** Ringkasan AMAN sebuah alamat koneksi: hanya nama server dan database (tanpa pengguna dan kata sandi). */
export function ringkasAlamat(alamat: string | undefined): { ok: boolean; host?: string; database?: string; pooler?: boolean; wilayah?: string; masalah?: string } {
  if (!alamat) return { ok: false, masalah: "kosong" };
  try {
    const u = new URL(alamat);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return { ok: false, masalah: "bukan alamat PostgreSQL" };
    const host = u.hostname;
    return { ok: true, host, database: u.pathname.replace("/", ""), pooler: host.includes("-pooler"), wilayah: /\.([a-z0-9-]+)\.aws\.neon\.tech$/.exec(host)?.[1] };
  } catch {
    return { ok: false, masalah: "format alamat tidak valid" };
  }
}
