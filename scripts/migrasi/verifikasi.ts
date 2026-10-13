/**
 * Verifikasi migrasi: membandingkan MySQL KDS2 (kunci jawaban) dengan PostgreSQL baris demi
 * baris. Jalur pembacaan kedua sisi SENGAJA independen:
 *  - MySQL: SQL kanonik (CAST/UNIX_TIMESTAMP/DATE_FORMAT) langsung dari server;
 *  - PostgreSQL: nilai bertipe dari Prisma, dikanonikkan di Node.
 * Laporan hanya memuat angka, nama kolom, dan id numerik - TIDAK memuat isi baris (NIP/nama).
 */
import type { PrismaClient } from "@prisma/client";

import type { Kds2Baca } from "../kds2-mysql";
import { kunciTeks } from "./sumber";
import { type Kolom, TABEL_DOMAIN, type TabelDomain } from "./tabel";

const NIHIL = "∅";
const HALAMAN = 5_000;

export type HasilTabel = {
  tabel: string;
  sumber: number;
  target: number;
  hilang: number;
  berlebih: number;
  beda: number;
  kolomBeda: string[];
  contohId: (string | number)[];
  ok: boolean;
};

export type HasilCek = { nama: string; ok: boolean; detail: string };

export type LaporanVerifikasi = { ok: boolean; tabel: HasilTabel[]; cek: HasilCek[] };

/** Ekspresi MySQL yang menghasilkan teks kanonik per kolom. */
function kanonikMysql(c: Kolom): string {
  const kol = `\`${c.my}\``;
  const isi =
    c.tipe === "ts"
      ? `CAST(UNIX_TIMESTAMP(${kol}) AS CHAR)`
      : c.tipe === "date"
        ? `DATE_FORMAT(${kol}, '%Y-%m-%d')`
        : `CAST(${kol} AS CHAR)`;
  return `COALESCE(${isi}, '${NIHIL}')`;
}

/** Teks kanonik dari nilai bertipe Prisma. */
export function kanonikPg(tipe: Kolom["tipe"], v: unknown): string {
  if (v === null || v === undefined) return NIHIL;
  if (v instanceof Date) {
    return tipe === "date" ? v.toISOString().slice(0, 10) : String(Math.floor(v.getTime() / 1000));
  }
  return String(v);
}

async function halamanMysql(kds2: Kds2Baca, t: TabelDomain, setelah: string | number | null) {
  const kolKunci = t.kolom.find((c) => c.pg === t.kunci)!;
  const teks = kunciTeks(t);
  const kunciExpr = teks ? `BINARY \`${kolKunci.my}\`` : `\`${kolKunci.my}\``;
  const where = setelah === null ? "" : `WHERE ${kunciExpr} > ${teks ? "BINARY ?" : "?"}`;
  const sql =
    `SELECT ${t.kolom.map((c, i) => `${kanonikMysql(c)} AS c${i}`).join(", ")} FROM \`${t.mysql}\` ${where} ` +
    `ORDER BY ${kunciExpr} LIMIT ?`;
  return kds2.kueri<Record<string, string>>(sql, setelah === null ? [HALAMAN] : [setelah, HALAMAN]);
}

async function rentangPg(
  prisma: PrismaClient,
  t: TabelDomain,
  setelah: string | number | null,
  sampai: string | number
) {
  const teks = kunciTeks(t);
  const kol = `"${t.kunci}"${teks ? ' COLLATE "C"' : ""}`;
  const dari = setelah === null ? "" : `${kol} > $1 AND `;
  const params = setelah === null ? [sampai] : [setelah, sampai];
  const sql =
    `SELECT ${t.kolom.map((c) => `"${c.pg}"`).join(", ")} FROM "${t.pgTabel}" ` +
    `WHERE ${dari}${kol} <= $${params.length} ORDER BY ${kol}`;
  return prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
}

async function verifikasiTabel(prisma: PrismaClient, kds2: Kds2Baca, t: TabelDomain): Promise<HasilTabel> {
  const kolIdx = t.kolom.findIndex((c) => c.pg === t.kunci);
  const [{ n: nSumber }] = await kds2.kueri<{ n: number | string }>(`SELECT COUNT(*) AS n FROM \`${t.mysql}\``);
  const [{ n: nTarget }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${t.pgTabel}"`);

  let hilang = 0;
  let beda = 0;
  const kolomBeda = new Set<string>();
  const contohId: (string | number)[] = [];
  let cocokDiPg = 0;
  let sebelumnya: string | number | null = null;

  for (;;) {
    const hs = await halamanMysql(kds2, t, sebelumnya);
    if (hs.length === 0) break;
    const kunciSumber = (r: Record<string, string>) => r[`c${kolIdx}`];
    const terakhir = kunciSumber(hs[hs.length - 1]);
    const batasAtas: string | number = kunciTeks(t) ? terakhir : Number(terakhir);

    const pg = await rentangPg(prisma, t, sebelumnya, batasAtas);
    const petaPg = new Map(pg.map((r) => [kanonikPg(t.kolom[kolIdx].tipe, r[t.kunci]), r]));

    for (const r of hs) {
      const kunci = kunciSumber(r);
      const p = petaPg.get(kunci);
      if (!p) {
        hilang++;
        if (contohId.length < 5 && !kunciTeks(t)) contohId.push(Number(kunci));
        continue;
      }
      cocokDiPg++;
      let barisBeda = false;
      t.kolom.forEach((c, i) => {
        if (r[`c${i}`] !== kanonikPg(c.tipe, p[c.pg])) {
          barisBeda = true;
          kolomBeda.add(c.pg);
        }
      });
      if (barisBeda) {
        beda++;
        if (contohId.length < 5 && !kunciTeks(t)) contohId.push(Number(kunci));
      }
    }
    sebelumnya = batasAtas;
  }

  const sumber = Number(nSumber);
  const target = Number(nTarget);
  const berlebih = target - cocokDiPg;
  return {
    tabel: t.mysql,
    sumber,
    target,
    hilang,
    berlebih,
    beda,
    kolomBeda: [...kolomBeda],
    contohId,
    ok: sumber === target && hilang === 0 && berlebih === 0 && beda === 0,
  };
}

const peta = <T extends Record<string, unknown>>(rows: T[], kunci: (r: T) => string, nilai: (r: T) => string) =>
  new Map(rows.map((r) => [kunci(r), nilai(r)]));

function bandingPeta(nama: string, a: Map<string, string>, b: Map<string, string>): HasilCek {
  const kunci = new Set([...a.keys(), ...b.keys()]);
  let selisih = 0;
  for (const k of kunci) if (a.get(k) !== b.get(k)) selisih++;
  return {
    nama,
    ok: selisih === 0,
    detail: selisih === 0 ? `${kunci.size} kelompok identik` : `${selisih} dari ${kunci.size} kelompok berbeda`,
  };
}

async function cekAgregat(prisma: PrismaClient, kds2: Kds2Baca): Promise<HasilCek[]> {
  const hasil: HasilCek[] = [];

  const perPeriode = async (tabel: string) =>
    bandingPeta(
      `jumlah ${tabel} per bulan`,
      peta(
        await kds2.kueri<{ tahun: number; bulan: number; n: number | string }>(
          `SELECT tahun, bulan, COUNT(*) n FROM \`${tabel}\` GROUP BY tahun, bulan`
        ),
        (r) => `${r.tahun}-${r.bulan}`,
        (r) => String(r.n)
      ),
      peta(
        await prisma.$queryRawUnsafe<{ tahun: number; bulan: number; n: bigint }[]>(
          `SELECT "tahun", "bulan", COUNT(*) AS n FROM "${tabel}" GROUP BY "tahun", "bulan"`
        ),
        (r) => `${r.tahun}-${r.bulan}`,
        (r) => String(r.n)
      )
    );
  hasil.push(await perPeriode("nominatif_bulanan"));
  hasil.push(await perPeriode("rekap_kehadiran_bulanan"));

  hasil.push(
    bandingPeta(
      "SUM rekap per komponen per bulan (komponen angka)",
      peta(
        await kds2.kueri<{ k: string; s: number | string }>(
          "SELECT CONCAT(r.tahun, '-', r.bulan, '-', d.komponen_kode) k, SUM(CAST(d.nilai AS UNSIGNED)) s " +
            "FROM rekap_kehadiran_detail d JOIN rekap_kehadiran_bulanan r ON r.id = d.rekap_kehadiran_bulanan_id " +
            "WHERE d.komponen_kode NOT IN ('JENIS_SHIFT','CUTI_ANAK_KE') GROUP BY r.tahun, r.bulan, d.komponen_kode"
        ),
        (r) => r.k,
        (r) => String(r.s)
      ),
      peta(
        await prisma.$queryRawUnsafe<{ k: string; s: bigint }[]>(
          `SELECT r."tahun" || '-' || r."bulan" || '-' || d."komponenKode" AS k, SUM(CAST(d."nilai" AS bigint)) AS s ` +
            `FROM "rekap_kehadiran_detail" d JOIN "rekap_kehadiran_bulanan" r ON r."id" = d."rekapKehadiranBulananId" ` +
            `WHERE d."komponenKode" NOT IN ('JENIS_SHIFT','CUTI_ANAK_KE') GROUP BY r."tahun", r."bulan", d."komponenKode"`
        ),
        (r) => r.k,
        (r) => String(r.s)
      )
    )
  );

  hasil.push(
    bandingPeta(
      "koreksi per jenis dan status batal",
      peta(
        await kds2.kueri<{ k: string; n: number | string }>(
          "SELECT CONCAT(jenis, '|', IF(dibatalkan_pada IS NULL, 'aktif', 'batal')) k, COUNT(*) n FROM koreksi_rekap GROUP BY 1"
        ),
        (r) => r.k,
        (r) => String(r.n)
      ),
      peta(
        await prisma.$queryRawUnsafe<{ k: string; n: bigint }[]>(
          `SELECT "jenis" || '|' || CASE WHEN "dibatalkanPada" IS NULL THEN 'aktif' ELSE 'batal' END AS k, COUNT(*) AS n FROM "koreksi_rekap" GROUP BY 1`
        ),
        (r) => r.k,
        (r) => String(r.n)
      )
    )
  );

  hasil.push(
    bandingPeta(
      "jumlah batch per jenis",
      peta(
        await kds2.kueri<{ jenis: string; n: number | string }>("SELECT jenis, COUNT(*) n FROM upload_batch GROUP BY jenis"),
        (r) => r.jenis,
        (r) => String(r.n)
      ),
      peta(
        await prisma.$queryRawUnsafe<{ jenis: string; n: bigint }[]>(
          `SELECT "jenis", COUNT(*) AS n FROM "upload_batch" GROUP BY "jenis"`
        ),
        (r) => r.jenis,
        (r) => String(r.n)
      )
    )
  );

  return hasil;
}

/** Sequence setiap tabel serial harus tepat satu di bawah AUTO_INCREMENT sumber. */
async function cekSequence(prisma: PrismaClient, kds2: Kds2Baca): Promise<HasilCek> {
  const salah: string[] = [];
  for (const t of TABEL_DOMAIN.filter((x) => x.serial)) {
    const [a] = await kds2.kueri<{ ai: number | string | null }>(
      "SELECT AUTO_INCREMENT AS ai FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [t.mysql]
    );
    const [{ seq }] = await prisma.$queryRawUnsafe<{ seq: string }[]>(
      `SELECT pg_get_serial_sequence('"${t.pgTabel}"', '${t.kunci}') AS seq`
    );
    const [s] = await prisma.$queryRawUnsafe<{ nilai: bigint; dipakai: boolean }[]>(
      `SELECT last_value AS nilai, is_called AS dipakai FROM ${seq}`
    );
    const berikutnya = Number(s.nilai) + (s.dipakai ? 1 : 0);
    if (a.ai !== null && berikutnya !== Number(a.ai)) salah.push(`${t.pgTabel} (sumber ${a.ai}, target ${berikutnya})`);
  }
  return {
    nama: "sequence = AUTO_INCREMENT sumber",
    ok: salah.length === 0,
    detail: salah.length === 0 ? "semua tabel serial cocok" : salah.join("; "),
  };
}

/** Jam tampil WIB identik: dihitung ulang dari instan di kedua sisi, bukan dari kolom yang sama. */
async function cekWaktuWib(prisma: PrismaClient, kds2: Kds2Baca): Promise<HasilCek> {
  return bandingPeta(
    "jam unggah batch tampil WIB identik",
    peta(
      await kds2.kueri<{ id: number; w: string }>(
        "SELECT id, DATE_FORMAT(CONVERT_TZ(FROM_UNIXTIME(UNIX_TIMESTAMP(diupload_pada)), @@session.time_zone, '+07:00'), '%Y-%m-%d %H:%i:%s') w FROM upload_batch"
      ),
      (r) => String(r.id),
      (r) => r.w
    ),
    peta(
      await prisma.$queryRawUnsafe<{ id: number; w: string }[]>(
        `SELECT "id", to_char(("diunggahPada" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS w FROM "upload_batch"`
      ),
      (r) => String(r.id),
      (r) => r.w
    )
  );
}

export async function jalankanVerifikasi(prisma: PrismaClient, kds2: Kds2Baca): Promise<LaporanVerifikasi> {
  const tabel: HasilTabel[] = [];
  for (const t of TABEL_DOMAIN) tabel.push(await verifikasiTabel(prisma, kds2, t));
  const cek = [...(await cekAgregat(prisma, kds2)), await cekWaktuWib(prisma, kds2), await cekSequence(prisma, kds2)];
  return { ok: tabel.every((t) => t.ok) && cek.every((c) => c.ok), tabel, cek };
}
