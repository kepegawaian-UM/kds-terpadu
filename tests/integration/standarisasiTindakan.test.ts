/**
 * Tindakan layar Review/Batch/Kamus (F4.5b): kecualikan (biasa dan permanen), hapus pegawai satu bulan, hapus kamus, tambah master,
 * dan pengurai formulir "Selesaikan baris". Semua terhadap kds_test dengan data sintetis.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { uraiFormResolve } from "@/lib/standarisasi/formResolve";
import { tambahProgramStudiBaru, tambahRoleJabatanTambahan, tambahUnitAsalBaru } from "@/lib/standarisasi/master";
import { simpanStandarisasi } from "@/lib/standarisasi/proses";
import { hapusKamus, hapusPegawaiBulan, kecualikanBaris } from "@/lib/standarisasi/tindakan";
import { JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN } from "@/lib/domain/masterCache";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { buatBerkasRaw, type Vocab } from "../support/rawSimpega";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const pengguna = { id: null, nama: "Admin Uji" };

/** Master tambahan yang dibuat tes ini harus dihapus: kds_test dipakai tes paritas master (isi harus sama persis dengan KDS2). */
async function bersihkanMasterUji() {
  await prisma.programStudi.deleteMany({ where: { nama: "Prodi Uji Baru" } });
  await prisma.unitAsal.deleteMany({ where: { nama: "Unit Uji Baru" } });
  await prisma.jabatanTambahanRole.deleteMany({ where: { namaRole: "Ketua Gugus Uji" } });
}

async function vocab(): Promise<Vocab> {
  const unit = await prisma.unitAsal.findMany({ include: { unitInduk: true }, orderBy: { kode: "asc" } });
  return {
    unit: unit.map((u) => ({ nama: u.nama, induk: u.unitInduk.nama })), dosen: (await prisma.jabatanFungsionalDosen.findMany()).map((x) => x.nama),
    tendik: (await prisma.jabatanFungsionalTendik.findMany()).map((x) => `${x.jabatanPokok} ${x.jenjang}`.trim()), umum: (await prisma.jabatanFungsiUmumPelaksana.findMany()).map((x) => x.nama),
    akl: (await prisma.kategoriAkademisiLuar.findMany()).map((x) => x.nama), status: await prisma.statusKepegawaian.findMany(),
    role: (await prisma.jabatanTambahanRole.findMany()).map((x) => x.namaRole), prodi: (await prisma.programStudi.findMany()).map((x) => x.nama),
  };
}

async function buatBatch(jumlah = 60, benih = 21) {
  const { buffer } = await buatBerkasRaw({ vocab: await vocab(), bulan: 10, tahun: 2026, jumlah, benih, tanpaPlaceholder: true });
  const r = await simpanStandarisasi(prisma, buffer, "oktober.xlsx", { bulan: 10, tahun: 2026 }, { id: null, nama: "t" });
  return r.batchId;
}

function formDasar(ubah: Record<string, string> = {}) {
  const f = new FormData();
  const isi: Record<string, string> = { kelompok: "Dosen", nama: "Nama Uji", jenisKelamin: "L", tanggalMulaiKerja: "2015-03-01", statusKepegawaianKode: "ST-1", unitAsalKode: "UA-001", jabatanPilihan: "DOSEN:X", ...ubah };
  for (const [k, v] of Object.entries(isi)) if (v !== "") f.set(k, v);
  return f;
}

describe.skipIf(!ada)("Tindakan Review, Batch, dan Kamus", () => {
  beforeEach(async () => {
    await bersihkanMasterUji();
    await kosongkanDomain(prisma);
    await prisma.kamusKoreksi.deleteMany();
    await prisma.auditLog.deleteMany();
    if ((await prisma.user.count()) === 0) await prisma.user.create({ data: { email: `t${Date.now()}@uji.test`, passwordHash: "x", nama: "Admin" } });
  });
  afterAll(async () => {
    await bersihkanMasterUji();
    await kosongkanDomain(prisma);
    await prisma.kamusKoreksi.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  it("kecualikan: status berubah, hitungan batch ikut, audit tercatat; baris yang sudah diproses atau milik batch lain ditolak", async () => {
    const batchId = await buatBatch();
    const antrean = await prisma.barisBermasalah.findMany({ where: { uploadBatchId: batchId } });
    expect(antrean.length).toBeGreaterThan(2);

    expect(await kecualikanBaris(prisma, batchId + 99, antrean[0].id, false, pengguna)).toMatchObject({ ok: false });
    const h = await kecualikanBaris(prisma, batchId, antrean[0].id, false, pengguna);
    expect(h.ok).toBe(true);
    const baris = await prisma.barisBermasalah.findUniqueOrThrow({ where: { id: antrean[0].id } });
    expect(baris.status).toBe("Dikecualikan");
    const batch = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.jumlahPerluReview).toBe(antrean.length - 1);
    expect(batch.status).toBe("MenungguReview");
    expect(await prisma.auditLog.count({ where: { namaTabel: "baris_bermasalah", idRecord: antrean[0].id, aksi: "UPDATE" } })).toBe(1);
    expect(await prisma.kamusKoreksi.count({ where: { jenisField: JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN } })).toBe(0);

    expect(await kecualikanBaris(prisma, batchId, antrean[0].id, false, pengguna)).toMatchObject({ ok: false, error: "Baris ini sudah diproses sebelumnya." });
  });

  it("kecualikan permanen mencatat NIP di Kamus; mengecualikan baris terakhir menutup batch (Selesai)", async () => {
    const batchId = await buatBatch();
    const antrean = await prisma.barisBermasalah.findMany({ where: { uploadBatchId: batchId }, orderBy: { id: "asc" } });
    for (const [i, b] of antrean.entries()) {
      expect((await kecualikanBaris(prisma, batchId, b.id, i === 0, pengguna)).ok).toBe(true);
    }
    const kamus = await prisma.kamusKoreksi.findMany({ where: { jenisField: JENIS_FIELD_PEGAWAI_DIKECUALIKAN_PERMANEN } });
    expect(kamus.map((k) => k.kunciMentah)).toEqual([antrean[0].nip]);
    const batch = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch).toMatchObject({ jumlahPerluReview: 0, status: "Selesai" });
  });

  it("hapus pegawai: hanya baris batch itu, jabatan tambahan ikut terhapus, hitungan dan audit DELETE", async () => {
    const batchId = await buatBatch(120, 22);
    const semua = await prisma.nominatifBulanan.findMany({ where: { uploadBatchId: batchId }, include: { jabatanTambahan: true } });
    const target = semua.find((n) => n.jabatanTambahan.length > 0) ?? semua[0];
    const sebelumBatch = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });

    expect(await hapusPegawaiBulan(prisma, batchId + 99, target.id, pengguna)).toMatchObject({ ok: false });
    expect(await prisma.nominatifBulanan.count()).toBe(semua.length);

    const h = await hapusPegawaiBulan(prisma, batchId, target.id, pengguna);
    expect(h).toMatchObject({ ok: true });
    expect(await prisma.nominatifBulanan.count()).toBe(semua.length - 1);
    expect(await prisma.nominatifBulananJabatanTambahan.count({ where: { nominatifBulananId: target.id } })).toBe(0);
    const sesudah = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(sesudah.jumlahBerhasil).toBe(sebelumBatch.jumlahBerhasil - 1);
    expect(sesudah.jumlahBarisTotal).toBe(sebelumBatch.jumlahBarisTotal - 1);
    const audit = await prisma.auditLog.findMany({ where: { namaTabel: "nominatif_bulanan", aksi: "DELETE" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ idRecord: String(target.id), nilaiLama: target.pegawaiNip, diubahOleh: "Admin Uji" });

    expect(await hapusPegawaiBulan(prisma, batchId, target.id, pengguna)).toMatchObject({ ok: false }); // sudah tidak ada
  });

  it("hapus kamus: entri hilang dan tercatat; id tak dikenal ditolak", async () => {
    const admin = await prisma.user.findFirstOrThrow();
    const e = await prisma.kamusKoreksi.create({ data: { jenisField: "UnitKerja", kunciMentah: "unit lama", nilaiResolusi: "UA-001", dibuatOlehId: admin.id } });
    expect(await hapusKamus(prisma, "tidak-ada", pengguna)).toMatchObject({ ok: false });
    expect(await hapusKamus(prisma, e.id, pengguna)).toMatchObject({ ok: true });
    expect(await prisma.kamusKoreksi.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { namaTabel: "kamus_koreksi", idRecord: e.id, aksi: "DELETE" } })).toBe(1);
  });

  it("tambah master: kode berurutan, nama yang sudah ada (beda huruf besar/kecil) tidak digandakan, masukan tak valid ditolak", async () => {
    const role = await tambahRoleJabatanTambahan(prisma, "  Ketua Gugus Uji ", "Dosen");
    expect(role.kode).toMatch(/^JBT-\d{2,}$/);
    expect(await tambahRoleJabatanTambahan(prisma, "ketua gugus uji", "Tendik")).toEqual(role);
    await expect(tambahRoleJabatanTambahan(prisma, "  ", "Dosen")).rejects.toThrow();

    const induk = await prisma.unitInduk.findFirstOrThrow();
    const unit = await tambahUnitAsalBaru(prisma, "Unit Uji Baru", induk.kode);
    expect(unit.kode).toMatch(/^UA-\d{3,}$/);
    expect(await tambahUnitAsalBaru(prisma, "UNIT UJI BARU", induk.kode)).toEqual(unit);
    await expect(tambahUnitAsalBaru(prisma, "X", "UI-TIDAK-ADA")).rejects.toThrow("Unit Induk tidak valid.");

    const prodi = await tambahProgramStudiBaru(prisma, "Prodi Uji Baru", "S1", unit.kode);
    expect(prodi.kode).toMatch(/^PRD-\d{3,}$/);
    expect((await prisma.programStudi.findUniqueOrThrow({ where: { kode: prodi.kode } })).statusValidasi).toBe("Draft");
    await expect(tambahProgramStudiBaru(prisma, "Lain", " ", unit.kode)).rejects.toThrow("Jenjang wajib dipilih.");
  });

  it("pengurai formulir: Dosen valid, Akademisi Luar (PTT, tanpa golongan), jabatan tambahan berurutan, dan setiap galat validasi", async () => {
    const status = (await prisma.statusKepegawaian.findFirstOrThrow()).kode;
    const unit = (await prisma.unitAsal.findFirstOrThrow()).kode;
    const dasar = { statusKepegawaianKode: status, unitAsalKode: unit };

    const ok = await uraiFormResolve(prisma, formDasar({ ...dasar, golonganKode: "GOL-1", ingatUnit: "on" }));
    expect(ok).toMatchObject({ ok: true, kelompok: "Dosen" });
    if (!ok.ok) return;
    expect(ok.data).toMatchObject({ nama: "Nama Uji", jenisKelamin: "L", statusKepegawaianKode: status, golonganKode: "GOL-1", jabatanFungsionalDosenKode: "X", unitAsalKode: unit });
    expect(ok.data.tanggalMulaiKerja.toISOString()).toBe("2015-03-01T00:00:00.000Z");
    expect(ok.ingat).toMatchObject({ unitKerja: true, golongan: false });
    expect(ok.data.jabatanTambahan).toEqual([]);

    const akl = await uraiFormResolve(prisma, formDasar({ kelompok: "Akademisi Luar UM", kategoriAkademisiLuarKode: "KAL-1", jabatanPilihan: "", golonganKode: "GOL-1", unitAsalKode: unit, statusKepegawaianKode: "" }));
    expect(akl).toMatchObject({ ok: true, kelompok: "Akademisi Luar UM" });
    if (akl.ok) expect(akl.data).toMatchObject({ statusKepegawaianKode: "PTT", golonganKode: null, kategoriAkademisiLuarKode: "KAL-1", jabatanFungsionalDosenKode: null });

    const jt = await uraiFormResolve(prisma, formDasar({
      ...dasar, adaJabatanTambahan: "on", jabatanTambahanRoleKode: "JBT-01", jabatanTambahanTargetKode: `UNIT:${unit}`, statusPengangkatan: "Definitif",
      adaJabatanTambahanKedua: "on", jabatanTambahanRoleKode2: "JBT-02", jabatanTambahanTargetKode2: "PRODI:PRD-001", statusPengangkatan2: "Plt",
      adaJabatanTambahanKetiga: "", jabatanTambahanRoleKode3: "JBT-03", jabatanTambahanTargetKode3: `UNIT:${unit}`, statusPengangkatan3: "Pjs", // slot 3 tidak dicentang: diabaikan
    }));
    expect(jt.ok).toBe(true);
    if (jt.ok) expect(jt.data.jabatanTambahan).toEqual([
      { jabatanTambahanRoleKode: "JBT-01", unitAsalKode: unit, programStudiKode: null, statusPengangkatan: "Definitif" },
      { jabatanTambahanRoleKode: "JBT-02", unitAsalKode: null, programStudiKode: "PRD-001", statusPengangkatan: "Plt" },
    ]);

    const galat = async (ubah: Record<string, string>, pesan: string) => expect(await uraiFormResolve(prisma, formDasar({ ...dasar, ...ubah }))).toEqual({ ok: false, error: pesan });
    await galat({ kelompok: "Lain" }, "Kelompok pegawai wajib dipilih.");
    await galat({ jenisKelamin: "" }, "Jenis kelamin wajib L/P.");
    await galat({ nama: "  " }, "Nama wajib diisi.");
    await galat({ tanggalMulaiKerja: "bukan tanggal" }, "Tanggal mulai kerja (TMT) tidak valid.");
    await galat({ statusKepegawaianKode: "" }, "Status kepegawaian wajib dipilih.");
    await galat({ unitAsalKode: "" }, "Unit kerja wajib dipilih.");
    await galat({ jabatanPilihan: "" }, "Jabatan fungsional/fungsi wajib dipilih.");
    await galat({ adaJabatanTambahan: "on", jabatanTambahanRoleKode: "JBT-01" }, "Jabatan Tambahan dicentang tapi role/unit-prodi/status pengangkatan belum lengkap dipilih.");
    await galat(
      { adaJabatanTambahan: "on", jabatanTambahanRoleKode: "JBT-01", jabatanTambahanTargetKode: `UNIT:${unit}`, statusPengangkatan: "Definitif", adaJabatanTambahanKedua: "on" },
      "Jabatan Tambahan Kedua dicentang tapi role/unit-prodi/status pengangkatan belum lengkap dipilih.",
    );
    expect(await uraiFormResolve(prisma, formDasar({ kelompok: "Akademisi Luar UM", jabatanPilihan: "", unitAsalKode: unit }))).toEqual({ ok: false, error: "Kategori Akademisi Luar wajib dipilih untuk kelompok Akademisi Luar UM." });
  });
});
