/**
 * Paritas master data: setiap tabel master di KDS Terpadu (PostgreSQL, hasil seed) harus
 * IDENTIK dengan KDS2 (`kds2_produksi`). Dibandingkan: jumlah baris dan isi kolom
 * (kode + atribut) baris demi baris. Tes dilewati dengan alasan jelas bila MySQL KDS2 atau
 * database tes tidak tersedia - bukan dianggap lulus diam-diam.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

import { barisKeJson, TABEL_MASTER } from "../../scripts/ekspor-master-kds2";
import { bukaKds2BacaSaja, kds2Tersedia, type Kds2Baca } from "../../scripts/kds2-mysql";

const dbTesAda = Boolean(process.env.TEST_DATABASE_URL);
const kds2Ada = await kds2Tersedia();
const jalan = dbTesAda && kds2Ada;

// Nama model Prisma per berkas seed.
const MODEL: Record<string, keyof PrismaClient> = {
  jenisPegawai: "jenisPegawai",
  statusKepegawaian: "statusKepegawaian",
  golongan: "golongan",
  jabatanFungsionalDosen: "jabatanFungsionalDosen",
  jabatanFungsionalTendik: "jabatanFungsionalTendik",
  jabatanFungsiUmumPelaksana: "jabatanFungsiUmumPelaksana",
  jabatanTambahanRole: "jabatanTambahanRole",
  unitInduk: "unitInduk",
  unitAsal: "unitAsal",
  programStudi: "programStudi",
  kategoriAkademisiLuar: "kategoriAkademisiLuar",
  komponenKehadiran: "komponenKehadiran",
};

describe.skipIf(!jalan)("paritas master data KDS2 <-> KDS Terpadu", () => {
  let prisma: PrismaClient;
  let kds2: Kds2Baca;

  beforeAll(async () => {
    prisma = new PrismaClient();
    kds2 = await bukaKds2BacaSaja();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await kds2?.tutup();
  });

  for (const { tabel, berkas } of TABEL_MASTER) {
    it(`${tabel}: isi sama persis`, async () => {
      const kunci = await kds2.kueri<Record<string, unknown>>(`SELECT * FROM ${tabel} ORDER BY kode`);
      const diharapkan = kunci.map(barisKeJson);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = prisma[MODEL[berkas]] as any;
      const aktual = (await model.findMany({ orderBy: { kode: "asc" } })) as Record<string, unknown>[];

      expect(aktual.length).toBe(diharapkan.length);
      expect(aktual).toEqual(diharapkan);
    });
  }
});

describe.skipIf(jalan)("paritas master data (dilewati)", () => {
  it("prasyarat belum terpenuhi", () => {
    console.warn(
      `Paritas dilewati: TEST_DATABASE_URL ${dbTesAda ? "ada" : "BELUM diisi"}, MySQL KDS2 ${kds2Ada ? "terjangkau" : "TIDAK terjangkau"}.`
    );
  });
});
