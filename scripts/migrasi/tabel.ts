/**
 * Definisi tabel DOMAIN yang dimigrasikan dari MySQL KDS2 (`kds2_produksi`) ke PostgreSQL, dalam
 * urutan yang aman untuk foreign key. Dipakai bersama oleh skrip migrasi dan verifikasi.
 * Tabel master tidak termasuk (sudah dibuktikan identik lewat seed + tes paritas master).
 * Tabel yang SENGAJA tidak dimigrasi: users, sessions, cache*, jobs*, failed_jobs,
 * password_reset_tokens, migrations.
 */

/** str: teks; int: bilangan bulat; date: tanggal murni (YYYY-MM-DD); ts: waktu (instan UTC). */
export type TipeKolom = "str" | "int" | "date" | "ts";

export type Kolom = {
  /** nama kolom di MySQL KDS2 */
  my: string;
  /** nama kolom di PostgreSQL = nama field Prisma */
  pg: string;
  tipe: TipeKolom;
};

export type TabelDomain = {
  /** nama tabel MySQL */
  mysql: string;
  /** nama tabel PostgreSQL (@@map) */
  pgTabel: string;
  /** nama delegate PrismaClient */
  model: string;
  /** kolom kunci untuk paginasi (keyset) dan pencocokan baris; nama kolom PostgreSQL */
  kunci: string;
  /** apakah kunci autoincrement (sequence perlu disetel ulang) */
  serial: boolean;
  kolom: Kolom[];
  /** nilai tetap untuk kolom baru di sisi KDS Terpadu yang tidak ada di KDS2 */
  tambahan?: Record<string, unknown>;
};

const k = (my: string, pg: string, tipe: TipeKolom = "str"): Kolom => ({ my, pg, tipe });
const sama = (nama: string, tipe: TipeKolom = "str"): Kolom => k(nama, nama, tipe);

export const TABEL_DOMAIN: TabelDomain[] = [
  {
    mysql: "pegawai",
    pgTabel: "pegawai",
    model: "pegawai",
    kunci: "nip",
    serial: false,
    kolom: [sama("nip"), k("dibuat_pada", "dibuatPada", "ts")],
  },
  {
    mysql: "upload_batch",
    pgTabel: "upload_batch",
    model: "uploadBatch",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      sama("jenis"),
      k("nama_file", "namaFileAsli"),
      k("diupload_oleh", "diunggahOlehNama"),
      k("diupload_pada", "diunggahPada", "ts"),
      k("total_baris", "jumlahBarisTotal", "int"),
      k("baris_berhasil", "jumlahBerhasil", "int"),
      k("baris_gagal", "jumlahGagal", "int"),
    ],
    // KDS2 tidak punya status batch; semua batch lama sudah selesai.
    tambahan: { status: "Selesai" },
  },
  {
    mysql: "nominatif_bulanan",
    pgTabel: "nominatif_bulanan",
    model: "nominatifBulanan",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      k("nip", "pegawaiNip"),
      sama("bulan", "int"),
      sama("tahun", "int"),
      sama("nama"),
      k("jenis_kelamin", "jenisKelamin"),
      k("tanggal_lahir", "tanggalLahir", "date"),
      k("pendidikan_terakhir", "pendidikanTerakhir"),
      k("jenis_pegawai_kode", "jenisPegawaiKode"),
      k("status_kepegawaian_kode", "statusKepegawaianKode"),
      k("golongan_kode", "golonganKode"),
      k("jabatan_fungsional_dosen_kode", "jabatanFungsionalDosenKode"),
      k("jabatan_fungsional_tendik_kode", "jabatanFungsionalTendikKode"),
      k("jabatan_fungsi_umum_kode", "jabatanFungsiUmumKode"),
      k("kategori_akademisi_luar_kode", "kategoriAkademisiLuarKode"),
      k("unit_asal_kode", "unitAsalKode"),
      k("tanggal_mulai_kerja", "tanggalMulaiKerja", "date"),
      k("upload_batch_id", "uploadBatchId", "int"),
    ],
  },
  {
    mysql: "nominatif_bulanan_jabatan_tambahan",
    pgTabel: "nominatif_bulanan_jabatan_tambahan",
    model: "nominatifBulananJabatanTambahan",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      k("nominatif_bulanan_id", "nominatifBulananId", "int"),
      k("jabatan_tambahan_role_kode", "jabatanTambahanRoleKode"),
      k("unit_asal_kode", "unitAsalKode"),
      k("program_studi_kode", "programStudiKode"),
      k("status_pengangkatan", "statusPengangkatan"),
    ],
  },
  {
    mysql: "rekap_kehadiran_bulanan",
    pgTabel: "rekap_kehadiran_bulanan",
    model: "rekapKehadiranBulanan",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      sama("nip"),
      sama("bulan", "int"),
      sama("tahun", "int"),
      k("upload_batch_id", "uploadBatchId", "int"),
    ],
  },
  {
    mysql: "rekap_kehadiran_detail",
    pgTabel: "rekap_kehadiran_detail",
    model: "rekapKehadiranDetail",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      k("rekap_kehadiran_bulanan_id", "rekapKehadiranBulananId", "int"),
      k("komponen_kode", "komponenKode"),
      sama("nilai"),
    ],
  },
  {
    mysql: "upload_error_rows",
    pgTabel: "upload_error_rows",
    model: "barisGagalUpload",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      k("upload_batch_id", "uploadBatchId", "int"),
      k("nomor_baris", "nomorBaris", "int"),
      k("nip_dimaksud", "nipDimaksud"),
      k("alasan_gagal", "alasan"),
    ],
  },
  {
    mysql: "koreksi_rekap",
    pgTabel: "koreksi_rekap",
    model: "koreksiRekap",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      sama("nip"),
      sama("jenis"),
      k("dari_komponen", "dariKomponen"),
      k("ke_komponen", "keKomponen"),
      k("tanggal_mulai", "tanggalMulai", "date"),
      k("tanggal_selesai", "tanggalSelesai", "date"),
      sama("bulan", "int"),
      sama("tahun", "int"),
      k("jumlah_hari", "jumlahHari", "int"),
      k("diterapkan_batch_id", "diterapkanBatchId", "int"),
      sama("alasan"),
      sama("sumber"),
      k("dibuat_oleh", "dibuatOleh"),
      k("dibuat_pada", "dibuatPada", "ts"),
      k("dibatalkan_pada", "dibatalkanPada", "ts"),
    ],
  },
  {
    mysql: "catatan_status_pegawai",
    pgTabel: "catatan_status_pegawai",
    model: "catatanStatusPegawai",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      sama("nip"),
      sama("alasan"),
      sama("sumber"),
      k("dicatat_pada", "dicatatPada", "ts"),
    ],
  },
  {
    mysql: "audit_log",
    pgTabel: "audit_log",
    model: "auditLog",
    kunci: "id",
    serial: true,
    kolom: [
      sama("id", "int"),
      k("nama_tabel", "namaTabel"),
      k("id_record", "idRecord"),
      k("field_diubah", "fieldDiubah"),
      k("nilai_lama", "nilaiLama"),
      k("nilai_baru", "nilaiBaru"),
      k("diubah_oleh", "diubahOleh"),
      k("diubah_pada", "diubahPada", "ts"),
      sama("aksi"),
    ],
  },
];

/** Tabel PostgreSQL turunan KDS1 yang bergantung pada upload_batch: harus kosong saat migrasi. */
export const TABEL_KDS1_TERGANTUNG = ["baris_bermasalah", "catatan_perubahan_batch", "kamus_koreksi"] as const;

/** Batas parameter bind PostgreSQL per perintah = 65.535; sisakan ruang. */
export const BATAS_PARAMETER = 30_000;

export function ukuranChunk(jumlahKolom: number): number {
  return Math.max(1, Math.floor(BATAS_PARAMETER / jumlahKolom));
}

/** Memecah daftar menjadi potongan berukuran maks `n`. */
export function bagi<T>(daftar: T[], n: number): T[][] {
  if (!Number.isInteger(n) || n < 1) throw new Error("ukuran potongan harus bilangan bulat >= 1");
  const out: T[][] = [];
  for (let i = 0; i < daftar.length; i += n) out.push(daftar.slice(i, i + n));
  return out;
}
