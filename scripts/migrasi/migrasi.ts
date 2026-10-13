/**
 * Inti migrasi MySQL KDS2 -> PostgreSQL KDS Terpadu. Semua dalam SATU transaksi: bila satu
 * langkah gagal, tidak ada yang tersimpan. Mode dry-run menjalankan semuanya (termasuk
 * foreign key dan sequence) lalu membatalkan transaksi.
 *
 * Aturan:
 *  - id dipertahankan apa adanya (termasuk celah); sequence disetel ke AUTO_INCREMENT sumber
 *    supaya id yang pernah dipakai tidak muncul lagi;
 *  - target harus kosong (kecuali `ganti`), dan tabel KDS1 yang bergantung pada batch harus kosong;
 *  - kolom turunan baru (status, bulan/tahun batch) diisi dari data yang ada, tidak ditebak.
 */
import type { PrismaClient } from "@prisma/client";

import type { SumberData } from "./sumber";
import { bagi, TABEL_DOMAIN, TABEL_KDS1_TERGANTUNG, ukuranChunk } from "./tabel";

export type OpsiMigrasi = {
  prisma: PrismaClient;
  sumber: SumberData;
  dryRun?: boolean;
  ganti?: boolean;
  lapor?: (pesan: string) => void;
};

export type LaporanMigrasi = {
  dryRun: boolean;
  durasiMs: number;
  tabel: { mysql: string; dibaca: number; ditulis: number }[];
};

const HALAMAN = 5_000;

class DryRunSelesai extends Error {
  constructor() {
    super("dry-run selesai (transaksi dibatalkan)");
  }
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type Delegate = { createMany(a: { data: Record<string, unknown>[] }): Promise<unknown> };

const kutip = (nama: string) => `"${nama}"`;

/** Mengosongkan seluruh tabel domain (dan tabel turunan KDS1 lewat CASCADE) + reset identity. */
export async function kosongkanDomain(prisma: Pick<PrismaClient, "$executeRawUnsafe">): Promise<void> {
  const daftar = TABEL_DOMAIN.map((t) => kutip(t.pgTabel)).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${daftar} RESTART IDENTITY CASCADE`);
}

async function hitung(tx: Tx, tabel: string): Promise<number> {
  const r = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${kutip(tabel)}`);
  return Number(r[0].n);
}

async function periksaTarget(tx: Tx, ganti: boolean): Promise<void> {
  for (const nama of TABEL_KDS1_TERGANTUNG) {
    if ((await hitung(tx, nama)) > 0) {
      throw new Error(
        `Tabel KDS1 "${nama}" berisi data yang bergantung pada upload_batch. Migrasi dihentikan ` +
          `(tidak diizinkan menimpa data KDS1, bahkan dengan --ganti).`
      );
    }
  }
  if (ganti) return;
  const terisi: string[] = [];
  for (const t of TABEL_DOMAIN) {
    const n = await hitung(tx, t.pgTabel);
    if (n > 0) terisi.push(`${t.pgTabel} (${n})`);
  }
  if (terisi.length > 0) {
    throw new Error(
      `Target tidak kosong: ${terisi.join(", ")}. Gunakan --ganti bila memang ingin menimpa semuanya.`
    );
  }
}

/**
 * Menyetel sequence tiap tabel serial. setval TIDAK ikut dibatalkan oleh rollback transaksi,
 * jadi pada dry-run nilainya hanya dihitung (tidak diterapkan).
 */
async function setelSequence(tx: Tx, sumber: SumberData, terapkan: boolean): Promise<void> {
  for (const t of TABEL_DOMAIN.filter((x) => x.serial)) {
    const ai = await sumber.autoIncrement(t);
    const [m] = await tx.$queryRawUnsafe<{ maks: number | null }[]>(
      `SELECT MAX(${kutip(t.kunci)})::int AS maks FROM ${kutip(t.pgTabel)}`
    );
    const maks = m.maks ?? 0;
    const target = Math.max(ai !== null ? ai - 1 : 0, maks);
    const seq = `pg_get_serial_sequence('${kutip(t.pgTabel)}', '${t.kunci}')`;
    if (!terapkan) continue;
    if (target < 1) await tx.$queryRawUnsafe(`SELECT setval(${seq}, 1, false)`);
    else await tx.$queryRawUnsafe(`SELECT setval(${seq}, ${target}, true)`);
  }
}

/** Bulan/tahun batch hanya diisi bila SEMUA baris yang menunjuk batch itu satu periode. */
async function isiPeriodeBatch(tx: Tx): Promise<void> {
  for (const tabel of ["nominatif_bulanan", "rekap_kehadiran_bulanan"]) {
    await tx.$executeRawUnsafe(
      `UPDATE "upload_batch" ub SET "bulan" = s.b, "tahun" = s.t FROM (
         SELECT "uploadBatchId" AS id, MIN("bulan") AS b, MIN("tahun") AS t
         FROM ${kutip(tabel)} GROUP BY "uploadBatchId"
         HAVING COUNT(DISTINCT ("tahun", "bulan")) = 1
       ) s WHERE ub."id" = s.id AND ub."bulan" IS NULL`
    );
  }
}

export async function jalankanMigrasi(opsi: OpsiMigrasi): Promise<LaporanMigrasi> {
  const { prisma, sumber, dryRun = false, ganti = false, lapor = () => {} } = opsi;
  const mulai = Date.now();
  const hasil: LaporanMigrasi["tabel"] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        await periksaTarget(tx, ganti);
        if (ganti) {
          lapor("Mengosongkan tabel domain di target (--ganti) ...");
          await kosongkanDomain(tx);
        }

        for (const t of TABEL_DOMAIN) {
          const delegate = (tx as unknown as Record<string, Delegate>)[t.model];
          const total = await sumber.jumlah(t);
          let dibaca = 0;
          let ditulis = 0;
          let terakhir: string | number | null = null;

          for (;;) {
            const halaman = await sumber.halaman(t, terakhir, HALAMAN);
            if (halaman.length === 0) break;
            dibaca += halaman.length;
            for (const potong of bagi(halaman, ukuranChunk(t.kolom.length + Object.keys(t.tambahan ?? {}).length))) {
              await delegate.createMany({ data: potong.map((r) => ({ ...r, ...(t.tambahan ?? {}) })) });
              ditulis += potong.length;
            }
            terakhir = halaman[halaman.length - 1][t.kunci] as string | number;
            lapor(`  ${t.mysql}: ${ditulis}/${total}`);
          }

          if (dibaca !== total || ditulis !== total) {
            throw new Error(`${t.mysql}: jumlah baris tidak cocok (sumber ${total}, dibaca ${dibaca}, ditulis ${ditulis})`);
          }
          hasil.push({ mysql: t.mysql, dibaca, ditulis });
        }

        await setelSequence(tx, sumber, !dryRun);
        await isiPeriodeBatch(tx);

        if (dryRun) throw new DryRunSelesai();
      },
      { timeout: 30 * 60_000, maxWait: 60_000 }
    );
  } catch (e) {
    if (!(e instanceof DryRunSelesai)) throw e;
  }

  return { dryRun, durasiMs: Date.now() - mulai, tabel: hasil };
}
