/**
 * PARITAS Tambah Pegawai manual (F4.3c): NominatifBulananController::store + StoreNominatifManualRequest KDS2 ASLI (oracle PHP di
 * SQLite memori, master diganti isi master kds_test) dan layanan baru (kds_test) menerima masukan yang SAMA. Dibandingkan: kolom
 * mana yang ditolak (+ pesan aturan silang yang dikarang KDS2, persis), baris Nominatif tersimpan, upload_batch semu, pegawai, dan
 * audit_log baris demi baris. Pesan aturan dasar (required/max/exists) sengaja berbahasa Indonesia, tidak dibandingkan (KDS2: Inggris).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { type InputTambahPegawai, KOLOM_TAMBAH_PEGAWAI, tambahPegawaiManual } from "@/lib/nominatif/tambahManual";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { type KeadaanLengkap, muatKeadaan } from "../support/keadaan";
import { jalankanOracleTambahPegawai, oracleImporTersedia } from "../support/oracleImpor";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleImporTersedia());

type Kasus = { id: string; keadaan?: KeadaanLengkap; input: InputTambahPegawai; sekarang?: string };
const nip = (n: number) => `19800101200501${String(n).padStart(4, "0")}`;

const MASTER_TABEL: [string, string][] = [
  ["mst_jenis_pegawai", "jenisPegawai"], ["mst_status_kepegawaian", "statusKepegawaian"], ["mst_golongan", "golongan"], ["mst_jabatan_fungsional_dosen", "jabatanFungsionalDosen"],
  ["mst_jabatan_fungsional_tendik", "jabatanFungsionalTendik"], ["mst_jabatan_fungsi_umum_pelaksana", "jabatanFungsiUmumPelaksana"],
  ["mst_kategori_akademisi_luar", "kategoriAkademisiLuar"], ["mst_unit_asal", "unitAsal"], ["mst_program_studi", "programStudi"], ["mst_jabatan_tambahan_role", "jabatanTambahanRole"],
];

/** Padanan TrimStrings + ConvertEmptyStringsToNull (middleware HTTP Laravel) untuk masukan ke oracle. */
const bersih = (i: InputTambahPegawai) =>
  Object.fromEntries(KOLOM_TAMBAH_PEGAWAI.map((k) => { const v = typeof i[k] === "string" ? (i[k] as string).trim() : null; return [k, v === "" ? null : v]; }));

const KHUSUS = /^(Wajib diisi untuk|Pilih salah satu saja)/;
const ringkasGalat = (g: Record<string, string[]> | null | undefined) =>
  g ? Object.fromEntries(Object.keys(g).sort().map((k) => [k, g[k].filter((m) => KHUSUS.test(m))])) : null;

describe.skipIf(!ada)("Paritas Tambah Pegawai manual terhadap controller KDS2 asli", () => {
  const prisma = new PrismaClient();
  let kasus: Kasus[] = [];
  let oracle: Record<string, { galat: Record<string, string[]> | null; pengecualian: string | null; pegawai: string[]; nominatif: Record<string, unknown>[]; batch: unknown[]; audit: (string | null)[][] }>;

  beforeAll(async () => {
    const [dosen, tendik, umum, akl, unit, status, jenis] = await Promise.all([
      prisma.jabatanFungsionalDosen.findMany({ orderBy: { kode: "asc" } }), prisma.jabatanFungsionalTendik.findMany({ orderBy: { kode: "asc" } }),
      prisma.jabatanFungsiUmumPelaksana.findMany({ orderBy: { kode: "asc" } }), prisma.kategoriAkademisiLuar.findMany({ orderBy: { kode: "asc" } }),
      prisma.unitAsal.findMany({ orderBy: { kode: "asc" } }), prisma.statusKepegawaian.findMany({ orderBy: { kode: "asc" } }), prisma.jenisPegawai.findMany({ orderBy: { kode: "asc" } }),
    ]);
    const asn = status.find((s) => s.kategori === "ASN")!;
    const nonAsn = status.find((s) => s.kategori !== "ASN")!;
    const dasar: InputTambahPegawai = {
      nip: nip(1), nama: "Nama Uji", jenis_kelamin: "L", tanggal_lahir: "1990-05-17", pendidikan_terakhir: "S1", jenis_pegawai_kode: "DSN",
      status_kepegawaian_kode: asn.kode, golongan_kode: "III/a", jabatan_fungsional_dosen_kode: dosen[0].kode, unit_asal_kode: unit[0].kode, tanggal_mulai_kerja: "2018-03-04",
    };
    const K = (id: string, ubah: InputTambahPegawai, ekstra: Partial<Kasus> = {}): Kasus => ({ id, input: { ...dasar, ...ubah }, ...ekstra });
    kasus = [
      K("dosen-lengkap", {}),
      K("dosen-kolom-tak-berlaku-dikosongkan", { jabatan_fungsional_tendik_kode: tendik[0].kode, jabatan_fungsi_umum_kode: umum[0].kode, kategori_akademisi_luar_kode: akl[0].kode }),
      K("tendik-fungsional", { jenis_pegawai_kode: "TDK", jabatan_fungsional_dosen_kode: null, jabatan_fungsional_tendik_kode: tendik[0].kode }),
      K("tendik-fungsi-umum", { jenis_pegawai_kode: "TDK", jabatan_fungsional_dosen_kode: dosen[0].kode, jabatan_fungsi_umum_kode: umum[0].kode }),
      K("tendik-keduanya-atau-tidak-ada", { jenis_pegawai_kode: "TDK", jabatan_fungsional_dosen_kode: null, jabatan_fungsional_tendik_kode: tendik[0].kode, jabatan_fungsi_umum_kode: umum[0].kode }),
      K("tendik-tidak-ada", { jenis_pegawai_kode: "TDK", jabatan_fungsional_dosen_kode: null }),
      K("akl", { jenis_pegawai_kode: "AKL", status_kepegawaian_kode: nonAsn.kode, golongan_kode: null, jabatan_fungsional_dosen_kode: null, kategori_akademisi_luar_kode: akl[0].kode }),
      K("akl-tanpa-kategori", { jenis_pegawai_kode: "AKL", status_kepegawaian_kode: nonAsn.kode, golongan_kode: null, jabatan_fungsional_dosen_kode: null }),
      K("non-asn-golongan-opsional", { status_kepegawaian_kode: nonAsn.kode, golongan_kode: "III/a" }),
      K("non-asn-tanpa-golongan", { status_kepegawaian_kode: nonAsn.kode, golongan_kode: null }),
      K("asn-tanpa-golongan", { golongan_kode: null }),
      K("opsional-kosong", { tanggal_lahir: null, pendidikan_terakhir: "" }),
      K("dosen-tanpa-jabatan", { jabatan_fungsional_dosen_kode: null }),
      K("wajib-kosong", { nip: "", nama: null, jenis_kelamin: "", jenis_pegawai_kode: "", status_kepegawaian_kode: null, unit_asal_kode: "", tanggal_mulai_kerja: "" }),
      K("jenis-kelamin-salah", { jenis_kelamin: "l" }),
      K("terlalu-panjang", { nip: "1".repeat(19), nama: "N".repeat(151), pendidikan_terakhir: "P".repeat(101) }),
      K("batas-panjang-pas", { nip: "1".repeat(18), nama: "N".repeat(150), pendidikan_terakhir: "P".repeat(100) }),
      K("tanggal-tidak-valid", { tanggal_lahir: "bukan tanggal", tanggal_mulai_kerja: "31-31-2018" }),
      K("kode-master-tidak-ada", { jenis_pegawai_kode: "ZZZ", status_kepegawaian_kode: "ZZZ", golongan_kode: "ZZZ", jabatan_fungsional_dosen_kode: "ZZZ", jabatan_fungsional_tendik_kode: "ZZZ", jabatan_fungsi_umum_kode: "ZZZ", kategori_akademisi_luar_kode: "ZZZ", unit_asal_kode: "ZZZ" }),
      K("pegawai-sudah-ada-bulan-lain", { nip: nip(5) }, { keadaan: { nominatif: [{ nip: nip(5), bulan: 9, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" }] } }),
      K("pegawai-ada-tanpa-nominatif", { nip: nip(6) }, { keadaan: { pegawai: [nip(6)] } }),
      K("akhir-tahun-wib", {}, { sekarang: "2026-12-31 23:30:00" }),
      K("awal-tahun-wib", {}, { sekarang: "2027-01-01 00:10:00" }),
      K("awal-bulan-wib-masih-bulan-lalu-di-utc", {}, { sekarang: "2026-10-01 03:00:00" }),
      K("akhir-bulan-wib", {}, { sekarang: "2026-02-28 23:59:59" }),
    ];
    // acak bersemi tetap: campuran valid dan salah
    let s = 20261013;
    const acak = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pilih = <T,>(a: T[]): T => a[Math.floor(acak() * a.length)];
    for (let i = 0; i < 40; i++) {
      const j = pilih(["DSN", "TDK", "AKL", "XXX", ""]);
      kasus.push(K(`acak-${i}`, {
        nip: pilih([nip(100 + i), "", "1".repeat(19)]), nama: pilih(["Nama", "", null as unknown as string]), jenis_kelamin: pilih(["L", "P", "X", ""]),
        tanggal_lahir: pilih(["1990-01-01", "", "x", null as unknown as string]), jenis_pegawai_kode: j, status_kepegawaian_kode: pilih([asn.kode, nonAsn.kode, "ZZZ", ""]),
        golongan_kode: pilih(["III/a", "", "ZZZ", null as unknown as string]), jabatan_fungsional_dosen_kode: pilih([dosen[0].kode, "", "ZZZ", null as unknown as string]),
        jabatan_fungsional_tendik_kode: pilih([tendik[0].kode, "", null as unknown as string]), jabatan_fungsi_umum_kode: pilih([umum[0].kode, "", null as unknown as string]),
        kategori_akademisi_luar_kode: pilih([akl[0].kode, "", null as unknown as string]), unit_asal_kode: pilih([unit[0].kode, unit[1].kode, "ZZZ", ""]),
        tanggal_mulai_kerja: pilih(["2018-01-01", "", "x"]),
      }));
    }
    void jenis;

    const master: Record<string, unknown[]> = {};
    for (const [tabel, model] of MASTER_TABEL) {
      master[tabel] = await (prisma as unknown as Record<string, { findMany(a: unknown): Promise<unknown[]> }>)[model].findMany({ orderBy: { kode: "asc" } });
    }
    oracle = (await jalankanOracleTambahPegawai({
      master,
      kasus: kasus.map((k) => ({ id: k.id, keadaan: k.keadaan ?? {}, pengguna: "Admin Uji", sekarang: k.sekarang ?? "2026-10-13 10:00:00", input: bersih(k.input) })),
    })) as typeof oracle;
  }, 280_000);

  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  const idKasus = () => [
    "dosen-lengkap", "dosen-kolom-tak-berlaku-dikosongkan", "tendik-fungsional", "tendik-fungsi-umum", "tendik-keduanya-atau-tidak-ada", "tendik-tidak-ada", "akl", "akl-tanpa-kategori",
    "non-asn-golongan-opsional", "non-asn-tanpa-golongan", "asn-tanpa-golongan", "opsional-kosong", "dosen-tanpa-jabatan", "wajib-kosong", "jenis-kelamin-salah", "terlalu-panjang",
    "batas-panjang-pas", "tanggal-tidak-valid", "kode-master-tidak-ada", "pegawai-sudah-ada-bulan-lain", "pegawai-ada-tanpa-nominatif", "akhir-tahun-wib", "awal-tahun-wib",
    "awal-bulan-wib-masih-bulan-lalu-di-utc", "akhir-bulan-wib", ...Array.from({ length: 40 }, (_, i) => `acak-${i}`),
  ];

  for (const id of idKasus()) {
    it(id, async () => {
      const k = kasus.find((x) => x.id === id)!;
      const harapan = oracle[id];
      expect(harapan.pengecualian, `oracle: ${harapan.pengecualian}`).toBeNull();

      await kosongkanDomain(prisma);
      await prisma.auditLog.deleteMany();
      await muatKeadaan(prisma, k.keadaan ?? {});
      const sekarang = new Date(`${(k.sekarang ?? "2026-10-13 10:00:00").replace(" ", "T")}+07:00`);
      const hasil = await tambahPegawaiManual(prisma, k.input, { id: null, nama: "Admin Uji" }, sekarang);

      // 1. kolom yang ditolak (+ pesan aturan silang KDS2)
      expect(ringkasGalat(hasil.ok ? null : (hasil.galat as Record<string, string[]>))).toEqual(ringkasGalat(harapan.galat));
      if (!hasil.ok) {
        expect(await prisma.nominatifBulanan.count()).toBe((k.keadaan?.nominatif ?? []).length);
        expect(harapan.nominatif.length).toBe((k.keadaan?.nominatif ?? []).length);
        return;
      }

      // 2. keadaan tersimpan
      const tgl = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
      const nominatif = (await prisma.nominatifBulanan.findMany({ orderBy: { id: "asc" } })).map((n) => ({
        id: n.id, nip: n.pegawaiNip, bulan: n.bulan, tahun: n.tahun, nama: n.nama, jenis_kelamin: n.jenisKelamin, tanggal_lahir: tgl(n.tanggalLahir),
        pendidikan_terakhir: n.pendidikanTerakhir, jenis_pegawai_kode: n.jenisPegawaiKode, status_kepegawaian_kode: n.statusKepegawaianKode,
        golongan_kode: n.golonganKode, jabatan_fungsional_dosen_kode: n.jabatanFungsionalDosenKode, jabatan_fungsional_tendik_kode: n.jabatanFungsionalTendikKode,
        jabatan_fungsi_umum_kode: n.jabatanFungsiUmumKode, kategori_akademisi_luar_kode: n.kategoriAkademisiLuarKode, unit_asal_kode: n.unitAsalKode,
        tanggal_mulai_kerja: tgl(n.tanggalMulaiKerja), upload_batch_id: n.uploadBatchId,
      }));
      // KDS2 masih punya kolom agama (kosong karena tidak dikirim); aplikasi ini sengaja tidak menyimpannya: dibuang dari pembanding.
      const seragam = (r0: Record<string, unknown>) => { const { agama: _a, ...r } = r0; void _a; return { ...r, tanggal_lahir: r.tanggal_lahir ? String(r.tanggal_lahir).slice(0, 10) : null, tanggal_mulai_kerja: String(r.tanggal_mulai_kerja).slice(0, 10) }; };
      expect(nominatif).toEqual(harapan.nominatif.map(seragam));

      expect((await prisma.pegawai.findMany({ orderBy: { nip: "asc" } })).map((p) => p.nip)).toEqual(harapan.pegawai);

      const batch = (await prisma.uploadBatch.findMany({ where: { jenis: "tambah_pegawai_manual" }, orderBy: { id: "asc" } })).map((b) => ({
        jenis: b.jenis, nama_file: b.namaFileAsli, diupload_oleh: b.diunggahOlehNama, total_baris: b.jumlahBarisTotal, baris_berhasil: b.jumlahBerhasil, baris_gagal: b.jumlahGagal,
      }));
      expect(batch).toEqual(harapan.batch);

      // 3. audit_log
      const audit = (await prisma.auditLog.findMany({ orderBy: { id: "asc" } })).map((a) => [a.namaTabel, a.idRecord, a.fieldDiubah, a.nilaiLama, a.nilaiBaru, a.diubahOleh, a.aksi]);
      expect(audit).toEqual(harapan.audit);
    }, 60_000);
  }

  it("katalog bermakna: ada kasus berhasil dan ditolak, dengan jejak audit", () => {
    const berhasil = idKasus().filter((id) => oracle[id].nominatif.length > ((kasus.find((k) => k.id === id)!.keadaan?.nominatif ?? []).length));
    expect(berhasil.length).toBeGreaterThan(8);
    expect(idKasus().filter((id) => oracle[id].galat).length).toBeGreaterThan(15);
    expect(oracle["dosen-lengkap"].audit.length).toBe(14); // 15 di KDS2 dikurangi baris agama (tidak ada lagi)
  });
});
