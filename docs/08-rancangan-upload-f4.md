# F4.0 Rancangan pemrosesan upload (Rekap, Koreksi, Nominatif, Standarisasi)

Tanggal 13 Okt 2026. Hosting: Vercel Hobby + Neon Free (lihat `docs/07`). Rancangan ini juga berlaku bila nanti pindah
server (tidak ada yang spesifik vendor, selain pembatas ukuran potongan).

## 1. Temuan dan ukuran (diukur, bukan perkiraan)
| Hal | Hasil |
|---|---|
| Baca Excel dengan `exceljs`, 2.800 baris x 22 kolom (bentuk Rekap) | **0,4 dtk**, +13 MB memori |
| 2.800 baris x 60 kolom (bentuk Nominatif/SIMPEGA) | **0,9 dtk** |
| Ekstrem: 15.000 baris x 100 kolom (9,7 MB) | **7 dtk**, memori +21 MB |
| Tulis massal (migrasi F2, lokal) | ±11 ribu baris/dtk; Rekap 2.800 NIP = ±47 ribu baris (header + komponen) -> kira-kira 5-10 dtk di Neon |
| Batas Vercel Hobby | body 4,5 MB, durasi 300 dtk, memori 2 GB |
Kesimpulan: **pembacaan dan penulisan jauh di bawah batas durasi**; satu-satunya batas yang nyata adalah **ukuran body 4,5 MB**.
Berkas Rekap dan Nominatif biasanya < 2 MB; hanya berkas mentah SIMPEGA (6,7 MB, F4.5) melewati batas. Pekerja latar atau
antrean **tidak diperlukan** (menambah layanan dan biaya tanpa manfaat).

## 2. Keputusan rancangan
1. **Pembacaan dan validasi di server** (satu sumber kebenaran, bisa dites dan dibandingkan dengan KDS2). Bukan di browser.
2. **Pengiriman berkas per potongan 3 MB** ke `POST /api/upload-chunk` untuk SEMUA jenis upload (satu jalur, bukan dua),
   disimpan di tabel `UploadChunk` (sudah ada), digabung saat diproses, **dihapus** setelah selesai. Potongan yang yatim
   (tab ditutup di tengah jalan) dibersihkan otomatis: setiap upload baru menghapus potongan yang berumur > 1 hari.
   Tanpa Vercel Blob (layanan tambahan, tidak perlu).
3. **Dua tahap: "Periksa" lalu "Simpan"** (perbaikan atas KDS2, yang langsung menimpa). Tahap Periksa membaca berkas dan menjalankan
   seluruh validasi **tanpa menulis apa pun**, lalu menampilkan ringkasan: berapa baris sukses/gagal/peringatan, daftar alasan,
   dan **berapa data yang akan DIGANTI** (re-upload). Tahap Simpan memakai potongan yang sama (tidak unggah ulang) dan menulis.
   Alasan: re-upload menimpa data bulan itu; dengan pratinjau salah pilih bulan atau salah berkas ketahuan sebelum terjadi.
   Ini perubahan alur, bukan perubahan aturan: hasil akhir tersimpan harus identik dengan KDS2 (dibuktikan paritas, §4).
4. **Satu transaksi** untuk seluruh penyimpanan satu upload (semua atau tidak sama sekali), batas waktu transaksi 120 dtk,
   `maxDuration = 300` pada rute/aksi upload. Pola tulis KDS2 dipertahankan: preload (pegawai, snapshot, header lama) lalu
   `insert` massal per 500-1.000 baris, bukan kueri per baris.
5. **Sinkron**: satu permintaan "Simpan" selesai dalam beberapa detik; tidak ada polling progres. Halaman hasil memakai
   `UploadBatch` + `BarisGagalUpload` seperti KDS2 (peringatan tetap berawalan `[PERINGATAN]`).
6. **Penjaga berkas** meniru `PemeriksaFileExcel` KDS2: maksimum 6 sheet, 15.000 baris per sheet, opsi "nama sheet", pesan
   Bahasa Indonesia yang jelas. Tambahan: tolak bila bukan `.xlsx` (cek tanda tangan ZIP), batas total berkas 12 MB.
7. **Rumus Excel**: `exceljs` mengembalikan hasil hitung sel rumus (`result`); padanan `CalculatedFormulaImport` KDS2 diuji
   dengan berkas ber-rumus (TOTAL = `F69-SUM(G69:Q69)`).
8. **Kode terpisah dalam tiga lapis** agar mudah dites: `baca` (xlsx -> baris mentah), `validasi` (fungsi murni: baris + konteks
   -> `{valid, catatan}`), `simpan` (menulis dalam transaksi). Pola yang sama untuk Rekap, Nominatif, dan Koreksi.
9. **Penerapan ulang Koreksi** (`terapkanUntukBulan`) dijalankan di transaksi yang sama dengan Simpan Rekap, supaya tidak ada
   keadaan "rekap sudah diganti, koreksi belum".
10. **Keamanan**: setiap rute dan aksi upload memanggil `auth()`; tipe/ukuran diperiksa di server; `nama_sheet` dan nama berkas
    tidak pernah dipakai sebagai jalur berkas (tidak ada penyimpanan berkas di disk).

## 3. Urutan pengerjaan (disesuaikan)
| Langkah | Isi | Bukti |
|---|---|---|
| F4.1a (**selesai 13 Okt 2026**: `lib/upload/*`, `app/api/upload-chunk`, `components/upload/UnggahBerkas.tsx`; 31 tes baru, total 271 lulus) | Infrastruktur: `lib/upload/*` (potongan, gabung, pembersih, penjaga berkas, pembaca sheet), rute `upload-chunk`, komponen klien unggah + progres | tes: berkas 10 MB terkirim per potongan, potongan lengkap/tidak lengkap, pembersih, berkas rusak/bukan xlsx/banyak sheet/terlalu banyak baris |
| F4.1b | Importer Rekap: validasi (NIP tak dikenal, belum ada Nominatif, AKL ditolak, TMT, bulan tak cocok, TOTAL != JUMLAH MASUK NYATA, NIP ganda), simpan massal, re-upload mengganti, terapkan koreksi | paritas terhadap importer KDS2 asli (§4) |
| F4.1c | Halaman Upload Rekap (Periksa -> Simpan -> Hasil), unduh template | tes komponen + uji di browser dengan berkas sintetis |
Lalu F4.2 Koreksi, F4.3 Nominatif, F4.4 Rekap Individual, F4.5 Standarisasi KDS1 (jalur potongan yang sama, berkas 6,7 MB).

## 4. Cara membuktikan paritas importer (tanpa menyentuh data asli dan tanpa menulis ke MySQL)
KDS2 menjalankan tesnya di **SQLite dalam memori** (`phpunit.xml`). Untuk F4 dibuat oracle kedua `scripts/oracle/kds2-impor.php`:
boot Laravel KDS2 dengan SQLite memori, migrasi + `MasterDataSeeder`, memuat keadaan awal sintetis dari JSON (pegawai, snapshot
Nominatif, rekap lama), menjalankan **`RekapKehadiranImporter` asli** terhadap berkas xlsx sintetis yang sama, lalu mengeluarkan isi
tabel hasil (rekap, detail, batch, baris catatan). Tes TypeScript menjalankan importer baru terhadap keadaan dan berkas yang sama
di `kds_test` lalu membandingkan **baris demi baris**. Berkas sintetis dihasilkan oleh pustaka berbeda dari pembacanya
(PhpSpreadsheet untuk oracle, `exceljs` untuk tes) agar pembacaan lintas-pustaka ikut terbukti, termasuk sel rumus, NIP bertanda
petik di depan, NIP sebagai angka, tanggal, sel kosong. Data uji sintetis dibangkitkan acak bersemi tetap (ratusan kasus) di
samping kasus tepi tertulis (bulan TMT, AKL, NIP ganda, bulan tak cocok).
Perluasan ke Nominatif (F4.3) dan Koreksi (F4.2) memakai oracle yang sama.

## 5. Yang perlu dicek saat akun Neon/Vercel ada (tidak menghalangi pengerjaan)
- Transaksi interaktif Prisma lewat alamat *pooled* Neon; bila bermasalah, rute upload memakai alamat langsung (`DATABASE_URL_UNPOOLED`).
- Waktu tulis 47 ribu baris dari fungsi `sin1` ke Neon Singapura (diperkirakan 5-10 dtk; ukur dengan data sintetis).
- Neon Free tidur setelah 5 menit diam: permintaan pertama upload bisa 1-3 dtk lebih lambat; tidak berbahaya.

## 6. Risiko dan penanganannya
| Risiko | Penanganan |
|---|---|
| Tab ditutup di tengah unggahan | potongan yatim dibersihkan > 1 hari; Periksa/Simpan hanya jalan bila potongan lengkap |
| Dua upload bulan yang sama bersamaan | pengguna tunggal; tetap dijaga transaksi + unik `(nip, bulan, tahun)` |
| Salah bulan/berkas | tahap Periksa menampilkan jumlah data yang akan diganti dan bulan yang terdeteksi di berkas |
| Workbook kerja besar menghabiskan memori | penjaga berkas (sheet, baris, ukuran) sebelum dibaca penuh |
| Beda perilaku baca Excel antar pustaka (rumus, tanggal, NIP angka) | berkas sintetis lintas-pustaka di tes paritas |
