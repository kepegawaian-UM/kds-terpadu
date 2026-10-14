/**
 * Tambah Pegawai manual: menyisipkan SATU baris ke snapshot Nominatif BULAN BERJALAN (WIB) untuk kasus mendesak (pegawai baru
 * sebelum berkas Nominatif resmi siap). Port dari NominatifBulananController::store + StoreNominatifManualRequest (KDS2).
 * Beda dari upload massal: perubahan manual ini DICATAT di audit_log (satu baris per kolom berisi), dan dibuatkan satu
 * upload_batch "semu" berjenis tambah_pegawai_manual agar jejaknya konsisten. Berkas Nominatif resmi bulan itu kemudian
 * menimpa baris ini (upload massal mengganti per NIP). Paritas: tests/paritas/tambah-pegawai.test.ts.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { parseTanggalNominatif } from "@/lib/impor/tanggal";
import { bulanTahunSekarang } from "@/lib/laporan/periode";

type Db = PrismaClient | Prisma.TransactionClient;

/** Nama kolom mengikuti formulir/KDS2 (snake_case); nilai kosong = null atau "". */
export const KOLOM_TAMBAH_PEGAWAI = [
  "nip", "nama", "jenis_kelamin", "tanggal_lahir", "pendidikan_terakhir", "jenis_pegawai_kode", "status_kepegawaian_kode",
  "golongan_kode", "jabatan_fungsional_dosen_kode", "jabatan_fungsional_tendik_kode", "jabatan_fungsi_umum_kode",
  "kategori_akademisi_luar_kode", "unit_asal_kode", "tanggal_mulai_kerja",
] as const;
export type KolomTambah = (typeof KOLOM_TAMBAH_PEGAWAI)[number];
export type InputTambahPegawai = Partial<Record<KolomTambah, string | null | undefined>>;
export type GalatTambah = Partial<Record<KolomTambah, string[]>>;

const panjang = (s: string) => Array.from(s).length;

/** TrimStrings + ConvertEmptyStringsToNull milik Laravel: teks dipangkas, kosong menjadi null. */
function bersihkan(input: InputTambahPegawai): Record<KolomTambah, string | null> {
  const h = {} as Record<KolomTambah, string | null>;
  for (const k of KOLOM_TAMBAH_PEGAWAI) {
    const v = input[k];
    const t = typeof v === "string" ? v.trim() : null;
    h[k] = t === "" ? null : t;
  }
  return h;
}

const MESSAGE_PILIH_SATU = "Pilih salah satu saja: Jabatan Fungsional Tendik ATAU Jabatan Fungsi Umum Pelaksana.";

/** Padanan StoreNominatifManualRequest::rules + withValidator. Mengembalikan galat per kolom (kosong bila valid). */
export async function validasiTambahPegawai(db: Db, mentah: InputTambahPegawai): Promise<{ data: Record<KolomTambah, string | null>; galat: GalatTambah }> {
  const d = bersihkan(mentah);
  const galat: GalatTambah = {};
  const tambah = (k: KolomTambah, pesan: string) => (galat[k] = [...(galat[k] ?? []), pesan]);

  const wajib = (k: KolomTambah, label: string) => {
    if (d[k] === null) {
      tambah(k, `${label} wajib diisi.`);
      return false;
    }
    return true;
  };
  const maks = (k: KolomTambah, label: string, n: number) => {
    if (d[k] !== null && panjang(d[k]!) > n) tambah(k, `${label} maksimal ${n} karakter.`);
  };
  const tanggal = (k: KolomTambah, label: string) => {
    if (d[k] !== null && parseTanggalNominatif(d[k]) === null) tambah(k, `${label} bukan tanggal yang valid.`);
  };
  const ada = async (k: KolomTambah, label: string, cek: (kode: string) => Promise<boolean>) => {
    if (d[k] !== null && !(await cek(d[k]!))) tambah(k, `${label} yang dipilih tidak valid.`);
  };

  if (wajib("nip", "NIP")) maks("nip", "NIP", 18);
  if (wajib("nama", "Nama")) maks("nama", "Nama", 150);
  if (wajib("jenis_kelamin", "Jenis kelamin") && d.jenis_kelamin !== "L" && d.jenis_kelamin !== "P") tambah("jenis_kelamin", "Jenis kelamin yang dipilih tidak valid.");
  tanggal("tanggal_lahir", "Tanggal lahir");
  maks("pendidikan_terakhir", "Pendidikan terakhir", 100);
  if (wajib("tanggal_mulai_kerja", "Tanggal mulai kerja")) tanggal("tanggal_mulai_kerja", "Tanggal mulai kerja");

  if (wajib("jenis_pegawai_kode", "Jenis pegawai")) await ada("jenis_pegawai_kode", "Jenis pegawai", async (k) => !!(await db.jenisPegawai.findUnique({ where: { kode: k } })));
  if (wajib("status_kepegawaian_kode", "Status kepegawaian")) await ada("status_kepegawaian_kode", "Status kepegawaian", async (k) => !!(await db.statusKepegawaian.findUnique({ where: { kode: k } })));
  if (wajib("unit_asal_kode", "Unit kerja")) await ada("unit_asal_kode", "Unit kerja", async (k) => !!(await db.unitAsal.findUnique({ where: { kode: k } })));
  await ada("golongan_kode", "Golongan", async (k) => !!(await db.golongan.findUnique({ where: { kode: k } })));
  await ada("jabatan_fungsional_dosen_kode", "Jabatan fungsional dosen", async (k) => !!(await db.jabatanFungsionalDosen.findUnique({ where: { kode: k } })));
  await ada("jabatan_fungsional_tendik_kode", "Jabatan fungsional tendik", async (k) => !!(await db.jabatanFungsionalTendik.findUnique({ where: { kode: k } })));
  await ada("jabatan_fungsi_umum_kode", "Jabatan fungsi umum", async (k) => !!(await db.jabatanFungsiUmumPelaksana.findUnique({ where: { kode: k } })));
  await ada("kategori_akademisi_luar_kode", "Kategori akademisi luar", async (k) => !!(await db.kategoriAkademisiLuar.findUnique({ where: { kode: k } })));

  // aturan silang (withValidator) - pesan sama dengan KDS2
  const jenis = d.jenis_pegawai_kode;
  if (jenis === "DSN" && d.jabatan_fungsional_dosen_kode === null) tambah("jabatan_fungsional_dosen_kode", "Wajib diisi untuk pegawai jenis Dosen.");
  if (jenis === "TDK" && (d.jabatan_fungsional_tendik_kode !== null) === (d.jabatan_fungsi_umum_kode !== null)) {
    tambah("jabatan_fungsional_tendik_kode", MESSAGE_PILIH_SATU);
    tambah("jabatan_fungsi_umum_kode", MESSAGE_PILIH_SATU);
  }
  if (jenis === "AKL" && d.kategori_akademisi_luar_kode === null) tambah("kategori_akademisi_luar_kode", "Wajib diisi untuk pegawai jenis Akademisi Luar UM.");
  if (d.status_kepegawaian_kode !== null) {
    const status = await db.statusKepegawaian.findUnique({ where: { kode: d.status_kepegawaian_kode } });
    if (status && status.kategori === "ASN" && d.golongan_kode === null) tambah("golongan_kode", "Wajib diisi untuk status kepegawaian kategori ASN.");
  }
  return { data: d, galat };
}

export type HasilTambah = { ok: true; id: number; bulan: number; tahun: number } | { ok: false; galat: GalatTambah };

const teksTanggal = (iso: string) => `${iso} 00:00:00`; // atribut berkas date di KDS2 di-stringify "Y-m-d H:i:s"

/**
 * Menambah pegawai ke Nominatif bulan berjalan. Satu transaksi: pegawai (bila baru), upload_batch semu, baris Nominatif,
 * dan jejak audit INSERT per kolom berisi. `sekarang` dapat disuntikkan untuk tes.
 */
export async function tambahPegawaiManual(prisma: PrismaClient, input: InputTambahPegawai, pengguna: { id: string | null; nama: string }, sekarang = new Date()): Promise<HasilTambah> {
  const { data: d, galat } = await validasiTambahPegawai(prisma, input);
  if (Object.keys(galat).length > 0) return { ok: false, galat };

  // kolom yang tidak berlaku bagi jenis pegawai itu dikosongkan, seperti controller KDS2
  const jenis = d.jenis_pegawai_kode;
  if (jenis !== "DSN") d.jabatan_fungsional_dosen_kode = null;
  if (jenis !== "TDK") {
    d.jabatan_fungsional_tendik_kode = null;
    d.jabatan_fungsi_umum_kode = null;
  }
  if (jenis !== "AKL") d.kategori_akademisi_luar_kode = null;

  const [bulan, tahun] = bulanTahunSekarang(sekarang);
  const tgl = (s: string | null) => (s === null ? null : new Date(`${parseTanggalNominatif(s)}T00:00:00.000Z`));
  const iso = (s: string | null) => (s === null ? null : parseTanggalNominatif(s));

  return prisma.$transaction(async (tx): Promise<HasilTambah> => {
    // KDS2 gagal dengan galat basis data (500) bila (nip, bulan, tahun) sudah ada; di sini menjadi galat kolom NIP.
    if (await tx.nominatifBulanan.findUnique({ where: { pegawaiNip_bulan_tahun: { pegawaiNip: d.nip!, bulan, tahun } }, select: { id: true } })) {
      return { ok: false, galat: { nip: ["NIP ini sudah ada di Nominatif bulan berjalan. Ubah datanya lewat upload Nominatif."] } };
    }
    await tx.pegawai.createMany({ data: [{ nip: d.nip! }], skipDuplicates: true });
    const batch = await tx.uploadBatch.create({
      data: {
        jenis: "tambah_pegawai_manual", bulan, tahun, namaFileAsli: "(manual - tombol Tambah Pegawai)", status: "Selesai",
        jumlahBarisTotal: 1, jumlahBerhasil: 1, jumlahGagal: 0, diunggahOlehNama: pengguna.nama, diunggahOlehId: pengguna.id,
      },
    });
    const baris = await tx.nominatifBulanan.create({
      data: {
        pegawaiNip: d.nip!, bulan, tahun, nama: d.nama!, jenisKelamin: d.jenis_kelamin!, tanggalLahir: tgl(d.tanggal_lahir), pendidikanTerakhir: d.pendidikan_terakhir,
        jenisPegawaiKode: d.jenis_pegawai_kode!, statusKepegawaianKode: d.status_kepegawaian_kode!, golonganKode: d.golongan_kode,
        jabatanFungsionalDosenKode: d.jabatan_fungsional_dosen_kode, jabatanFungsionalTendikKode: d.jabatan_fungsional_tendik_kode,
        jabatanFungsiUmumKode: d.jabatan_fungsi_umum_kode, kategoriAkademisiLuarKode: d.kategori_akademisi_luar_kode, unitAsalKode: d.unit_asal_kode!,
        tanggalMulaiKerja: tgl(d.tanggal_mulai_kerja)!, uploadBatchId: batch.id,
      },
    });

    // audit_log: satu baris INSERT per kolom berisi, urutan kolom seperti KDS2 (urutan aturan, lalu bulan, tahun, upload_batch_id)
    const lahir = iso(d.tanggal_lahir);
    const tmt = iso(d.tanggal_mulai_kerja)!;
    const kolom: [string, string | null][] = [
      ["nip", d.nip], ["nama", d.nama], ["jenis_kelamin", d.jenis_kelamin], ["tanggal_lahir", lahir === null ? null : teksTanggal(lahir)],
      ["pendidikan_terakhir", d.pendidikan_terakhir], ["jenis_pegawai_kode", d.jenis_pegawai_kode],
      ["status_kepegawaian_kode", d.status_kepegawaian_kode], ["golongan_kode", d.golongan_kode],
      ["jabatan_fungsional_dosen_kode", d.jabatan_fungsional_dosen_kode], ["jabatan_fungsional_tendik_kode", d.jabatan_fungsional_tendik_kode],
      ["jabatan_fungsi_umum_kode", d.jabatan_fungsi_umum_kode], ["kategori_akademisi_luar_kode", d.kategori_akademisi_luar_kode],
      ["unit_asal_kode", d.unit_asal_kode], ["tanggal_mulai_kerja", teksTanggal(tmt)],
      ["bulan", String(bulan)], ["tahun", String(tahun)], ["upload_batch_id", String(batch.id)],
    ];
    for (const [field, nilai] of kolom) {
      if (nilai === null) continue;
      await tx.auditLog.create({ data: { namaTabel: "nominatif_bulanan", idRecord: String(baris.id), fieldDiubah: field, nilaiLama: null, nilaiBaru: nilai, diubahOleh: pengguna.nama, diubahPada: sekarang, aksi: "INSERT" } });
    }
    return { ok: true, id: baris.id, bulan, tahun };
  }, { timeout: 30_000 });
}
