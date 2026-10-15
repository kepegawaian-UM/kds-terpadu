# Pembersihan data sensitif sebelum masuk aplikasi (keputusan 14 Okt 2026)

Latar belakang: diskusi pengguna dengan atasan. Aplikasi tetap di Vercel/Neon (server luar negeri), dengan syarat **data sensitif pegawai tidak boleh sampai ke server**.
Berkas tarikan SIMPEGA asli (REKAP_PEGAWAI) memuat **67 kolom**, aplikasi hanya membaca **17**. Sisanya (NIK, No KK, NPWP, BPJS, nama ibu kandung, tempat lahir,
status pernikahan, no HP, tiga email, rekening, tiga alamat, data pasangan, gaji pokok, dan lainnya) **dibuang di komputer pengguna sebelum diunggah**.

## Cara memakai (tiap bulan)
1. Unduh tarikan dari SIMPEGA seperti biasa (berkas asli, **jangan diunggah**).
2. Di folder proyek, jalankan: `npm run bersihkan -- "C:\jalur\REKAP_PEGAWAI.xlsx"`.
3. Alat menulis `REKAP_PEGAWAI_bersih.xlsx` di folder yang sama (berkas asli tidak diubah dan tidak dihapus) dan mencetak: jumlah kolom asli, kolom yang dipertahankan, kolom yang **dibuang (nama saja)**, jumlah baris, dan "verifikasi: hasil baca IDENTIK dengan berkas asli".
4. Unggah **hanya** berkas `_bersih` di halaman Standarisasi.
5. Bila berkas asli terunggah tanpa sengaja, server menolaknya dan membuang potongan unggahannya dari database; pesan galat menyebut nama kolom (tidak pernah isinya) dan memberi tahu perintah di atas.

Berkas bersih sekitar 5x lebih kecil (September 2026: 1,0 MB menjadi 219 KB).

## Yang masuk aplikasi (daftar putih, 18 kolom; "Jabatan Remunerasi" ditambah 16 Okt 2026)
NIP, Nama Lengkap (Tanpa Gelar), Nama Lengkap (Dengan Gelar), Tanggal Lahir, Jenis Kelamin, Status Pegawai, Kelompok Jabatan, Jenis Pegawai, Tanggal Masuk, Golongan,
Jabatan Fungsional, Jabatan Tambahan, Unit Kerja Jabatan Tambahan, Jenjang Pendidikan, Unit Kerja, Unit Kerja Induk, Unit Kerja Induk (Level Atas), Jabatan Remunerasi (kolom AG; opsional, hanya nama jabatan: dipakai untuk jabatan Tendik, lihat docs/08 §16).
Sumber tunggal daftar ini: `KOLOM_DIIZINKAN` di `lib/excel/parseRekapPegawai.ts` (dipakai pembersih dan penjaga server).

## Agama dihapus dari aplikasi (keputusan pengguna)
Kolom `agama` dihapus dari database (migrasi `hapus_agama`, cadangan tabel sebelum penghapusan di folder bak), layar (detail Nominatif, formulir Tambah Pegawai, formulir Review),
pembaca berkas SIMPEGA, dan pembanding F5. Pada **template Upload Nominatif** (format KDS2) kolom ke-6 tetap ada sebagai **penanda posisi yang diabaikan dan tidak disimpan**
("Agama (tidak dipakai, kosongkan)") agar format dan tes paritas dengan importer KDS2 tetap utuh. Setelah KDS2 dimatikan (F6), penanda ini dapat dibuang dari template dan importer.

## Pengaman berlapis dan batasnya
| Lapisan | Fungsi |
|---|---|
| Pembersih lokal (`npm run bersihkan`) | Membuat berkas baru dari nol hanya dengan kolom daftar putih; tanpa sheet tersembunyi, komentar, gaya, atau properti dokumen (nama pembuat). Memeriksa HASILNYA sendiri sebelum menulis berkas dan membuktikan hasil baca identik. |
| Penjaga server (Standarisasi lewat web) | Menolak berkas yang punya kolom di luar daftar putih atau berformat Nominatif lama; langsung membuang potongan unggahan dari database. Daftar putih (bukan daftar hitam) sehingga kolom baru dari SIMPEGA otomatis ditolak sampai diputuskan. |
| Upload Nominatif dan Upload Rekap | Memakai template sempit tanpa kolom sensitif (NIP, nama, tanggal lahir, jenis kelamin, pendidikan, jabatan, unit, golongan; atau angka kehadiran). |

**Batas yang jujur**: yang tetap masuk (NIP, nama, tanggal lahir, jenis kelamin, jabatan, unit, golongan, TMT) masih data pribadi (bukan data sensitif seperti NIK atau nama ibu).
**Rekap Kehadiran** memuat jumlah hari sakit dan jenis cuti per pegawai, yang bisa dianggap dekat dengan data kesehatan: ini perlu diketahui atasan dan disebut di surat persetujuan
lokasi data (daftar kolom di atas sebaiknya dilampirkan). Pembersihan melengkapi, tidak menggantikan, verifikasi dua langkah, pengunci login, dan header keamanan.
Penjaga server hanya dapat menolak SETELAH potongan unggahan sampai (XLSX baru bisa dibaca setelah utuh); pengaman utama tetap pembersih lokal.

## Bukti
- `tests/unit/pembersih.test.ts` (7 tes): berkas sintetis dengan penanda unik di semua kolom sensitif; tidak ada penanda yang tersisa di SELURUH isi berkas hasil (semua bagian zip, termasuk sheet tersembunyi, catatan sel, properti pembuat); hasil baca identik; baris catatan kaki dibuang; idempoten; penjaga menolak dan hanya menyebut nama kolom. Dua perusakan sengaja (daftar putih dilonggarkan, penjaga dimatikan) terdeteksi.
- `tests/integration/pembersihanStandarisasi.test.ts`: 320 baris acak dengan semua cabang klasifikasi: hasil klasifikasi berkas bersih identik dengan berkas mentah; mode web menolak mentah (tanpa menulis apa pun) dan menerima bersih; data mentah baris Review tidak memuat NIK/alamat/rekening.
- Berkas SIMPEGA asli September 2026 (diuji lokal, tidak ada yang diunggah): 67 kolom menjadi 17, 2.786 baris, hasil baca identik, klasifikasi identik (2.730 berhasil, 56 Review).
