/**
 * Tes integrasi migrasi dengan SUMBER SINTETIS di memori (tanpa MySQL, tanpa data pegawai asli)
 * terhadap database kds_test. Membuktikan perilaku skrip migrasi: id dipertahankan (termasuk
 * celah), nilai tanggal/waktu tepat, sequence disetel, dry-run tidak menyimpan, penolakan target
 * tidak kosong, rollback penuh bila ada kegagalan, dan kolom turunan batch.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { jalankanMigrasi, kosongkanDomain } from "../../scripts/migrasi/migrasi";
import type { Baris, SumberData } from "../../scripts/migrasi/sumber";
import type { TabelDomain } from "../../scripts/migrasi/tabel";

const ada = Boolean(process.env.TEST_DATABASE_URL);

/** Sumber di memori: tabel -> baris (sudah bertipe JS). */
function sumberMemori(data: Record<string, Baris[]>, autoInc: Record<string, number | null> = {}): SumberData {
  return {
    async halaman(t: TabelDomain, setelah, batas) {
      const semua = [...(data[t.mysql] ?? [])].sort((a, b) =>
        (a[t.kunci] as never) < (b[t.kunci] as never) ? -1 : 1
      );
      const sesudah = setelah === null ? semua : semua.filter((r) => (r[t.kunci] as never) > (setelah as never));
      return sesudah.slice(0, batas);
    },
    async jumlah(t) {
      return (data[t.mysql] ?? []).length;
    },
    async autoIncrement(t) {
      return autoInc[t.mysql] ?? null;
    },
  };
}

describe.skipIf(!ada)("migrasi KDS2 -> PostgreSQL (sumber sintetis)", () => {
  let prisma: PrismaClient;
  let kode: { jenis: string; status: string; unit: string };

  const T1 = new Date("2026-09-23T09:24:26.000Z");
  const T2 = new Date("2026-10-13T02:53:50.000Z");
  const P1 = "900000000000000001";
  const P2 = "900000000000000002";

  function nominatif(id: number, nip: string, nama: string, batch: number, lahir: Date | null): Baris {
    return {
      id,
      pegawaiNip: nip,
      bulan: 9,
      tahun: 2026,
      nama,
      jenisKelamin: "L",
      tanggalLahir: lahir,
      pendidikanTerakhir: null,
      agama: null,
      jenisPegawaiKode: kode.jenis,
      statusKepegawaianKode: kode.status,
      golonganKode: null,
      jabatanFungsionalDosenKode: null,
      jabatanFungsionalTendikKode: null,
      jabatanFungsiUmumKode: null,
      kategoriAkademisiLuarKode: null,
      unitAsalKode: kode.unit,
      tanggalMulaiKerja: new Date("2020-01-31T00:00:00.000Z"),
      uploadBatchId: batch,
    };
  }

  function batch(id: number, jenis: string, waktu: Date): Baris {
    return {
      id,
      jenis,
      namaFileAsli: `uji-${id}.xlsx`,
      diunggahOlehNama: "Admin Uji",
      diunggahPada: waktu,
      jumlahBarisTotal: 2,
      jumlahBerhasil: 2,
      jumlahGagal: 0,
    };
  }

  function dataSintetis(): Record<string, Baris[]> {
    return {
      pegawai: [
        { nip: P1, dibuatPada: T1 },
        { nip: P2, dibuatPada: T2 },
      ],
      // id sengaja berceloteh (celah), seperti KDS2 produksi
      upload_batch: [batch(5, "nominatif_bulanan", T1), batch(9, "kehadiran_bulanan", T2), batch(40, "kehadiran_manual", T2)],
      nominatif_bulanan: [
        nominatif(11, P1, "Pegawai Uji Satu", 5, null),
        nominatif(30, P2, "Pegawai Uji Dua", 5, new Date("1990-05-17T00:00:00.000Z")),
      ],
      rekap_kehadiran_bulanan: [
        { id: 70, nip: P1, bulan: 8, tahun: 2026, uploadBatchId: 9 },
        { id: 71, nip: P2, bulan: 8, tahun: 2026, uploadBatchId: 40 },
        { id: 72, nip: P2, bulan: 9, tahun: 2026, uploadBatchId: 40 }, // batch 40 mencakup dua bulan
      ],
      rekap_kehadiran_detail: [
        { id: 1000, rekapKehadiranBulananId: 70, komponenKode: "TK", nilai: "3" },
        { id: 1004, rekapKehadiranBulananId: 70, komponenKode: "JENIS_SHIFT", nilai: "-" },
      ],
      upload_error_rows: [{ id: 3, uploadBatchId: 9, nomorBaris: 7, nipDimaksud: "0000", alasan: "NIP tidak ditemukan" }],
      koreksi_rekap: [
        {
          id: 2,
          nip: P1,
          jenis: "periode",
          dariKomponen: "TK",
          keKomponen: null,
          tanggalMulai: new Date("2026-08-01T00:00:00.000Z"),
          tanggalSelesai: null,
          bulan: null,
          tahun: null,
          jumlahHari: null,
          diterapkanBatchId: null,
          alasan: "Uji",
          sumber: null,
          dibuatOleh: "Admin Uji",
          dibuatPada: T1,
          dibatalkanPada: null,
        },
      ],
      catatan_status_pegawai: [{ id: 4, nip: P2, alasan: "Pensiun", sumber: null, dicatatPada: T2 }],
      audit_log: [
        {
          id: 8,
          namaTabel: "koreksi_rekap",
          idRecord: "2",
          fieldDiubah: "nilai:TK",
          nilaiLama: "3",
          nilaiBaru: "0",
          diubahOleh: "Admin Uji",
          diubahPada: T2,
          aksi: "UPDATE",
        },
      ],
    };
  }
  const AUTO = { upload_batch: 72, nominatif_bulanan: 31, rekap_kehadiran_detail: 390_525, audit_log: 4081 };

  beforeAll(async () => {
    prisma = new PrismaClient();
    const [j, s, u] = await Promise.all([
      prisma.jenisPegawai.findFirstOrThrow(),
      prisma.statusKepegawaian.findFirstOrThrow(),
      prisma.unitAsal.findFirstOrThrow(),
    ]);
    kode = { jenis: j.kode, status: s.kode, unit: u.kode };
  });
  beforeEach(async () => {
    await kosongkanDomain(prisma);
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("menyalin semua baris, mempertahankan id (termasuk celah) dan nilai", async () => {
    const lap = await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO) });
    expect(lap.dryRun).toBe(false);
    expect(lap.tabel.find((t) => t.mysql === "rekap_kehadiran_detail")).toMatchObject({ dibaca: 2, ditulis: 2 });

    const semuaBatch = await prisma.uploadBatch.findMany({ orderBy: { id: "asc" } });
    expect(semuaBatch.map((b) => b.id)).toEqual([5, 9, 40]);
    expect(semuaBatch[0]).toMatchObject({ status: "Selesai", diunggahOlehId: null, diunggahPada: T1 });

    const nom = await prisma.nominatifBulanan.findMany({ orderBy: { id: "asc" } });
    expect(nom.map((n) => n.id)).toEqual([11, 30]);
    expect(nom[0].tanggalLahir).toBeNull();
    expect(nom[1].tanggalLahir?.toISOString()).toBe("1990-05-17T00:00:00.000Z");
    expect(nom[0].tanggalMulaiKerja.toISOString()).toBe("2020-01-31T00:00:00.000Z");

    const det = await prisma.rekapKehadiranDetail.findMany({ orderBy: { id: "asc" } });
    expect(det.map((d) => [d.id, d.komponenKode, d.nilai])).toEqual([
      [1000, "TK", "3"],
      [1004, "JENIS_SHIFT", "-"],
    ]);
    expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: 8 } })).diubahPada).toEqual(T2);
  });

  it("menyetel sequence sehingga insert berikutnya memakai id = AUTO_INCREMENT sumber", async () => {
    await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO) });
    const baru = await prisma.uploadBatch.create({
      data: { jenis: "nominatif_bulanan", namaFileAsli: "baru.xlsx", diunggahOlehNama: "Uji" },
    });
    expect(baru.id).toBe(72);
    const ad = await prisma.auditLog.create({
      data: { namaTabel: "x", idRecord: "1", fieldDiubah: "f", diubahOleh: "Uji", diubahPada: T2, aksi: "INSERT" },
    });
    expect(ad.id).toBe(4081);
  });

  it("tanpa AUTO_INCREMENT dari sumber: sequence mulai setelah id terbesar", async () => {
    await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), {}) });
    const baru = await prisma.catatanStatusPegawai.create({
      data: { nip: "900000000000000099", alasan: "Uji", dicatatPada: T2 },
    });
    expect(baru.id).toBe(5); // id terbesar sumber = 4
  });

  it("tabel kosong di sumber tetap menghasilkan sequence yang sah", async () => {
    const data = dataSintetis();
    data.catatan_status_pegawai = [];
    await jalankanMigrasi({ prisma, sumber: sumberMemori(data, {}) });
    const baru = await prisma.catatanStatusPegawai.create({
      data: { nip: "900000000000000099", alasan: "Uji", dicatatPada: T2 },
    });
    expect(baru.id).toBe(1);
  });

  it("mengisi bulan/tahun batch hanya bila periodenya tunggal", async () => {
    await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO) });
    const per = async (id: number) => {
      const b = await prisma.uploadBatch.findUniqueOrThrow({ where: { id } });
      return [b.bulan, b.tahun];
    };
    expect(await per(5)).toEqual([9, 2026]); // dari nominatif
    expect(await per(9)).toEqual([8, 2026]); // dari rekap
    expect(await per(40)).toEqual([null, null]); // dua bulan: tidak ditebak
  });

  it("dry-run: melaporkan hitungan tetapi tidak menyimpan apa pun", async () => {
    const lap = await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO), dryRun: true });
    expect(lap.dryRun).toBe(true);
    expect(lap.tabel.find((t) => t.mysql === "nominatif_bulanan")?.ditulis).toBe(2);
    expect(await prisma.pegawai.count()).toBe(0);
    expect(await prisma.uploadBatch.count()).toBe(0);
  });

  it("dry-run tidak mengubah sequence (setval tidak ikut rollback transaksi)", async () => {
    await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO), dryRun: true });
    const baru = await prisma.uploadBatch.create({
      data: { jenis: "nominatif_bulanan", namaFileAsli: "baru.xlsx", diunggahOlehNama: "Uji" },
    });
    expect(baru.id).toBe(1); // sequence masih awal, bukan 72
  });

  it("menolak target yang tidak kosong, kecuali memakai ganti", async () => {
    await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO) });
    await expect(jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO) })).rejects.toThrow(
      /tidak kosong/i
    );
    const lap = await jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis(), AUTO), ganti: true });
    expect(lap.tabel.find((t) => t.mysql === "pegawai")?.ditulis).toBe(2);
    expect(await prisma.pegawai.count()).toBe(2);
  });

  it("menolak jalan bila ada data KDS1 yang bergantung pada batch (bahkan dengan ganti)", async () => {
    const u = await prisma.user.upsert({
      where: { email: "uji@kds.test" },
      create: { email: "uji@kds.test", nama: "Uji", passwordHash: "x" },
      update: {},
    });
    const b = await prisma.uploadBatch.create({
      data: { jenis: "standarisasi_nominatif", namaFileAsli: "x", diunggahOlehNama: "Uji" },
    });
    await prisma.barisBermasalah.create({
      data: { uploadBatchId: b.id, nip: "1", dataMentah: {}, alasanUtama: "Lainnya", detailAlasan: "x" },
    });
    try {
      await expect(jalankanMigrasi({ prisma, sumber: sumberMemori(dataSintetis()), ganti: true })).rejects.toThrow(
        /KDS1/
      );
    } finally {
      await prisma.barisBermasalah.deleteMany();
      await prisma.uploadBatch.deleteMany();
      await prisma.user.delete({ where: { id: u.id } });
    }
  });

  it("rollback penuh bila satu tabel gagal (foreign key rusak)", async () => {
    const rusak = dataSintetis();
    rusak.nominatif_bulanan[0].pegawaiNip = "999999999999999999"; // tidak ada di pegawai
    await expect(jalankanMigrasi({ prisma, sumber: sumberMemori(rusak, AUTO) })).rejects.toThrow();
    expect(await prisma.pegawai.count()).toBe(0);
    expect(await prisma.uploadBatch.count()).toBe(0);
  });
});
