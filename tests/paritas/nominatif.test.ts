/**
 * Paritas modul Nominatif (data asli, lokal) terhadap kode KDS2 asli lewat oracle:
 * daftar per bulan (isi + urutan + nama file), detail setiap snapshot, dan ekspor Excel.
 * Tes tidak mencetak isi baris.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { daftarNominatif, detailNominatif, eksporNominatif, namaFileNominatif } from "@/lib/laporan/nominatif";
import { namaBulan, resolveBulanTahun } from "@/lib/laporan/periode";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.PARITAS_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

type BarisIndex = { id: number; nip: string; nama: string; jenis: string | null; unit: string | null };
type Detail = Record<string, unknown> & { periodeLabel: string; bulan: number; tahun: number };

describe.skipIf(!jalan)("paritas Nominatif KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  let periode: { bulan: number; tahun: number }[];

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    periode = await db.$queryRawUnsafe(`SELECT DISTINCT "bulan", "tahun" FROM "nominatif_bulanan" ORDER BY "tahun", "bulan"`);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("daftar per bulan: baris, urutan, dan nama file identik untuk semua bulan", async () => {
    const h = await tanyaOracle(
      periode.map((p) => ({ id: `${p.tahun}-${p.bulan}`, laporan: "nominatif.index", params: { bulan: p.bulan, tahun: p.tahun } }))
    );
    for (const p of periode) {
      const o = hasil<{ namaFile: string; baris: BarisIndex[] }>(h, `${p.tahun}-${p.bulan}`);
      const saya = await daftarNominatif(db, p.bulan, p.tahun);
      expect(saya.length, `jumlah ${p.tahun}-${p.bulan}`).toBe(o.baris.length);
      const beda = o.baris.reduce((n, b, i) => n + (JSON.stringify(b) === JSON.stringify(saya[i]) ? 0 : 1), 0);
      expect(beda, `baris berbeda ${p.tahun}-${p.bulan}`).toBe(0);
      expect(namaFileNominatif(p.bulan, p.tahun)).toBe(o.namaFile);
    }
  }, 300_000);

  it("periode bawaan tanpa parameter sama dengan KDS2", async () => {
    const h = await tanyaOracle([{ id: "d", laporan: "nominatif.index", params: {} }]);
    const o = hasil<{ bulan: number; tahun: number }>(h, "d");
    expect(await resolveBulanTahun(db, {})).toEqual([o.bulan, o.tahun]);
  }, 120_000);

  it("detail: SEMUA snapshot bulan terbaru dan sampel merata dari bulan lain identik", async () => {
    const terbaru = periode[periode.length - 1];
    const ids: number[] = [];
    for (const p of periode) {
      const rows = await db.$queryRawUnsafe<{ id: number }[]>(
        `SELECT "id" FROM "nominatif_bulanan" WHERE "bulan" = ${p.bulan} AND "tahun" = ${p.tahun} ORDER BY "id"`
      );
      const langkah = p === terbaru ? 1 : Math.max(1, Math.floor(rows.length / 120));
      for (let i = 0; i < rows.length; i += langkah) ids.push(rows[i].id);
    }
    const h = await tanyaOracle([{ id: "s", laporan: "nominatif.showBanyak", params: { ids } }]);
    const o = hasil<Record<string, Detail>>(h, "s");

    let diperiksa = 0;
    const bedaId: number[] = [];
    let bedaLabelNonBahasa = 0;
    for (const id of ids) {
      const saya = await detailNominatif(db, id);
      expect(saya, `detail ${id} tidak ditemukan`).not.toBeNull();
      const { periodeLabel: labelSaya, ...sayaTanpaLabel } = saya as unknown as Detail;
      const { periodeLabel: labelOracle, ...oracleTanpaLabel } = o[String(id)];
      if (JSON.stringify(sayaTanpaLabel) !== JSON.stringify(oracleTanpaLabel)) bedaId.push(id);
      // Label bulan: KDS2 bisa berbahasa Inggris (APP_LOCALE=en); di sini selalu Indonesia.
      if (labelSaya !== `${namaBulan(saya!.bulan)} ${saya!.tahun}`) bedaLabelNonBahasa++;
      if (labelOracle.split(" ")[1] !== String(saya!.tahun)) bedaLabelNonBahasa++;
      diperiksa++;
    }
    expect(diperiksa).toBeGreaterThan(2000);
    expect(bedaId.slice(0, 5), `jumlah detail berbeda: ${bedaId.length}`).toEqual([]);
    expect(bedaLabelNonBahasa).toBe(0);
  }, 600_000);

  it("ekspor Excel: judul kolom dan baris identik (semua bulan tanpa filter + filter jenis/unit)", async () => {
    const terbaru = periode[periode.length - 1];
    const unit = (
      await db.$queryRawUnsafe<{ unitAsalKode: string }[]>(
        `SELECT "unitAsalKode", COUNT(*) AS n FROM "nominatif_bulanan" WHERE "bulan" = ${terbaru.bulan} AND "tahun" = ${terbaru.tahun}
         GROUP BY 1 ORDER BY n DESC LIMIT 1`
      )
    )[0].unitAsalKode;
    const kasus = [
      ...periode.map((p) => ({ id: `semua-${p.tahun}-${p.bulan}`, bulan: p.bulan, tahun: p.tahun })),
      { id: "dsn", ...terbaru, jenis_pegawai_kode: "DSN" },
      { id: "tdk", ...terbaru, jenis_pegawai_kode: "TDK" },
      { id: "akl", ...terbaru, jenis_pegawai_kode: "AKL" },
      { id: "unit", ...terbaru, unit_asal_kode: unit },
      { id: "dsn-unit", ...terbaru, jenis_pegawai_kode: "DSN", unit_asal_kode: unit },
    ] as { id: string; bulan: number; tahun: number; jenis_pegawai_kode?: string; unit_asal_kode?: string }[];

    const h = await tanyaOracle(
      kasus.map(({ id, ...params }) => ({ id, laporan: "nominatif.export", params }))
    );
    for (const k of kasus) {
      const o = hasil<{ headings: string[]; rows: unknown[][] }>(h, k.id);
      const saya = await eksporNominatif(db, k.bulan, k.tahun, { jenisPegawaiKode: k.jenis_pegawai_kode, unitAsalKode: k.unit_asal_kode });
      expect(saya.headings, k.id).toEqual(o.headings);
      expect(saya.rows.length, `jumlah baris ${k.id}`).toBe(o.rows.length);
      const beda = o.rows.reduce<number>((n, r, i) => n + (JSON.stringify(r) === JSON.stringify(saya.rows[i]) ? 0 : 1), 0);
      expect(beda, `baris ekspor berbeda ${k.id}`).toBe(0);
    }
  }, 300_000);
});

describe.skipIf(jalan)("paritas Nominatif (dilewati)", () => {
  it("PARITAS_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas Nominatif dilewati: PARITAS_DATABASE_URL/oracle tidak tersedia.");
  });
});
