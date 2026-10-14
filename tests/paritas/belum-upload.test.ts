/**
 * Paritas "Pegawai Belum Ada Rekap" (data asli, lokal) terhadap RekapKehadiranBelumUploadController
 * KDS2 lewat oracle: jumlah, ringkasan per unit (termasuk urutan), dan setiap baris (urutan, TMT,
 * status). Tes tidak mencetak isi baris.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { laporanBelumUpload } from "@/lib/laporan/belumUpload";
import { resolveBulanTahun } from "@/lib/laporan/periode";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.KDS2_SALINAN_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

type Laporan = Awaited<ReturnType<typeof laporanBelumUpload>>;

describe.skipIf(!jalan)("paritas Pegawai Belum Ada Rekap KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  let periode: { bulan: number; tahun: number }[];

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    periode = await db.$queryRawUnsafe(`SELECT DISTINCT "bulan", "tahun" FROM "nominatif_bulanan" ORDER BY "tahun", "bulan"`);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("semua bulan: jumlah, ringkasan per unit, dan setiap baris identik", async () => {
    const h = await tanyaOracle(
      periode.map((p) => ({ id: `${p.tahun}-${p.bulan}`, laporan: "rekap.belumUpload", params: { bulan: p.bulan, tahun: p.tahun } }))
    );
    let totalBelum = 0;
    for (const p of periode) {
      const o = hasil<Laporan>(h, `${p.tahun}-${p.bulan}`);
      const s = await laporanBelumUpload(db, p.bulan, p.tahun);
      const label = `${p.tahun}-${p.bulan}`;
      expect(
        {
          totalNominatif: s.totalNominatif,
          totalSudahRekap: s.totalSudahRekap,
          jumlahBelumTmt: s.jumlahBelumTmt,
          jumlahSudahTidakAktif: s.jumlahSudahTidakAktif,
          jumlahPerluTindakLanjut: s.jumlahPerluTindakLanjut,
        },
        `angka ${label}`
      ).toEqual({
        totalNominatif: o.totalNominatif,
        totalSudahRekap: o.totalSudahRekap,
        jumlahBelumTmt: o.jumlahBelumTmt,
        jumlahSudahTidakAktif: o.jumlahSudahTidakAktif,
        jumlahPerluTindakLanjut: o.jumlahPerluTindakLanjut,
      });
      expect(s.ringkasanPerUnit, `ringkasan per unit ${label}`).toEqual(o.ringkasanPerUnit);
      expect(s.belum.length, `jumlah baris ${label}`).toBe(o.belum.length);
      const beda = o.belum.reduce((n, b, i) => n + (JSON.stringify(b) === JSON.stringify(s.belum[i]) ? 0 : 1), 0);
      expect(beda, `baris berbeda ${label}`).toBe(0);
      totalBelum += o.belum.length;
    }
    expect(totalBelum).toBeGreaterThan(0);
  }, 300_000);

  it("periode bawaan tanpa parameter = snapshot terbaru, sama dengan KDS2", async () => {
    const h = await tanyaOracle([{ id: "d", laporan: "rekap.belumUpload", params: {} }]);
    const o = hasil<Laporan & { bulan: number; tahun: number }>(h, "d");
    const [bulan, tahun] = await resolveBulanTahun(db, {});
    expect([bulan, tahun]).toEqual([o.bulan, o.tahun]);
    const s = await laporanBelumUpload(db, bulan, tahun);
    expect(s.belum.length).toBe(o.belum.length);
  }, 120_000);
});

describe.skipIf(jalan)("paritas Belum Ada Rekap (dilewati)", () => {
  it("KDS2_SALINAN_DATABASE_URL atau oracle tidak tersedia", () => {
    console.warn("Paritas Belum Ada Rekap dilewati: KDS2_SALINAN_DATABASE_URL/oracle tidak tersedia.");
  });
});
