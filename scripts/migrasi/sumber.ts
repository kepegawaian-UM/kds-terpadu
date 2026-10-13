/**
 * Sumber data migrasi. `SumberData` adalah antarmuka sempit supaya migrasi bisa dites dengan
 * sumber sintetis di memori; `sumberMysql` adalah implementasi nyata untuk `kds2_produksi`
 * (hanya-baca lewat `Kds2Baca`).
 *
 * Waktu: kolom TIMESTAMP dibaca sebagai `UNIX_TIMESTAMP` (instan absolut, tidak bergantung
 * zona waktu sesi) lalu disimpan sebagai UTC. Tanggal murni dibaca sebagai teks YYYY-MM-DD dan
 * disimpan sebagai tengah malam UTC pada kolom DATE - tidak bergeser oleh zona waktu.
 */
import type { Kds2Baca } from "../kds2-mysql";
import type { Kolom, TabelDomain, TipeKolom } from "./tabel";

export type Nilai = string | number | Date | null;
export type Baris = Record<string, Nilai>;

export interface SumberData {
  /** Halaman berikutnya (urut menurut kunci) setelah `setelah`; `null` = dari awal. */
  halaman(t: TabelDomain, setelah: string | number | null, batas: number): Promise<Baris[]>;
  jumlah(t: TabelDomain): Promise<number>;
  /** Nilai AUTO_INCREMENT berikutnya di sumber (id tidak boleh dipakai ulang), atau null. */
  autoIncrement(t: TabelDomain): Promise<number | null>;
}

export function epochKeDate(detik: number | string | null): Date | null {
  if (detik === null || detik === undefined) return null;
  return new Date(Number(detik) * 1000);
}

export function tanggalKeDate(teks: string | null): Date | null {
  if (teks === null || teks === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(teks) || teks === "0000-00-00") {
    throw new Error(`tanggal tidak sah dari sumber: ${teks}`);
  }
  const d = new Date(`${teks}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`tanggal tidak sah dari sumber: ${teks}`);
  return d;
}

export function konversiNilai(tipe: TipeKolom, mentah: unknown): Nilai {
  if (mentah === null || mentah === undefined) return null;
  switch (tipe) {
    case "int":
      return Number(mentah);
    case "ts":
      return epochKeDate(mentah as number | string);
    case "date":
      return tanggalKeDate(String(mentah));
    default:
      return String(mentah);
  }
}

/** Ekspresi SELECT MySQL untuk satu kolom, dengan alias = nama kolom PostgreSQL. */
export function ekspresiSelect(c: Kolom): string {
  const kol = `\`${c.my}\``;
  switch (c.tipe) {
    case "ts":
      return `CAST(UNIX_TIMESTAMP(${kol}) AS UNSIGNED) AS \`${c.pg}\``;
    case "date":
      return `DATE_FORMAT(${kol}, '%Y-%m-%d') AS \`${c.pg}\``;
    default:
      return `${kol} AS \`${c.pg}\``;
  }
}

/** Kolom kunci teks (nip) diurutkan per byte supaya sama dengan COLLATE "C" di PostgreSQL. */
export function kunciTeks(t: TabelDomain): boolean {
  return t.kolom.find((c) => c.pg === t.kunci)?.tipe === "str";
}

export function sumberMysql(kds2: Kds2Baca): SumberData {
  return {
    async halaman(t, setelah, batas) {
      const kolKunci = t.kolom.find((c) => c.pg === t.kunci)!;
      const teks = kunciTeks(t);
      const kunciExpr = teks ? `BINARY \`${kolKunci.my}\`` : `\`${kolKunci.my}\``;
      const where = setelah === null ? "" : `WHERE ${kunciExpr} > ${teks ? "BINARY ?" : "?"}`;
      const sql =
        `SELECT ${t.kolom.map(ekspresiSelect).join(", ")} FROM \`${t.mysql}\` ${where} ` +
        `ORDER BY ${kunciExpr} LIMIT ?`;
      const params = setelah === null ? [batas] : [setelah, batas];
      const rows = await kds2.kueri<Record<string, unknown>>(sql, params);
      return rows.map((r) => {
        const out: Baris = {};
        for (const c of t.kolom) out[c.pg] = konversiNilai(c.tipe, r[c.pg]);
        return out;
      });
    },
    async jumlah(t) {
      const [r] = await kds2.kueri<{ n: number | string }>(`SELECT COUNT(*) AS n FROM \`${t.mysql}\``);
      return Number(r.n);
    },
    async autoIncrement(t) {
      if (!t.serial) return null;
      const [r] = await kds2.kueri<{ ai: number | string | null }>(
        "SELECT AUTO_INCREMENT AS ai FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        [t.mysql]
      );
      return r?.ai === null || r?.ai === undefined ? null : Number(r.ai);
    },
  };
}
