/**
 * Menulis ulang prisma/seed-data/*.json dari tabel master `kds2_produksi` (kunci jawaban),
 * supaya master KDS Terpadu IDENTIK dengan KDS2. Hanya tabel master (unit, prodi, jabatan,
 * golongan, dst) - tidak menyentuh data pegawai. Jalankan: npx tsx scripts/ekspor-master-kds2.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { bukaKds2BacaSaja } from "./kds2-mysql";

export const TABEL_MASTER = [
  { tabel: "mst_jenis_pegawai", berkas: "jenisPegawai" },
  { tabel: "mst_status_kepegawaian", berkas: "statusKepegawaian" },
  { tabel: "mst_golongan", berkas: "golongan" },
  { tabel: "mst_jabatan_fungsional_dosen", berkas: "jabatanFungsionalDosen" },
  { tabel: "mst_jabatan_fungsional_tendik", berkas: "jabatanFungsionalTendik" },
  { tabel: "mst_jabatan_fungsi_umum_pelaksana", berkas: "jabatanFungsiUmumPelaksana" },
  { tabel: "mst_jabatan_tambahan_role", berkas: "jabatanTambahanRole" },
  { tabel: "mst_unit_induk", berkas: "unitInduk" },
  { tabel: "mst_unit_asal", berkas: "unitAsal" },
  { tabel: "mst_program_studi", berkas: "programStudi" },
  { tabel: "mst_kategori_akademisi_luar", berkas: "kategoriAkademisiLuar" },
  { tabel: "mst_komponen_kehadiran", berkas: "komponenKehadiran" },
] as const;

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** snake_case -> camelCase; kolom boolean MySQL (tinyint) tetap angka kecuali daftar di bawah. */
const KOLOM_BOOLEAN = new Set(["masuk_rekap_kehadiran"]);

export function barisKeJson(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[camel(k)] = KOLOM_BOOLEAN.has(k) ? Boolean(v) : v;
  }
  return out;
}

async function main() {
  const k = await bukaKds2BacaSaja();
  const dir = join(process.cwd(), "prisma", "seed-data");
  mkdirSync(dir, { recursive: true });
  for (const { tabel, berkas } of TABEL_MASTER) {
    const rows = await k.kueri<Record<string, unknown>>(`SELECT * FROM ${tabel} ORDER BY kode`);
    writeFileSync(join(dir, `${berkas}.json`), JSON.stringify(rows.map(barisKeJson), null, 2) + "\n");
    console.log(`${tabel}: ${rows.length} baris -> ${berkas}.json`);
  }
  await k.tutup();
}

if (process.argv[1]?.endsWith("ekspor-master-kds2.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
