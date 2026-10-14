# Rencana pemuatan data asli pertama ke Neon

Disusun 14 Okt 2026 setelah hosting berfungsi dan diuji dengan data sintetis. **Belum ada yang ditulis ke Neon untuk keperluan ini.**
Bahasa sengaja sederhana. Pemuatan hanya dijalankan setelah persetujuan eksplisit pengguna (§7).

## 1. Ukuran (diukur di salinan kerja `kds_paritas`)
| Hal | Nilai |
|---|---|
| Seluruh database | **54,4 MB** untuk 10 bulan (Jan-Okt 2026) |
| Terbesar | detail Rekap 30,9 MB (306.960 baris), Nominatif 6,6 MB (25.705), Rekap bulanan 3,1 MB, catatan baris gagal upload 2,0 MB, audit 1,2 MB |
| Pertumbuhan | ±5,4 MB per bulan (±2.800 Nominatif dan ±34.000 detail Rekap per bulan) |
| Batas Neon Free | 512 MB: terpakai ±11% sekarang; cukup ±7-8 tahun; peringatan di 0,4 GB (`docs/07` §8) |
| Waktu muat (perkiraan) | F2 memuat 330 ribu baris ke PostgreSQL lokal dalam 33 detik; lewat internet ke Singapura diperkirakan 5-15 menit (diukur lewat dry-run, §4) |

## 2. Apa yang dimuat, dan dari mana
**Sumber**: `kds_paritas` (salinan kerja yang sudah dikoreksi: golongan Non-ASN Jan-Sep 2026 mengikuti SIMPEGA, tanpa kolom agama). Bukan `kds_kds2_paritas` (salinan KDS2 murni).
| Tabel | Baris | Catatan |
|---|---|---|
| pegawai | 2.871 | jangkar identitas |
| upload_batch | 58 | riwayat unggahan KDS2 |
| nominatif_bulanan (+ jabatan tambahan 3.695) | 25.705 | snapshot Jan-Okt 2026 |
| rekap_kehadiran_bulanan (+ detail 306.960) | 19.185 | Jan-Sep 2026 |
| koreksi_rekap | 118 | |
| catatan_status_pegawai | 99 | Pensiun, Resign, dst. |
| audit_log | 4.967 | jejak perubahan manual (termasuk 1.167 baris koreksi golongan) |
| upload_error_rows | 10.802 | catatan baris gagal/peringatan unggahan lama |
| kamus_koreksi, catatan_perubahan_batch | 286, 243 | dari KDS1 (F4.5c) |
| koreksi_tanggal_mulai_kerja | 2 | dua koreksi TMT yang dikonfirmasi pengguna (saat ini baru di `kds_f5`; dicatat ulang di sumber sebelum muat) |
| **Tidak dimuat** | | akun pengguna (admin sudah ada di Neon), master (sudah identik), data sintetis, apa pun dari `kds_dev`/`kds_f5` |

Keputusan pengguna yang diminta (§7): apakah **audit_log** dan **upload_error_rows** ikut dimuat (disarankan ya: kecil, 3 MB, bagian dari riwayat dan paritas; audit memuat jejak koreksi).

## 3. Persyaratan sebelum boleh dimuat (semua harus tercentang)
| Syarat | Pemilik | Status 14 Okt 2026 |
|---|---|---|
| Konfirmasi tertulis lokasi data (disertai daftar kolom di `docs/11`, dan catatan bahwa Rekap memuat jumlah sakit/cuti) | pengguna | surat ada; **lampirkan daftar kolom dan catatan Rekap bila belum** |
| Kata sandi admin sudah diganti lewat halaman Akun | pengguna | **belum dikonfirmasi** |
| Verifikasi dua langkah aktif di GitHub, Vercel, Neon (sejauh disediakan) dan orang kedua pemulih tercatat | pengguna | **belum dikonfirmasi** |
| Variabel Vercel bertipe Sensitive; Firewall Vercel (batas kecepatan `/login`) aktif | pengguna | **belum dikonfirmasi** |
| Cadangan harian berjalan dan uji pulih lulus | saya | **selesai** (`docs/07` §11) |
| Penghapus data contoh dan penyama master berfungsi | saya | **selesai** |
| Tidak ada data asli di repo; pembersih + penjaga unggahan aktif | saya | **selesai** |

## 4. Cara memuat (urut; tiap langkah dilaporkan sebelum lanjut)
1. **Persiapan sumber**: catat dua koreksi TMT ke `kds_paritas`; ambil cadangan `kds_paritas` terbaru ke folder bak; pastikan `npm run test` hijau.
2. **Alat muat SELESAI dan teruji (14 Okt 2026)**: `npx tsx scripts/neon/muat-data-asli.ts --dry-run | --ya | --verifikasi` (`lib/muat/salinData.ts`, digerakkan skema Prisma sehingga semua 14 tabel domain termasuk tabel KDS1 dan koreksi TMT ikut tanpa pemetaan manual). Satu transaksi (gagal = tidak ada yang tersimpan), id dipertahankan, urutan id disetel mengikuti sumber, penunjuk pengguna (pembuat/pengunggah/penyelesai) diarahkan ke satu-satunya akun admin Neon, tujuan HARUS kosong (tidak pernah menimpa), sumber dipaksa `kds_paritas`, tujuan dipaksa Neon Singapura (`neondb`, alamat langsung), tepat satu mode wajib dipilih. Verifikasi memakai jumlah dan sidik jari md5 SELURUH baris tiap tabel (kolom penunjuk pengguna dikecualikan; NULL SQL dibedakan dari JSON null). 6 tes integrasi terhadap database lokal sementara `kds_muat_test` (dry-run tidak menulis; muat identik; id baru tidak bertabrakan; tujuan tidak kosong ditolak; kegagalan di tengah membatalkan semuanya; satu sel berbeda terdeteksi); tiga perusakan sengaja terdeteksi.
3. **Dry-run di Neon** (dibatalkan di akhir): mengukur waktu nyata, memastikan semua batasan lolos, dan memastikan Neon tetap kosong setelahnya. Bila waktu > 10 menit, pemuatan dipecah per tabel dengan pengosongan ulang sebagai jalan mundur.
4. **Cadangan Neon manual** (sebelum, walau masih kosong) dan pastikan cadangan harian aktif.
5. **Muat sungguhan** (atas persetujuan eksplisit §7).
6. **Verifikasi otomatis** (`scripts/neon/verifikasi-muat.ts`): jumlah baris tiap tabel dan tiap bulan, ringkasan per kolom (checksum per tabel), urutan id, jam WIB; semua harus identik dengan `kds_paritas`. Hasil dicetak sebagai angka, tanpa NIP/nama.
7. **Verifikasi aplikasi**: pengguna masuk, Ringkasan Oktober menampilkan jumlah yang sama dengan salinan lokal; saya periksa halaman utama dari dalam sesi pengguna (seperti uji 14 Okt); `npm run f5:bandingkan` terhadap KDS2 untuk September (pembanding dapat diarahkan ke Neon, hanya membaca).
8. **Cadangan Neon pasca-muat** dan uji pulih sekali lagi (kini berisi data asli); catat ukuran cadangan.

## 5. Jalan mundur
Neon kosong sebelum pemuatan, jadi mundur = mengosongkan tabel domain (`scripts/neon/hapus-data-contoh.ts --ya`, satu transaksi) atau memulihkan cadangan langkah 4. Pemuat bersifat semua-atau-tidak per transaksi, sehingga kegagalan di tengah tidak meninggalkan data setengah jadi.

## 6. Risiko dan penanganan
| Risiko | Penanganan |
|---|---|
| Koneksi internet putus di tengah muat | Transaksi dibatalkan otomatis; ulangi. Muat dijalankan dari komputer dengan koneksi stabil, tidak dari jaringan seluler |
| Neon Free tidur lalu lambat 1-3 detik pada permintaan pertama | Diterima (pengguna tunggal); tidak berpengaruh pada data |
| Data asli tertinggal di komputer dan Drive | Cadangan Drive berisi data asli: jaga akses (verifikasi dua langkah, enkripsi disk); `.env.neon`/`.env.cadangan` tidak pernah di-commit |
| Salah database tertulis | Alat menolak alamat selain Neon Singapura dan menolak bila Neon tidak kosong |
| Pertumbuhan melebihi 0,4 GB | Peringatan di `docs/07` §8; opsi Neon Launch tanpa ubah kode |
| Uji berdampingan F5 membutuhkan data bulan baru | Bulan baru dimasukkan lewat alur normal (Standarisasi, Upload Rekap) langsung di Neon sesudah pemuatan |

## 7. Yang saya butuhkan dari pengguna
1. Konfirmasi tiga syarat bertanda **belum dikonfirmasi** di §3.
2. Keputusan: audit_log dan upload_error_rows ikut dimuat? (disarankan ya).
3. Persetujuan eksplisit untuk dry-run di Neon (§4 langkah 3) dan, terpisah, untuk muat sungguhan (langkah 5). Keduanya akan saya minta pada saatnya; persetujuan untuk satu tidak berlaku untuk yang lain.

## 8. Hasil pemuatan (14 Okt 2026)
Dry-run ke-3 lalu muat sungguhan atas persetujuan eksplisit pengguna. 374.991 baris, 35,8 detik; verifikasi jumlah dan sidik jari seluruh baris IDENTIK untuk 14 tabel; Neon 75,8 MB. Cadangan Neon pra-muat (0,1 MB) dan pasca-muat (2,8 MB) di `bak\kds-terpadu`; uji pulih lulus (28 tabel, 375.582 baris, 0 beda). Satu baris audit_log milik Neon (ganti sandi admin) dipertahankan dengan id setelah riwayat. Syarat Firewall `/login` TIDAK terpenuhi dan risikonya diterima pengguna (aturan ada, uji burst belum menghasilkan 429). Sisa verifikasi: pengguna memeriksa Ringkasan Oktober di situs; `f5:bandingkan` terhadap Neon.
