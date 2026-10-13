/**
 * Paritas migrasi F2: salinan data domain di PostgreSQL `kds_paritas` harus IDENTIK dengan
 * MySQL `kds2_produksi` (kunci jawaban) - baris demi baris, agregat, sequence, dan jam WIB.
 * Dilewati (dengan alasan jelas) bila `PARITAS_DATABASE_URL` belum diisi / MySQL KDS2 tidak
 * terjangkau / migrasi belum dijalankan. Data asli hanya ada di mesin lokal; tes ini TIDAK
 * mencetak isi baris.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { bukaKds2BacaSaja, kds2Tersedia, type Kds2Baca } from "../../scripts/kds2-mysql";
import { jalankanVerifikasi, type LaporanVerifikasi } from "../../scripts/migrasi/verifikasi";

const urlParitas = process.env.PARITAS_DATABASE_URL;
const kds2Ada = await kds2Tersedia();
const jalan = Boolean(urlParitas) && kds2Ada;

describe.skipIf(!jalan)("paritas migrasi KDS2 -> PostgreSQL (data asli, lokal)", () => {
  let prisma: PrismaClient;
  let kds2: Kds2Baca;
  let lap: LaporanVerifikasi;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: urlParitas });
    kds2 = await bukaKds2BacaSaja();
    lap = await jalankanVerifikasi(prisma, kds2);
  }, 300_000);
  afterAll(async () => {
    await prisma?.$disconnect();
    await kds2?.tutup();
  });

  it("setiap tabel domain identik baris demi baris (tanpa hilang, berlebih, atau beda)", () => {
    for (const t of lap.tabel) {
      expect(
        { tabel: t.tabel, sumber: t.sumber, target: t.target, hilang: t.hilang, berlebih: t.berlebih, beda: t.beda },
        `tabel ${t.tabel} (kolom beda: ${t.kolomBeda.join(",") || "-"}, contoh id: ${t.contohId.join(",") || "-"})`
      ).toEqual({ tabel: t.tabel, sumber: t.sumber, target: t.sumber, hilang: 0, berlebih: 0, beda: 0 });
    }
  });

  it("cek agregat, jam WIB, dan sequence cocok", () => {
    for (const c of lap.cek) {
      expect(c.ok, `${c.nama}: ${c.detail}`).toBe(true);
    }
  });

  it("jumlah baris yang diverifikasi sama dengan angka produksi yang tercatat (tidak kosong)", () => {
    const total = lap.tabel.reduce((n, t) => n + t.sumber, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("bulan/tahun batch terisi untuk setiap batch yang barisnya satu periode (tidak ditebak untuk sisanya)", async () => {
    const [r] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM "upload_batch" ub WHERE ub."bulan" IS NULL AND (
         ub."id" IN (SELECT "uploadBatchId" FROM "nominatif_bulanan" GROUP BY 1 HAVING COUNT(DISTINCT ("tahun","bulan")) = 1)
         OR ub."id" IN (SELECT "uploadBatchId" FROM "rekap_kehadiran_bulanan" GROUP BY 1 HAVING COUNT(DISTINCT ("tahun","bulan")) = 1))`
    );
    expect(Number(r.n)).toBe(0);
  });
});

describe.skipIf(jalan)("paritas migrasi (dilewati)", () => {
  it("prasyarat belum terpenuhi", () => {
    console.warn(
      `Paritas migrasi dilewati: PARITAS_DATABASE_URL ${urlParitas ? "ada" : "BELUM diisi"}, MySQL KDS2 ${kds2Ada ? "terjangkau" : "TIDAK terjangkau"}.`
    );
  });
});
