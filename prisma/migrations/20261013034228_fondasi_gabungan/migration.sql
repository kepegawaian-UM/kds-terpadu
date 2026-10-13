-- CreateTable
CREATE TABLE "mst_jenis_pegawai" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "keterangan" TEXT,

    CONSTRAINT "mst_jenis_pegawai_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_status_kepegawaian" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,

    CONSTRAINT "mst_status_kepegawaian_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_golongan" (
    "kode" TEXT NOT NULL,

    CONSTRAINT "mst_golongan_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_jabatan_fungsional_dosen" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "urutanJenjang" INTEGER NOT NULL,

    CONSTRAINT "mst_jabatan_fungsional_dosen_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_jabatan_fungsional_tendik" (
    "kode" TEXT NOT NULL,
    "jabatanPokok" TEXT NOT NULL,
    "jenjang" TEXT NOT NULL,

    CONSTRAINT "mst_jabatan_fungsional_tendik_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_jabatan_fungsi_umum_pelaksana" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,

    CONSTRAINT "mst_jabatan_fungsi_umum_pelaksana_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_jabatan_tambahan_role" (
    "kode" TEXT NOT NULL,
    "namaRole" TEXT NOT NULL,
    "berlakuUntuk" TEXT NOT NULL,

    CONSTRAINT "mst_jabatan_tambahan_role_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_unit_induk" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,

    CONSTRAINT "mst_unit_induk_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_unit_asal" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "unitIndukKode" TEXT NOT NULL,

    CONSTRAINT "mst_unit_asal_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_program_studi" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "jenjang" TEXT NOT NULL,
    "unitAsalKode" TEXT NOT NULL,
    "statusValidasi" TEXT NOT NULL,

    CONSTRAINT "mst_program_studi_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_kategori_akademisi_luar" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "masukRekapKehadiran" BOOLEAN NOT NULL,

    CONSTRAINT "mst_kategori_akademisi_luar_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "mst_komponen_kehadiran" (
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tipeNilai" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,

    CONSTRAINT "mst_komponen_kehadiran_pkey" PRIMARY KEY ("kode")
);

-- CreateTable
CREATE TABLE "pegawai" (
    "nip" TEXT NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pegawai_pkey" PRIMARY KEY ("nip")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_batch" (
    "id" SERIAL NOT NULL,
    "jenis" TEXT NOT NULL DEFAULT 'standarisasi_nominatif',
    "bulan" INTEGER,
    "tahun" INTEGER,
    "namaFileAsli" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Diproses',
    "jumlahBarisTotal" INTEGER NOT NULL DEFAULT 0,
    "jumlahBerhasil" INTEGER NOT NULL DEFAULT 0,
    "jumlahGagal" INTEGER NOT NULL DEFAULT 0,
    "jumlahPerluReview" INTEGER NOT NULL DEFAULT 0,
    "petaKolomTerdeteksi" JSONB,
    "diunggahOlehNama" TEXT NOT NULL,
    "diunggahOlehId" TEXT,
    "diunggahPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_error_rows" (
    "id" SERIAL NOT NULL,
    "uploadBatchId" INTEGER NOT NULL,
    "nomorBaris" INTEGER NOT NULL,
    "nipDimaksud" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,

    CONSTRAINT "upload_error_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baris_bermasalah" (
    "id" TEXT NOT NULL,
    "uploadBatchId" INTEGER NOT NULL,
    "nip" TEXT NOT NULL,
    "dataMentah" JSONB NOT NULL,
    "alasanUtama" TEXT NOT NULL,
    "detailAlasan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Menunggu',
    "resolvedFields" JSONB,
    "diselesaikanOlehId" TEXT,
    "diselesaikanPada" TIMESTAMP(3),
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baris_bermasalah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kamus_koreksi" (
    "id" TEXT NOT NULL,
    "jenisField" TEXT NOT NULL,
    "kunciMentah" TEXT NOT NULL,
    "nilaiResolusi" TEXT NOT NULL,
    "catatan" TEXT,
    "dibuatOlehId" TEXT NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kamus_koreksi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catatan_perubahan_batch" (
    "id" TEXT NOT NULL,
    "uploadBatchAId" INTEGER,
    "uploadBatchBId" INTEGER,
    "kategori" TEXT NOT NULL,
    "nipUtama" TEXT NOT NULL,
    "nipTerkait" JSONB,
    "nama" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "dibuatOlehId" TEXT NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbaruiPada" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catatan_perubahan_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "namaTabel" TEXT NOT NULL,
    "idRecord" TEXT NOT NULL,
    "fieldDiubah" TEXT NOT NULL,
    "nilaiLama" TEXT,
    "nilaiBaru" TEXT,
    "diubahOleh" TEXT NOT NULL,
    "diubahPada" TIMESTAMP(3) NOT NULL,
    "aksi" TEXT NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_chunk" (
    "uploadId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_chunk_pkey" PRIMARY KEY ("uploadId","chunkIndex")
);

-- CreateTable
CREATE TABLE "nominatif_bulanan" (
    "id" SERIAL NOT NULL,
    "pegawaiNip" TEXT NOT NULL,
    "bulan" INTEGER NOT NULL,
    "tahun" INTEGER NOT NULL,
    "nama" TEXT NOT NULL,
    "jenisKelamin" TEXT NOT NULL,
    "tanggalLahir" DATE,
    "pendidikanTerakhir" TEXT,
    "agama" TEXT,
    "jenisPegawaiKode" TEXT NOT NULL,
    "statusKepegawaianKode" TEXT NOT NULL,
    "golonganKode" TEXT,
    "jabatanFungsionalDosenKode" TEXT,
    "jabatanFungsionalTendikKode" TEXT,
    "jabatanFungsiUmumKode" TEXT,
    "kategoriAkademisiLuarKode" TEXT,
    "unitAsalKode" TEXT NOT NULL,
    "tanggalMulaiKerja" DATE NOT NULL,
    "uploadBatchId" INTEGER NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nominatif_bulanan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominatif_bulanan_jabatan_tambahan" (
    "id" SERIAL NOT NULL,
    "nominatifBulananId" INTEGER NOT NULL,
    "jabatanTambahanRoleKode" TEXT NOT NULL,
    "unitAsalKode" TEXT,
    "programStudiKode" TEXT,
    "statusPengangkatan" TEXT NOT NULL,

    CONSTRAINT "nominatif_bulanan_jabatan_tambahan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rekap_kehadiran_bulanan" (
    "id" SERIAL NOT NULL,
    "nip" TEXT NOT NULL,
    "bulan" INTEGER NOT NULL,
    "tahun" INTEGER NOT NULL,
    "uploadBatchId" INTEGER NOT NULL,

    CONSTRAINT "rekap_kehadiran_bulanan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rekap_kehadiran_detail" (
    "id" SERIAL NOT NULL,
    "rekapKehadiranBulananId" INTEGER NOT NULL,
    "komponenKode" TEXT NOT NULL,
    "nilai" TEXT NOT NULL,

    CONSTRAINT "rekap_kehadiran_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "koreksi_rekap" (
    "id" SERIAL NOT NULL,
    "nip" TEXT NOT NULL,
    "jenis" TEXT NOT NULL DEFAULT 'periode',
    "dariKomponen" TEXT NOT NULL,
    "keKomponen" TEXT,
    "tanggalMulai" DATE NOT NULL,
    "tanggalSelesai" DATE,
    "bulan" INTEGER,
    "tahun" INTEGER,
    "jumlahHari" INTEGER,
    "diterapkanBatchId" INTEGER,
    "alasan" TEXT NOT NULL,
    "sumber" TEXT,
    "dibuatOleh" TEXT NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL,
    "dibatalkanPada" TIMESTAMP(3),

    CONSTRAINT "koreksi_rekap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catatan_status_pegawai" (
    "id" SERIAL NOT NULL,
    "nip" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "sumber" TEXT,
    "dicatatPada" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catatan_status_pegawai_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "upload_batch_jenis_tahun_bulan_idx" ON "upload_batch"("jenis", "tahun", "bulan");

-- CreateIndex
CREATE INDEX "upload_error_rows_uploadBatchId_idx" ON "upload_error_rows"("uploadBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "kamus_koreksi_jenisField_kunciMentah_key" ON "kamus_koreksi"("jenisField", "kunciMentah");

-- CreateIndex
CREATE UNIQUE INDEX "catatan_perubahan_batch_kategori_nipUtama_key" ON "catatan_perubahan_batch"("kategori", "nipUtama");

-- CreateIndex
CREATE INDEX "audit_log_namaTabel_idRecord_idx" ON "audit_log"("namaTabel", "idRecord");

-- CreateIndex
CREATE INDEX "nominatif_bulanan_tahun_bulan_idx" ON "nominatif_bulanan"("tahun", "bulan");

-- CreateIndex
CREATE UNIQUE INDEX "nominatif_bulanan_pegawaiNip_bulan_tahun_key" ON "nominatif_bulanan"("pegawaiNip", "bulan", "tahun");

-- CreateIndex
CREATE INDEX "nominatif_bulanan_jabatan_tambahan_nominatifBulananId_idx" ON "nominatif_bulanan_jabatan_tambahan"("nominatifBulananId");

-- CreateIndex
CREATE INDEX "rekap_kehadiran_bulanan_tahun_bulan_idx" ON "rekap_kehadiran_bulanan"("tahun", "bulan");

-- CreateIndex
CREATE UNIQUE INDEX "rekap_kehadiran_bulanan_nip_bulan_tahun_key" ON "rekap_kehadiran_bulanan"("nip", "bulan", "tahun");

-- CreateIndex
CREATE INDEX "rekap_kehadiran_detail_rekapKehadiranBulananId_komponenKode_idx" ON "rekap_kehadiran_detail"("rekapKehadiranBulananId", "komponenKode", "nilai");

-- CreateIndex
CREATE INDEX "koreksi_rekap_nip_idx" ON "koreksi_rekap"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "catatan_status_pegawai_nip_key" ON "catatan_status_pegawai"("nip");

-- AddForeignKey
ALTER TABLE "mst_unit_asal" ADD CONSTRAINT "mst_unit_asal_unitIndukKode_fkey" FOREIGN KEY ("unitIndukKode") REFERENCES "mst_unit_induk"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mst_program_studi" ADD CONSTRAINT "mst_program_studi_unitAsalKode_fkey" FOREIGN KEY ("unitAsalKode") REFERENCES "mst_unit_asal"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_diunggahOlehId_fkey" FOREIGN KEY ("diunggahOlehId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_error_rows" ADD CONSTRAINT "upload_error_rows_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "upload_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baris_bermasalah" ADD CONSTRAINT "baris_bermasalah_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "upload_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baris_bermasalah" ADD CONSTRAINT "baris_bermasalah_diselesaikanOlehId_fkey" FOREIGN KEY ("diselesaikanOlehId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kamus_koreksi" ADD CONSTRAINT "kamus_koreksi_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catatan_perubahan_batch" ADD CONSTRAINT "catatan_perubahan_batch_uploadBatchAId_fkey" FOREIGN KEY ("uploadBatchAId") REFERENCES "upload_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catatan_perubahan_batch" ADD CONSTRAINT "catatan_perubahan_batch_uploadBatchBId_fkey" FOREIGN KEY ("uploadBatchBId") REFERENCES "upload_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catatan_perubahan_batch" ADD CONSTRAINT "catatan_perubahan_batch_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_pegawaiNip_fkey" FOREIGN KEY ("pegawaiNip") REFERENCES "pegawai"("nip") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_jenisPegawaiKode_fkey" FOREIGN KEY ("jenisPegawaiKode") REFERENCES "mst_jenis_pegawai"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_statusKepegawaianKode_fkey" FOREIGN KEY ("statusKepegawaianKode") REFERENCES "mst_status_kepegawaian"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_golonganKode_fkey" FOREIGN KEY ("golonganKode") REFERENCES "mst_golongan"("kode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_jabatanFungsionalDosenKode_fkey" FOREIGN KEY ("jabatanFungsionalDosenKode") REFERENCES "mst_jabatan_fungsional_dosen"("kode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_jabatanFungsionalTendikKode_fkey" FOREIGN KEY ("jabatanFungsionalTendikKode") REFERENCES "mst_jabatan_fungsional_tendik"("kode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_jabatanFungsiUmumKode_fkey" FOREIGN KEY ("jabatanFungsiUmumKode") REFERENCES "mst_jabatan_fungsi_umum_pelaksana"("kode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_kategoriAkademisiLuarKode_fkey" FOREIGN KEY ("kategoriAkademisiLuarKode") REFERENCES "mst_kategori_akademisi_luar"("kode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_unitAsalKode_fkey" FOREIGN KEY ("unitAsalKode") REFERENCES "mst_unit_asal"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan" ADD CONSTRAINT "nominatif_bulanan_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "upload_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan_jabatan_tambahan" ADD CONSTRAINT "nominatif_bulanan_jabatan_tambahan_nominatifBulananId_fkey" FOREIGN KEY ("nominatifBulananId") REFERENCES "nominatif_bulanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan_jabatan_tambahan" ADD CONSTRAINT "nominatif_bulanan_jabatan_tambahan_jabatanTambahanRoleKode_fkey" FOREIGN KEY ("jabatanTambahanRoleKode") REFERENCES "mst_jabatan_tambahan_role"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan_jabatan_tambahan" ADD CONSTRAINT "nominatif_bulanan_jabatan_tambahan_unitAsalKode_fkey" FOREIGN KEY ("unitAsalKode") REFERENCES "mst_unit_asal"("kode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominatif_bulanan_jabatan_tambahan" ADD CONSTRAINT "nominatif_bulanan_jabatan_tambahan_programStudiKode_fkey" FOREIGN KEY ("programStudiKode") REFERENCES "mst_program_studi"("kode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rekap_kehadiran_bulanan" ADD CONSTRAINT "rekap_kehadiran_bulanan_nip_fkey" FOREIGN KEY ("nip") REFERENCES "pegawai"("nip") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rekap_kehadiran_bulanan" ADD CONSTRAINT "rekap_kehadiran_bulanan_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "upload_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rekap_kehadiran_detail" ADD CONSTRAINT "rekap_kehadiran_detail_rekapKehadiranBulananId_fkey" FOREIGN KEY ("rekapKehadiranBulananId") REFERENCES "rekap_kehadiran_bulanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rekap_kehadiran_detail" ADD CONSTRAINT "rekap_kehadiran_detail_komponenKode_fkey" FOREIGN KEY ("komponenKode") REFERENCES "mst_komponen_kehadiran"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "koreksi_rekap" ADD CONSTRAINT "koreksi_rekap_nip_fkey" FOREIGN KEY ("nip") REFERENCES "pegawai"("nip") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "koreksi_rekap" ADD CONSTRAINT "koreksi_rekap_dariKomponen_fkey" FOREIGN KEY ("dariKomponen") REFERENCES "mst_komponen_kehadiran"("kode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "koreksi_rekap" ADD CONSTRAINT "koreksi_rekap_keKomponen_fkey" FOREIGN KEY ("keKomponen") REFERENCES "mst_komponen_kehadiran"("kode") ON DELETE SET NULL ON UPDATE CASCADE;
