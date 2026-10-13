/**
 * PARITAS Standarisasi (F4.5a): importBatch + resolveRow KDS1 ASLI (oracle: kode KDS1 dijalankan terhadap database lokal kds1_oracle,
 * dengan master data yang SAMA dengan kds_test) dan layanan KDS Terpadu memproses berkas mentah SINTETIS yang sama. Dibandingkan:
 * batch (status, hitungan, peta kolom), snapshot Nominatif beserta jabatan tambahan, antrean Review (alasan, detail, data mentah),
 * Kamus Koreksi, daftar pegawai, serta penggantian snapshot bulan yang sama. Tanpa data pegawai asli.
 * Prasyarat: npx tsx scripts/oracle/siapkan-kds1-oracle.ts (sekali).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { kunciGolongan, kunciJabatan, kunciKlasifikasi, kunciStatusKepegawaian, kunciUnitKerja } from "@/lib/domain/classify";
import { klasifikasiBerkas, simpanStandarisasi } from "@/lib/standarisasi/proses";
import { selesaikanBaris } from "@/lib/standarisasi/resolve";
import { KesalahanUpload } from "@/lib/upload/konstanta";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { type KeluaranKasusKds1, jalankanOracleKds1, type MasukanOracleKds1, oracleKds1Tersedia } from "../support/oracleKds1";
import { buatBerkasRaw, type Vocab } from "../support/rawSimpega";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleKds1Tersedia());

const MODEL_MASTER = ["jenisPegawai", "statusKepegawaian", "golongan", "jabatanFungsionalDosen", "jabatanFungsionalTendik", "jabatanFungsiUmumPelaksana", "jabatanTambahanRole", "kategoriAkademisiLuar", "unitInduk", "unitAsal", "programStudi"] as const;
type Kasus = { id: string; berkas: Buffer; bulan: number; tahun: number; kamus?: MasukanOracleKds1["kamus"]; nipTerdaftar?: string[]; nominatifLama?: MasukanOracleKds1["nominatifLama"]; resolve?: MasukanOracleKds1["kasus"][number]["langkahResolve"] };

async function bangunVocab(prisma: PrismaClient): Promise<Vocab> {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })),
    dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()),
    umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama),
    status: await prisma.statusKepegawaian.findMany(),
    role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole),
    prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
}

describe.skipIf(!ada)("Paritas Standarisasi terhadap importBatch/resolveRow KDS1 asli", () => {
  const prisma = new PrismaClient();
  const kasus: Kasus[] = [];
  let oracle: Record<string, KeluaranKasusKds1>;
  let master: MasukanOracleKds1["master"];

  const bersihkan = async () => {
    await kosongkanDomain(prisma);
    await prisma.kamusKoreksi.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany({ where: { email: "oracle@uji.test" } });
  };

  beforeAll(async () => {
    master = {};
    for (const m of MODEL_MASTER) master[m] = await (prisma as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>)[m].findMany({ orderBy: { kode: "asc" } });
    const vocab = await bangunVocab(prisma);
    const unit = await prisma.unitAsal.findMany({ orderBy: { kode: "asc" } });
    const dasar = await buatBerkasRaw({ vocab, bulan: 10, tahun: 2026, jumlah: 320, benih: 20261013 });
    kasus.push({ id: "dasar", berkas: dasar.buffer, bulan: 10, tahun: 2026 });

    // kamus: ingat sebagian hasil review (status/golongan/jabatan/unit tak dikenal) + NIP dikecualikan permanen + identitas eksternal
    const hasil1 = await (async () => {
      await bersihkan();
      return klasifikasiBerkas(prisma, dasar.buffer, 10, 2026);
    })();
    const kamus: NonNullable<Kasus["kamus"]> = [];
    const status = vocab.status.find((s) => s.kategori === "ASN")!;
    const unitKode = unit[0].kode;
    hasil1.bermasalah.slice(0, 60).forEach((b, i) => {
      const mentah = b.dataMentah as unknown as Parameters<typeof kunciStatusKepegawaian>[0] & Parameters<typeof kunciGolongan>[0] & Parameters<typeof kunciJabatan>[0] & Parameters<typeof kunciUnitKerja>[0] & Parameters<typeof kunciKlasifikasi>[0];
      if (i % 5 === 0) kamus.push({ jenisField: "StatusKepegawaian", kunciMentah: kunciStatusKepegawaian(mentah), nilaiResolusi: status.kode });
      if (i % 5 === 1) kamus.push({ jenisField: "Golongan", kunciMentah: kunciGolongan(mentah), nilaiResolusi: "III/a" });
      if (i % 5 === 2) kamus.push({ jenisField: "UnitKerja", kunciMentah: kunciUnitKerja(mentah), nilaiResolusi: unitKode });
      if (i % 5 === 3) kamus.push({ jenisField: "Klasifikasi", kunciMentah: kunciKlasifikasi(mentah), nilaiResolusi: i % 2 ? "Dosen" : "Tendik" });
      if (i % 5 === 4) kamus.push({ jenisField: "PegawaiDikecualikanPermanen", kunciMentah: b.nip, nilaiResolusi: "1" });
    });
    // entri kamus bisa bentrok pada (jenisField, kunciMentah): ambil yang pertama
    const unik = new Map(kamus.map((k) => [`${k.jenisField}::${k.kunciMentah}`, k]));
    kasus.push({ id: "dengan-kamus", berkas: dasar.buffer, bulan: 10, tahun: 2026, kamus: [...unik.values()] });

    // snapshot lama: bulan yang sama (harus diganti total) dan bulan lain (harus utuh); NIP terdaftar memengaruhi baris jabatan kosong
    const jenisDsn = master.jenisPegawai.find((j) => j.kode === "DSN")!.kode as string;
    const asn = status.kode;
    kasus.push({
      id: "menimpa-bulan", berkas: (await buatBerkasRaw({ vocab, bulan: 10, tahun: 2026, jumlah: 60, benih: 77, awalNip: 5000 })).buffer, bulan: 10, tahun: 2026,
      nominatifLama: [
        { nip: "198001012005011111", bulan: 10, tahun: 2026, jenisKode: jenisDsn, statusKode: asn, unitKode },
        { nip: "198001012005011112", bulan: 10, tahun: 2026, jenisKode: jenisDsn, statusKode: asn, unitKode },
        { nip: "198001012005011113", bulan: 9, tahun: 2026, jenisKode: jenisDsn, statusKode: asn, unitKode },
      ],
      nipTerdaftar: ["198001012005011114"],
    });
    kasus.push({ id: "bulan-berbeda-tanpa-placeholder", berkas: (await buatBerkasRaw({ vocab, bulan: 3, tahun: 2027, jumlah: 80, benih: 4242, tanpaPlaceholder: true })).buffer, bulan: 3, tahun: 2027 });

    // resolve: tiga baris review diselesaikan dengan data eksplisit (kode master asli) dan pilihan "ingat" berbeda-beda
    const k0 = { ...(await buatBerkasRaw({ vocab, bulan: 10, tahun: 2026, jumlah: 150, benih: 99 })) };
    const hasilR = await (async () => {
      await bersihkan();
      return klasifikasiBerkas(prisma, k0.buffer, 10, 2026);
    })();
    const dosenKode = (await prisma.jabatanFungsionalDosen.findFirstOrThrow()).kode;
    const tendikKode = (await prisma.jabatanFungsionalTendik.findFirstOrThrow()).kode;
    const role = (await prisma.jabatanTambahanRole.findFirstOrThrow()).kode;
    const dataDasar = {
      nama: "Nama Diselesaikan", jenisKelamin: "L", tanggalLahir: null, pendidikanTerakhir: "S2", agama: "Islam", jenisPegawaiKode: "DSN", statusKepegawaianKode: status.kode, golonganKode: "III/b",
      jabatanFungsionalDosenKode: dosenKode, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: null, kategoriAkademisiLuarKode: null, unitAsalKode: unitKode, tanggalMulaiKerja: "2019-05-06T00:00:00.000Z",
      jabatanTambahan: [{ jabatanTambahanRoleKode: role, unitAsalKode: unitKode, programStudiKode: null, statusPengangkatan: "Definitif" }],
    };
    expect(hasilR.bermasalah.length).toBeGreaterThan(5);
    kasus.push({
      id: "resolve", berkas: k0.buffer, bulan: 10, tahun: 2026,
      resolve: [
        { urutan: 0, kelompok: "Dosen", data: dataDasar, ingat: { klasifikasi: true, statusKepegawaian: true, golongan: true, jabatan: true, unitKerja: true, jabatanTambahan: true } },
        { urutan: 0, kelompok: "Tendik", data: { ...dataDasar, jenisPegawaiKode: "TDK", jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: tendikKode, jabatanTambahan: [] }, ingat: { klasifikasi: true } },
        { urutan: 1, kelompok: "Dosen", data: { ...dataDasar, golonganKode: null, jabatanTambahan: [] }, ingat: {} },
      ],
    });
    await bersihkan();

    oracle = {};
    for (const k of kasus) {
      const berkasPath = `${process.env.TEMP ?? "/tmp"}/kds-raw-${k.id}.xlsx`.replace(/\\/g, "/");
      (await import("node:fs")).writeFileSync(berkasPath, k.berkas);
      try {
        const keluar = await jalankanOracleKds1({
          master, kamus: k.kamus, nipTerdaftar: k.nipTerdaftar, nominatifLama: k.nominatifLama,
          kasus: [{ id: k.id, berkas: berkasPath, namaFile: `${k.id}.xlsx`, bulan: k.bulan, tahun: k.tahun, langkahResolve: k.resolve }],
        });
        Object.assign(oracle, keluar);
      } finally {
        (await import("node:fs")).rmSync(berkasPath, { force: true });
      }
    }
  }, 900_000);

  afterAll(async () => {
    await bersihkan();
    await prisma.$disconnect();
  });

  const tgl = (v: string | Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : null);
  const urutBaris = <T extends { nip: string; detailAlasan: string }>(a: T[]) => [...a].sort((x, y) => (x.nip < y.nip ? -1 : x.nip > y.nip ? 1 : x.detailAlasan < y.detailAlasan ? -1 : 1));

  for (const id of ["dasar", "dengan-kamus", "menimpa-bulan", "bulan-berbeda-tanpa-placeholder", "resolve"]) {
    it(id, async () => {
      const k = kasus.find((x) => x.id === id)!;
      // kode placeholder "Belum Diketahui" KDS1 (DSN-99/UMM-99) = DSN-05/UMM-11 di master KDS2 (lihat komentar di classify.ts)
      const kodeBdDosen = (master.jabatanFungsionalDosen.find((j) => /^belum diketahui/i.test(String(j.nama)))!.kode) as string;
      const kodeBdUmum = (master.jabatanFungsiUmumPelaksana.find((j) => /^belum diketahui/i.test(String(j.nama)))!.kode) as string;
      const h = JSON.parse(JSON.stringify(oracle[id]).replaceAll('"DSN-99"', JSON.stringify(kodeBdDosen)).replaceAll('"UMM-99"', JSON.stringify(kodeBdUmum))) as KeluaranKasusKds1;
      expect(h.galat, `oracle galat: ${h.galat}`).toBeNull();

      await bersihkan();
      const admin = await prisma.user.create({ data: { email: "oracle@uji.test", passwordHash: "x", nama: "Admin Oracle" } });
      if (k.kamus?.length) await prisma.kamusKoreksi.createMany({ data: k.kamus.map((x) => ({ ...x, dibuatOlehId: admin.id })) });
      if (k.nipTerdaftar?.length) await prisma.pegawai.createMany({ data: k.nipTerdaftar.map((nip) => ({ nip })), skipDuplicates: true });
      if (k.nominatifLama?.length) {
        const lama = await prisma.uploadBatch.create({ data: { jenis: "standarisasi_nominatif", bulan: k.bulan, tahun: k.tahun, namaFileAsli: "lama.xlsx", status: "Selesai", diunggahOlehNama: "t" } });
        await prisma.pegawai.createMany({ data: k.nominatifLama.map((n) => ({ nip: n.nip })), skipDuplicates: true });
        for (const n of k.nominatifLama) {
          await prisma.nominatifBulanan.create({
            data: { pegawaiNip: n.nip, bulan: n.bulan, tahun: n.tahun, nama: `Lama ${n.nip}`, jenisKelamin: "L", jenisPegawaiKode: n.jenisKode, statusKepegawaianKode: n.statusKode, unitAsalKode: n.unitKode, tanggalMulaiKerja: new Date("2010-01-01T00:00:00Z"), uploadBatchId: lama.id },
          });
        }
      }

      const { batchId } = await simpanStandarisasi(prisma, k.berkas, `${id}.xlsx`, { bulan: k.bulan, tahun: k.tahun }, { id: admin.id, nama: "Admin Oracle" });
      for (const r of k.resolve ?? []) {
        const baris = await prisma.barisBermasalah.findMany({ where: { uploadBatchId: batchId, status: "Menunggu" }, orderBy: [{ nip: "asc" }, { id: "asc" }] });
        await selesaikanBaris(prisma, {
          barisBermasalahId: baris[r.urutan].id, kelompok: r.kelompok as "Dosen", ingat: r.ingat, pengguna: { id: admin.id, nama: "Admin Oracle" },
          data: { ...r.data, tanggalLahir: null, tanggalMulaiKerja: new Date(String(r.data.tanggalMulaiKerja)) } as never,
        });
      }

      // batch
      const b = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect({ bulan: b.bulan, tahun: b.tahun, namaFileAsli: b.namaFileAsli, status: b.status, jumlahBarisTotal: b.jumlahBarisTotal, jumlahBerhasil: b.jumlahBerhasil, jumlahPerluReview: b.jumlahPerluReview, petaKolomTerdeteksi: b.petaKolomTerdeteksi }).toEqual(h.batch);
      const lainnya = await prisma.uploadBatch.findMany({ where: { id: { not: batchId } } });
      expect(lainnya.filter((x) => x.namaFileAsli === "lama.xlsx").map((x) => x.status)).toEqual(h.batchLamaStatus);

      // snapshot
      const nominatif = (await prisma.nominatifBulanan.findMany({ include: { jabatanTambahan: { orderBy: { id: "asc" } } }, orderBy: [{ pegawaiNip: "asc" }, { bulan: "asc" }, { tahun: "asc" }] })).map((n) => ({
        nip: n.pegawaiNip, bulan: n.bulan, tahun: n.tahun, nama: n.nama, jenisKelamin: n.jenisKelamin, tanggalLahir: tgl(n.tanggalLahir), pendidikanTerakhir: n.pendidikanTerakhir, agama: n.agama,
        jenisPegawaiKode: n.jenisPegawaiKode, statusKepegawaianKode: n.statusKepegawaianKode, golonganKode: n.golonganKode, jabatanFungsionalDosenKode: n.jabatanFungsionalDosenKode,
        jabatanFungsionalTendikKode: n.jabatanFungsionalTendikKode, jabatanFungsiUmumKode: n.jabatanFungsiUmumKode, kategoriAkademisiLuarKode: n.kategoriAkademisiLuarKode, unitAsalKode: n.unitAsalKode,
        tanggalMulaiKerja: tgl(n.tanggalMulaiKerja), dariBatchBaru: n.uploadBatchId === batchId,
        jabatanTambahan: n.jabatanTambahan.map((j) => ({ role: j.jabatanTambahanRoleKode, unit: j.unitAsalKode, prodi: j.programStudiKode, status: j.statusPengangkatan })),
      }));
      expect(nominatif).toEqual(h.nominatif.map((n) => ({ ...n, tanggalLahir: tgl(n.tanggalLahir), tanggalMulaiKerja: tgl(n.tanggalMulaiKerja) })));

      // antrean review
      const baris = (await prisma.barisBermasalah.findMany()).map((x) => ({ nip: x.nip, alasanUtama: x.alasanUtama, detailAlasan: x.detailAlasan, status: x.status, dataMentah: x.dataMentah, resolvedFields: x.resolvedFields }));
      expect(urutBaris(baris)).toEqual(urutBaris(h.barisBermasalah));

      // kamus dan pegawai
      const kamus = (await prisma.kamusKoreksi.findMany({ orderBy: [{ jenisField: "asc" }, { kunciMentah: "asc" }] })).map((x) => ({ jenisField: x.jenisField, kunciMentah: x.kunciMentah, nilaiResolusi: x.nilaiResolusi }));
      expect(kamus).toEqual(h.kamus);
      expect((await prisma.pegawai.findMany({ orderBy: { nip: "asc" } })).map((p) => p.nip)).toEqual(h.pegawai);

      if (id === "dasar") {
        expect(h.batch!.jumlahBerhasil).toBeGreaterThan(100);
        expect(h.batch!.jumlahPerluReview).toBeGreaterThan(20);
        expect(h.nominatif.some((n) => n.jabatanTambahan.length > 0)).toBe(true);
        expect(h.barisBermasalah.some((x) => x.alasanUtama === "IdentitasEksternalPerluVerifikasi")).toBe(true);
      }
      if (id === "menimpa-bulan") expect(h.nominatif.filter((n) => n.bulan === 9).length).toBe(1); // bulan lain utuh; bulan itu diganti total
      if (id === "resolve") expect(h.kamus.length).toBeGreaterThan(4);
    }, 120_000);
  }

  it("NIP ganda pada baris yang berhasil: KDS1 gagal dengan galat basis data, KDS Terpadu menolak dengan pesan jelas tanpa menulis apa pun", async () => {
    const vocab = await bangunVocab(prisma);
    await bersihkan();
    const { buffer } = await buatBerkasRaw({ vocab, bulan: 10, tahun: 2026, jumlah: 60, benih: 5, tanpaPlaceholder: true });
    // cari NIP yang berhasil diklasifikasi, lalu gandakan barisnya di akhir berkas
    const awal = await klasifikasiBerkas(prisma, buffer, 10, 2026);
    expect(awal.nominatif.length).toBeGreaterThan(5);
    const nipTarget = awal.nominatif[0].pegawaiNip;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    let sumber = 0;
    ws.eachRow((r, n) => {
      if (n > 1 && String(r.getCell(1).value).replace(/[​-‏﻿]/g, "") === nipTarget) sumber = n;
    });
    expect(sumber).toBeGreaterThan(1);
    ws.addRow(ws.getRow(sumber).values as never);
    const ganda = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(simpanStandarisasi(prisma, ganda, "ganda.xlsx", { bulan: 10, tahun: 2026 }, { id: null, nama: "t" })).rejects.toBeInstanceOf(KesalahanUpload);
    expect(await prisma.nominatifBulanan.count()).toBe(0);
    expect(await prisma.uploadBatch.count()).toBe(0);
    expect(await prisma.pegawai.count()).toBe(0);
  }, 120_000);
});
