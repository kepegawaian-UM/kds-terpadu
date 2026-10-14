/**
 * Membandingkan master KDS1 (Neon, baca-saja) dengan master KDS Terpadu (kds_paritas lokal) untuk migrasi Kamus Koreksi:
 * nilai di kamus berupa KODE master, jadi kode KDS1 harus diterjemahkan lewat NAMA ke kode KDS Terpadu. Hanya kode dan nama master dicetak.
 */
import { PrismaClient } from "@prisma/client";

import { denganKds1 } from "./sambung";

export const MASTER = [
  { tabel: "mst_golongan", nama: `"kode"` },
  { tabel: "mst_status_kepegawaian", nama: `"nama"` },
  { tabel: "mst_jabatan_fungsional_dosen", nama: `"nama"` },
  { tabel: "mst_jabatan_fungsional_tendik", nama: `"jabatanPokok" || ' ' || "jenjang"` },
  { tabel: "mst_jabatan_fungsi_umum_pelaksana", nama: `"nama"` },
  { tabel: "mst_kategori_akademisi_luar", nama: `"nama"` },
  { tabel: "mst_unit_asal", nama: `"nama"` },
  { tabel: "mst_program_studi", nama: `"nama"` },
  { tabel: "mst_jabatan_tambahan_role", nama: `"namaRole"` },
  { tabel: "mst_jenis_pegawai", nama: `"nama"` },
];

export const norm = (s: string) => s.toLowerCase().replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
export type PetaMaster = Map<string, { kode: string; nama: string }[]>;

export async function bacaMasterTerpadu(prisma: PrismaClient): Promise<Record<string, { kode: string; nama: string }[]>> {
  const hasil: Record<string, { kode: string; nama: string }[]> = {};
  for (const m of MASTER) hasil[m.tabel] = await prisma.$queryRawUnsafe(`select "kode", ${m.nama} as nama from ${m.tabel}`);
  return hasil;
}

async function main() {
  const url = process.env.PARITAS_DATABASE_URL;
  if (!url || !/\/kds_paritas(\?|$)/.test(url)) throw new Error("PARITAS_DATABASE_URL harus menunjuk database lokal kds_paritas.");
  const lokal = new PrismaClient({ datasourceUrl: url });
  try {
    const tujuan = await bacaMasterTerpadu(lokal);
    const asal = await denganKds1(async (q) => {
      const h: Record<string, { kode: string; nama: string }[]> = {};
      for (const m of MASTER) h[m.tabel] = await q(`select "kode", ${m.nama} as nama from ${m.tabel}`);
      return h;
    });
    for (const m of MASTER) {
      const a = asal[m.tabel];
      const t = tujuan[m.tabel];
      const tPerKode = new Map(t.map((x) => [x.kode, x.nama]));
      const tPerNama = new Map<string, string[]>();
      for (const x of t) tPerNama.set(norm(x.nama), [...(tPerNama.get(norm(x.nama)) ?? []), x.kode]);
      let sama = 0, kodeBedaNama = 0, kodeHilang = 0, namaTakAda = 0, namaGanda = 0;
      for (const x of a) {
        if (tPerKode.get(x.kode) !== undefined && norm(tPerKode.get(x.kode)!) === norm(x.nama)) sama++;
        else if (tPerKode.has(x.kode)) kodeBedaNama++;
        else kodeHilang++;
        const k = tPerNama.get(norm(x.nama));
        if (!k) namaTakAda++;
        else if (k.length > 1) namaGanda++;
      }
      console.log(`${m.tabel}: KDS1=${a.length} Terpadu=${t.length} | kode+nama sama=${sama}, kode sama nama beda=${kodeBedaNama}, kode tak ada=${kodeHilang} | nama tak ada di Terpadu=${namaTakAda}, nama ganda=${namaGanda}`);
    }
  } finally {
    await lokal.$disconnect();
  }
}

if (process.argv[1]?.includes("bandingkan-master")) {
  main().catch((e) => {
    console.error("Gagal:", e instanceof Error ? e.message.slice(0, 400) : e);
    process.exit(1);
  });
}
