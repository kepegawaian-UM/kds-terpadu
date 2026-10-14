-- Keputusan pengguna 14 Okt 2026: agama pegawai tidak lagi disimpan (minimisasi data pribadi). Cadangan tabel sebelum penghapusan ada di folder bak.
ALTER TABLE "nominatif_bulanan" DROP COLUMN "agama";
