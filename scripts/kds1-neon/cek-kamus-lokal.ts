/** Pemeriksaan kds_paritas setelah migrasi KDS1: setiap kode di Kamus Koreksi harus ada di master KDS Terpadu. Mencetak jumlah saja. */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { decodeKamusJabatanTambahan } from "./dekode";

const url = process.env.PARITAS_DATABASE_URL ?? "";
if (!/\/kds_paritas(\?|$)/.test(url)) throw new Error("Harus kds_paritas.");
const p = new PrismaClient({ datasourceUrl: url });

async function main() {
  const set = async (sql: string) => new Set((await p.$queryRawUnsafe<{ kode: string }[]>(sql)).map((x) => x.kode));
  const master: Record<string, Set<string>> = {
    StatusKepegawaian: await set("select kode from mst_status_kepegawaian"),
    Golongan: await set("select kode from mst_golongan"),
    JabatanFungsionalDosen: await set("select kode from mst_jabatan_fungsional_dosen"),
    JabatanFungsionalTendik: await set("select kode from mst_jabatan_fungsional_tendik"),
    FungsiUmumPelaksana: await set("select kode from mst_jabatan_fungsi_umum_pelaksana"),
    KategoriAkademisiLuar: await set("select kode from mst_kategori_akademisi_luar"),
    UnitKerja: await set("select kode from mst_unit_asal"),
  };
  const role = await set("select kode from mst_jabatan_tambahan_role");
  const unit = master.UnitKerja;
  const prodi = await set("select kode from mst_program_studi");
  let periksa = 0;
  let buruk = 0;
  for (const k of await p.kamusKoreksi.findMany()) {
    const m = master[k.jenisField];
    if (m) {
      periksa++;
      if (!m.has(k.nilaiResolusi)) buruk++;
    } else if (k.jenisField === "JabatanTambahan") {
      periksa++;
      const slot = decodeKamusJabatanTambahan(k.nilaiResolusi);
      if (!slot || slot.some((s) => !role.has(s.role) || (s.unit && !unit.has(s.unit)) || (s.prodi && !prodi.has(s.prodi)))) buruk++;
    }
  }
  console.log(`Entri kamus diperiksa: ${periksa}, kode tidak ada di master: ${buruk}`);
  if (buruk > 0) process.exit(1);
}
main().finally(() => p.$disconnect());
