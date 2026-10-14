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
| F4.1b (**selesai 13 Okt 2026**: `lib/impor/{rekapKehadiran,phpString}.ts`, oracle `scripts/oracle/kds2-impor.php`, `tests/paritas/impor-rekap.test.ts`; 24 tes paritas + 7 tes transaksi; 2.800 pegawai disimpan 2,5 dtk lokal, mengganti 2,5 dtk) | Importer Rekap: validasi (NIP tak dikenal, belum ada Nominatif, AKL ditolak, TMT, bulan tak cocok, TOTAL != JUMLAH MASUK NYATA, NIP ganda), simpan massal, re-upload mengganti, terapkan koreksi | paritas terhadap importer KDS2 asli (§4) |
| F4.1c (**selesai 13 Okt 2026**: `/rekap-kehadiran/upload`, `/upload/hasil/[id]`, `/upload/template`, `FormUploadRekap`, aksi server Periksa/Simpan/Batal; 12 tes baru + uji di browser) | Halaman Upload Rekap (Periksa -> Simpan -> Hasil), unduh template | tes komponen + uji di browser dengan berkas sintetis |
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

## 7. Catatan hasil F4.1b
- Paritas: 12 kasus tertulis + 2 kasus acak bersemi tetap (450 baris), masing-masing dua arah (berkas ditulis exceljs dibaca PhpSpreadsheet, dan sebaliknya) = 24 perbandingan identik dengan importer KDS2 asli. Kebenaran tes dibuktikan dengan mutasi (aturan TMT dan semantik trim dirusak sengaja -> tes gagal).
- Perilaku PHP yang ditiru: `trim` PHP (tanpa spasi tak-putus), `strcasecmp` ASCII, `Str::limit` menurut lebar tampilan + rtrim, NIP sel angka tak aman (> 2^53) ditolak, NIP berawalan petik, NIP ganda = baris terakhir menang, urutan komponen mengikuti posisi kolom.
- Beda sengaja yang tidak teruji: sel bertipe tanggal (PHP membaca nomor seri; ditiru dengan nomor seri JavaScript, presisi desimal bisa beda) dan angka desimal ekstrem (presisi 14 digit PHP). Data asli hanya berisi bilangan bulat dan teks (diperiksa lewat agregat di KDS2).
- **Penerapan ulang Koreksi Rekap** belum ada (F4.2): `simpanRekap` menerima `setelahTulis(tx, batchId)` untuk dipanggil di transaksi yang sama. Karena upload menimpa angka koreksi, **halaman Upload Rekap (F4.1c) baru boleh dipakai pada data asli setelah F4.2** (atau diberi penerapan koreksi).

## 8. F4.2 Koreksi Rekap (dipecah tiga)
| Langkah | Isi | Status |
|---|---|---|
| F4.2a | Layanan inti `lib/koreksi/layanan.ts` (simpan + terapkan, batalkan, terapkan ulang per bulan, pratinjau, koreksi berlaku per NIP, komponen tersedia), jejak audit, dan penerapan otomatis setelah `simpanRekap` (satu transaksi) | **selesai 13 Okt 2026** |
| F4.2b | Halaman Koreksi Rekap: formulir (periode/angka) + pratinjau, daftar, batalkan, terapkan ulang; validasi sama dengan KoreksiRekapRequest | **selesai 13 Okt 2026** |
| F4.2c | Impor Excel koreksi (pratinjau per baris lalu konfirmasi, duplikat, template) | **selesai 13 Okt 2026** |
Paritas F4.2a: oracle `scripts/oracle/kds2-koreksi.php` (service KDS2 asli di SQLite memori; bagian umum di `sqlite-umum.php`),
`tests/paritas/koreksi-rekap.test.ts`: 11 kasus tertulis + 3 kasus acak (60 langkah) membandingkan hasil tiap langkah, rekap + detail ber-id,
tabel koreksi, dan audit_log baris demi baris. Terbukti peka lewat 5 mutasi aturan (idempotensi angka, angka mengalahkan periode, format
pengubah audit, laporan "kurang", batas jumlah angka). Beda sengaja: membatalkan koreksi yang sudah batal tidak mengubah apa pun (KDS2 menimpa
waktu batal); koreksi baru disimpan dan diterapkan dalam SATU transaksi (KDS2 dua langkah terpisah).

## 9. Catatan hasil F4.1c
- **Temuan penting:** template resmi Upload Rekap KDS2 (dan berkas dari beberapa pustaka .NET/lain) memakai target relasi ABSOLUT ("/xl/tables/table1.xml"). PhpSpreadsheet (KDS2) membacanya, tetapi `exceljs` gagal ("Cannot read properties of undefined") pada berkas bertabel. Padahal berkas yang diunggah admin hampir pasti turunan template itu. Perbaikan: `lib/upload/perbaikiXlsx.ts` menulis ulang target absolut menjadi relatif sebelum dibaca; terbukti dengan berkas bertabel sintetis dan dengan template resmi asli (terbaca 5 baris, header benar). Tanpa temuan ini, upload berkas resmi akan gagal di produksi.
- Template diunduh dibangkitkan program (`lib/upload/templateRekap.ts`), bukan berkas tetap: berkas .xlsx sengaja tidak masuk repo dan template KDS2 berisi baris contoh.
- Layar Periksa menampilkan: jumlah baris/gagal/peringatan, berapa pegawai yang akan DIGANTI vs baru, daftar baris dilewati dan peringatan (maks 300 di layar; lengkap di halaman hasil), dan **peringatan salah bulan** bila teks BULAN di berkas berbeda dari bulan yang dipilih (menangkap salah pilih sebelum menimpa data).
- Sesi login lama yang menyimpan id pengguna yang sudah tidak ada (ditemukan di uji browser setelah database dev dibuat ulang) tidak lagi menggagalkan Simpan: pengunggah tercatat sebagai nama, relasi dikosongkan.
- Menu: "Upload Rekap" di bagian Proses.

## 10. F4.3 Upload Nominatif (a: importer, b: halaman, c: Tambah Pegawai manual)
- **F4.3a selesai 13 Okt 2026:** `lib/impor/nominatif.ts` (+ `tanggal.ts`), oracle `scripts/oracle/kds2-nominatif.php` (importer + KontrakNominatif KDS2 asli di SQLite memori; tabel master di SQLite DIGANTI isi master kds_test supaya nama->kode identik), `tests/paritas/impor-nominatif.test.ts`: 13 kasus (+ acak 300 baris), dua arah pustaka = 26 perbandingan identik: batch, pegawai, semua kolom nominatif, jabatan tambahan, catatan (teks + nomor baris), dan pesan penolakan header. Terbukti peka lewat 5 mutasi (golongan Non-ASN, koma pada nama, NIP ganda, slot 3, huruf status pengangkatan). Id baris dibandingkan menurut urutan (PostgreSQL menghabiskan nomor urut saat upsert berbenturan); id baris lama dipertahankan saat unggah ulang (dites).
- **F4.3b selesai:** `/nominatif/upload`, `/upload/hasil/[id]`, `/upload/template`, `FormUploadNominatif`; Periksa menambah **peringatan snapshot hilang**: jumlah pegawai snapshot sebelumnya yang tidak ada di berkas (akan tampil non-aktif) dan peringatan kuning bila > 10% / 20 orang (menangkap berkas terpotong atau salah bulan). Uji di browser dengan template yang diunduh. 2.800 pegawai disimpan 0,75 dtk (lokal).
- **PENGERASAN sengaja pembaca tanggal** (`lib/impor/tanggal.ts`; tes: `tests/unit/tanggal.test.ts`): Carbon::parse KDS2 menerima hampir apa saja. Ditemukan lewat oracle: teks sembarang ("x", "2018") DIAM-DIAM menjadi TANGGAL HARI INI; "01/02/1990" dibaca 2 Januari; "2018-02-30" digeser ke 2 Maret; sel tanggal Excel DITOLAK (dibaca nomor seri). Importer baru: menolak teks sembarang dan tanggal yang tidak ada (baris gagal dengan pesan yang sama "tidak valid"), menolak a/b/yyyy yang ambigu, menerima sel tanggal Excel dan nama bulan Indonesia. Format yang dipakai nyata (ISO, ISO+jam, d-m-Y, d.m.Y, Y/m/d, Ymd, "4 January 2018", "4-Jan-2018", "Jan 4, 2018") hasilnya identik dengan KDS2 (paritas).
- Temuan pendamping: tanggal di data KDS2 yang lama bisa saja terisi "hari upload" karena celah ini; tidak ada cara mendeteksinya otomatis.
- **F4.3c selesai 13 Okt 2026:** `lib/nominatif/tambahManual.ts`, halaman `/nominatif/baru` (tombol "+ Tambah Pegawai" dan "Upload Nominatif Bulanan" di halaman Nominatif kini aktif), oracle `scripts/oracle/kds2-tambah-pegawai.php` (menjalankan NominatifBulananController::store + StoreNominatifManualRequest asli), `tests/paritas/tambah-pegawai.test.ts`: 25 kasus tertulis + 40 acak identik pada kolom yang ditolak (dan pesan aturan silang buatan KDS2 persis), baris Nominatif, pegawai, upload_batch semu, dan **audit_log baris demi baris**; terbukti peka lewat 5 mutasi. Baris disisipkan ke bulan berjalan menurut WIB (diuji di batas bulan/tahun dan selisih UTC).
- Beda sengaja: pesan aturan dasar (wajib/maks/tidak valid) berbahasa Indonesia (KDS2: Inggris, locale 'en'); NIP yang sudah ada di Nominatif bulan berjalan menjadi galat kolom NIP (KDS2: galat basis data 500).

## 11. Catatan hasil F4.2b/c (Koreksi Rekap: halaman dan impor Excel)
- Kode: `lib/koreksi/validasi.ts` (KoreksiRekapRequest), `lib/koreksi/impor.ts` (KoreksiRekapImporter), `lib/koreksi/templateKoreksi.ts`; halaman `/koreksi-rekap` (formulir periode/angka + pratinjau dampak, impor massal, terapkan ulang, daftar + batalkan), aksi server, menu "Koreksi Rekap" aktif.
- Paritas validasi formulir (`tests/paritas/koreksi-formulir.test.ts`): 41 kasus tertulis + 150 acak terhadap KoreksiRekapRequest asli: kolom yang ditolak identik dan pesan buatan KDS2 persis. Temuan: aturan `after_or_equal` Laravel juga gagal bila Tanggal Selesai bukan tanggal, TETAPI hanya bila Tanggal Mulai valid (dua pesan di kolom selesai); bila mulai kosong/tidak valid tidak ada pesan tambahan, dan selesai valid dengan mulai kosong lolos. Ditiru persis.
- Paritas impor (`tests/paritas/koreksi-impor.test.ts`): 9 kasus tertulis + 2 acak (150 baris), dua arah pustaka = 22 perbandingan identik: hasil parse per baris (status, pesan, data, dampak), ringkasan, galat berkas (header/maks baris), hasil simpan, rekap + detail ber-id, tabel koreksi, audit_log. Terbukti peka lewat 4 mutasi (format d/m/Y, kunci duplikat, jenis kosong = periode, kata HAPUS). Yang ditiru dari PHP: `is_numeric`/`(int)`, `sprintf('%.0f')` untuk NIP angka, `createFromFormat` ketat (hanya angka berpadding nol; "1/9/2026" ditolak), sel tanggal Excel sebagai nomor seri, kata kunci tujuan kosong (kosong, -, HAPUS, TIDAK DIHITUNG), `?:` yang menganggap "0" kosong.
- Alur impor mengikuti pola upload lain: unggah per potongan -> **Periksa** (parse, tanpa menyimpan) -> **Simpan** (berkas dibaca ulang, semua baris valid disimpan dan diterapkan dalam SATU transaksi; KDS2 menyimpan per baris tanpa transaksi bersama dan menyimpan hasil parse di cache 1 jam).
- Pratinjau formulir wajib diulang bila isian diubah (tombol Simpan hanya muncul setelah pratinjau yang sesuai).

## 12. F4.4 Rekap Individual dan Massal (hanya-baca)
- Kode: `lib/laporan/rekapIndividual.ts` (dokumen satu pegawai, pencarian, kandidat massal, isi sheet ekspor, judul sheet massal, parameter bersama), `components/rekap/{DokumenRekapIndividual,PilihanMassal,TombolCetak}.tsx`, halaman `/rekap-kehadiran/individual` (+ `/export`), `/rekap-kehadiran/individual/massal` (+ `/cetak`, `/excel`), menu "Rekap Individual". Kop surat memakai `public/images/logo-um.png` (aset logo disalin dari KDS2). Cetak/PDF lewat `window.print()` dan CSS `@media print` (A4, satu dokumen per halaman); nama berkas bawaan PDF = judul tab.
- **Paritas data asli** (`tests/paritas/rekap-individual.test.ts`, lokal): 112 dokumen (2026 dan 2025; 52 berisi, 8 bertanda koreksi), ±40 pencarian x 2 tahun (potongan nama/NIP, huruf besar/kecil, wildcard LIKE, batas 30), 7 kombinasi kandidat massal (3.008 baris, urutan TK + seri), isi sheet ekspor dan judul sheet massal identik dengan RekapIndividualService, RekapIndividualController (cari), RekapIndividualMassalController (kandidat), dan Export KDS2 asli. Urutan kunci peta `nilai` tidak bermakna (KDS2 mengeluarkan alfabetis).
- **Paritas sintetis** (`tests/paritas/rekap-individual-sintetis.test.ts`, SQLite memori): sel tanda koreksi (tujuan nol, "dihapus", angka, digantikan), keterangan koreksi dengan rentang terputus, snapshot dari tahun sebelumnya, tahun tanpa rekap, pencarian huruf besar/kecil + wildcard. Melengkapi data asli: 7 mutasi aturan (tanda tujuan, tanda asal, snapshot sampai tahun itu, pencarian tak peka huruf, rentang bulan, pembulatan persen, batas 30) semuanya terdeteksi; tiga di antaranya HANYA terdeteksi oleh tes sintetis (data asli tidak memuat kasusnya).
- Detail yang ditiru: persen = number_format(masuk/sigma*100, 1, ',', '') (pembulatan setengah menjauhi nol, dihitung dengan bilangan bulat); operator `?:` PHP menganggap "0" kosong; pencarian memakai LIKE kolasi `_ci` (tanpa huruf besar/kecil dan aksen; persen, garis bawah, dan backslash adalah pola/escape seperti MySQL) dan memilih snapshot ber-id terbesar DI ANTARA yang cocok; kandidat massal memakai snapshot terakhir lewat MAX(id) dan seri Non-aktif menurut NIP. Catatan: backslash sebagai escape LIKE hanya diuji unit (SQLite tidak punya escape bawaan).
- Seperti KDS2, tanda sel hasil koreksi dan keterangan koreksi tersedia di data laporan tetapi TIDAK dicetak di dokumen resmi dan tidak masuk Excel. Bila ingin transparansi di cetakan, tinggal menampilkan `keteranganKoreksi` (keputusan produk, bukan teknis).
- Cetak massal memakai alamat GET berisi NIP terpilih (maks 200 NIP = sekitar 4 KB), bukan POST seperti KDS2 (halaman App Router tidak menerima POST formulir); aman karena hanya-baca.

## 13. F4.5 Standarisasi KDS1
Dipecah: **F4.5a** layanan (selesai di bawah), **F4.5b** halaman (upload + riwayat, detail batch, antrean Review + formulir penyelesaian, kamus, bandingkan batch, arsip, catatan), **F4.5c** migrasi data KDS1 dari Neon (kamus koreksi, catatan perubahan batch, riwayat batch; butuh akses baca ke database KDS1, belum ada).

### F4.5a (selesai 13 Okt 2026)
- Kode: `lib/standarisasi/proses.ts` (Periksa dan Simpan), `lib/standarisasi/resolve.ts` (penyelesaian baris Review + Kamus Koreksi). Logika klasifikasi (`lib/domain/classify.ts`, `matching.ts`, `lib/excel/*`) adalah salinan KDS1 apa adanya, dengan tiga perbaikan yang ditemukan di sini (lihat di bawah). Alur: berkas mentah -> klasifikasi deterministik (tanpa tebakan) -> baris pasti masuk snapshot Nominatif bulan itu **langsung** (tanpa unduh-unggah ke KDS2), sisanya antrean Review. Seperti KDS1: unggahan bulanan MENGGANTI seluruh snapshot bulan itu dan menandai batch lama bulan itu "Dibatalkan". Tahap **Periksa** (tanpa menulis) memberi ringkasan: berhasil/review per alasan, berapa baris Nominatif yang akan ditimpa, dan pegawai snapshot sebelumnya yang tidak ada di berkas.
- **Paritas** (`tests/paritas/standarisasi.test.ts`): ORACLE = kode KDS1 ASLI (`importBatch`, `resolveRow`) dijalankan terhadap database lokal `kds1_oracle` (disiapkan `scripts/oracle/siapkan-kds1-oracle.ts`; alamat dipaksa lokal dan dicek, tidak pernah menyentuh Neon/produksi KDS1) dengan master data yang SAMA dengan `kds_test`, zona waktu UTC (seperti Vercel). 5 kasus identik: batch (status, hitungan, peta kolom), snapshot Nominatif + jabatan tambahan (semua kolom), antrean Review (alasan, detail, data mentah), Kamus Koreksi, pegawai; mencakup kamus terisi (status/golongan/unit/klasifikasi/NIP dikecualikan permanen), penggantian snapshot bulan yang sama (bulan lain utuh), bulan/tahun lain, dan tiga penyelesaian baris Review dengan pilihan "ingat" berbeda. Berkas sintetis (320 baris, nilai dari master + gangguan acak: salah ketik, kosong, tak dikenal, jabatan tambahan, NIP placeholder AKL, gelar) ditulis dengan awalan U+200C seperti berkas asli. 6 mutasi (hapus snapshot lama, tandai batch lama, saring NIP dikecualikan, hitungan Review, ingat jabatan tambahan, ...) terdeteksi; satu (penggantian slot jabatan tambahan lama saat penyelesaian) hanya bisa terjadi bila NIP sudah punya snapshot, jadi dites langsung di `tests/integration/standarisasi.test.ts`.
- **Temuan yang tidak akan terlihat tanpa oracle** (semua diperbaiki):
  1. KDS1 menuliskan kode placeholder "Belum Diketahui (Perlu Verifikasi Manual)" secara mati (`DSN-99`, `UMM-99`, sesuai seed KDS1) sedangkan master KDS2 memberi kode `DSN-05`, `UMM-11` untuk nama yang sama: tanpa perbaikan setiap pegawai baru berjabatan kosong akan melanggar kunci asing di KDS Terpadu. Kode kini dicari lewat NAMA di master. (Kode peta role-ke-unit tetap `JBT-xx -> UA-xxx` diverifikasi sama dengan nama di master KDS2.) Untuk oracle, kode KDS1 itu ditambahkan hanya di database oracle dan dinormalkan saat membandingkan.
  2. Pembaca tanggal berkas mentah memakai zona waktu server (`new Date(y, m, d)`): hasilnya benar di Vercel (UTC) tetapi **bergeser sehari** di server berzona WIB (mis. komputer pengguna) bila disimpan ke kolom tanggal. Kini selalu UTC (dites di bawah TZ=Asia/Jakarta).
  3. NIP ganda di satu berkas pada baris yang berhasil membuat KDS1 gagal dengan galat basis data; kini ditolak dengan pesan jelas dan tanpa menulis apa pun.
- Beda sengaja lain: id batch angka (bukan cuid), `masterCache` menerima klien basis data (untuk tes/transaksi), jejak penyelesaian Review memakai `audit_log` gabungan (per kolom) alih-alih tabel audit KDS1, dan keluaran berkas unduhan "Nominatif Bulanan" KDS1 tidak dipakai lagi (keluaran standarisasi langsung menjadi snapshot; ekspor Excel Nominatif sudah ada dari F3).

### F4.5b-1 (selesai 13 Okt 2026): halaman Standarisasi, Review, Kamus
- Halaman: `/standarisasi` (unggah per potongan, Periksa lalu Simpan, riwayat), `/standarisasi/[id]` (ringkasan batch, rincian per alasan, cari dan hapus pegawai satu bulan, peta kolom), `/standarisasi/[id]/review` (antrean + Kecualikan, biasa atau permanen), `/standarisasi/[id]/review/[barisId]` (formulir Selesaikan baris dengan saran dari bulan sebelumnya, verifikasi identitas Akademisi Luar UM, tambah role/unit/prodi master), `/kamus` (lihat dan hapus Kamus Koreksi). Item "Standarisasi" di sidebar aktif.
- Logika dipisah dari aksi server supaya bisa dites tanpa sesi login: `lib/standarisasi/tindakan.ts` (kecualikan, hapus pegawai, hapus kamus), `formResolve.ts` (penguraian dan validasi formulir), `master.ts` (tambah master). Komponen formulir (`ResolveForm`, `SearchableSelect`, `TambahTargetBaru`, `PilihIdentitasForm`) disalin dari KDS1 dan hanya diubah id batchnya (angka) dan alamat aksinya.
- Tes (`tests/integration/standarisasiTindakan.test.ts`, 6 tes; mutasi dua penjaga terdeteksi): hitungan batch, status Selesai saat antrean kosong, Kamus permanen, cascade jabatan tambahan, audit, kode master berurutan tanpa duplikat, setiap galat validasi formulir. Tes membersihkan master tambahannya sendiri karena `kds_test` dipakai tes paritas master.
- Beda dari KDS1: jejak audit memakai `audit_log` gabungan (per kolom) alih-alih tabel audit KDS1; halaman unduh "Arsip" KDS1 tidak dibawa (snapshot langsung ada di Nominatif beserta ekspor Excel); penghapusan pegawai dan kamus menampilkan hasil lewat penyegaran daftar.
- Diverifikasi di browser dengan batch sintetis (`scripts/dev-contoh-standarisasi.ts`, hanya terhadap `kds_dev`): daftar riwayat, daftar Review, Selesaikan satu baris (masuk snapshot, antrean berkurang), Kecualikan, cari dan hapus pegawai. Belum: **Bandingkan Batch** (F4.5b-2), uji dengan berkas SIMPEGA asli.

### F4.5b-2 (selesai 14 Okt 2026): Bandingkan Batch
- `/bandingkan` (pilih batch A dan B, tab Orang Baru / Orang Hilang / NIP Anomali, catatan alasan per orang) dan `/bandingkan/export` (unduh .xlsx, wajib login). Menu "Bandingkan Batch" di sidebar. Logika murni `lib/domain/bandingkanBatch.ts` adalah salinan KDS1 apa adanya (identik, diperiksa dengan `diff`); perakitan data dan catatan ada di `lib/standarisasi/bandingkan.ts` (id batch angka, klien Prisma sebagai argumen), `lib/excel/exportBandingkan.ts` dan `components/standarisasi/BandingkanTabs.tsx` disalin dari KDS1 dengan impor disesuaikan.
- Daftar batch memuat semua jenis batch snapshot (Standarisasi, Upload Nominatif, Tambah Pegawai) yang belum "Dibatalkan", bukan hanya hasil Standarisasi.
- Catatan dikunci ke (kategori, NIP utama) seperti KDS1; batch konteks yang sudah tidak ada atau pengguna sesi lama tidak menggagalkan penyimpanan; alasan dipangkas dan wajib diisi, kategori dibatasi Baru/Hilang/Anomali.
- Tes `tests/integration/bandingkan.test.ts` (5 tes; mutasi tertukarnya batch B dan catatan tanpa filter terdeteksi). Catatan untuk penulis tes: normalisasi nama membuang angka, jadi nama sintetis "Nama 3 Santoso" dan "Nama 5 Santoso" dianggap kembar dan memicu anomali; tes memakai nama huruf acak yang berbeda. Beda dengan KDS1: paritas langsung ke KDS1 tidak dibuat untuk bagian ini karena logika pembandingnya identik (salinan) dan perakitannya hanya kueri; yang berbeda (id angka, daftar jenis batch) dites langsung.
- Diverifikasi di browser dengan dua bulan sintetis: hasil tampil (3 baru, 13 hilang, 7 anomali), catatan tersimpan dan tampil setelah muat ulang, unduhan .xlsx 200.

## 14. F4.5c Migrasi data KDS1 (selesai 14 Okt 2026)
- **Sumber**: Neon KDS1, diakses BACA-SAJA atas persetujuan pengguna (14 Okt 2026, pilihan "pakai .env KDS1"). `scripts/kds1-neon/sambung.ts` membaca alamat koneksi dari `.env` KDS1 di dalam proses (tidak dicetak, tidak disalin), membuka transaksi `SET TRANSACTION READ ONLY` dan menolak SQL selain SELECT. Isi KDS1: kamus_koreksi 286, catatan_perubahan_batch 243, upload_batch 16, nominatif_bulanan 35.384 (dua pertama dimigrasikan).
- **Tujuan**: HANYA `kds_paritas` (salinan data asli lokal; skrip menolak database lain). Tidak ada ke Neon KDS Terpadu/Vercel, tidak ada data pegawai di repo.
- **Tidak dimigrasikan, sengaja**: snapshot Nominatif dan riwayat batch KDS1 (Nominatif resmi sudah ada dari KDS2 di F2; batch KDS1 tidak punya padanan dan akan hanya menjadi duplikat). Catatan Perubahan dibawa tanpa kaitan ke batch (kolom batch A/B kosong; kuncinya (kategori, NIP utama) tetap, jadi catatan tetap muncul di Bandingkan).
- **Terjemahan kode** (`lib/migrasi/kds1.ts`, 5 tes unit sintetis, 2 mutasi terdeteksi): nilai kamus berupa kode master, dan master KDS1 berbeda dari KDS2 pada unit kerja (34 kode sama bernama beda, 15 unit hanya di KDS1) dan jabatan dosen (DSN-00 "Tenaga Pengajar" di KDS1 = "Tenaga Dosen" di KDS2; DSN-99 KDS1 = DSN-05 KDS2). Kode diterjemahkan lewat nama; ambigu atau tanpa padanan ditolak dan dilaporkan (tidak menebak). Dua aturan tambahan: target jabatan tambahan "NONE" dipertahankan; unit KDS1 yang sebenarnya program studi (disimpan sebagai unit sebelum fitur Program Studi) dialihkan ke Program Studi bila namanya punya padanan tunggal.
- **Keputusan pengguna**: 6 unit asrama yang hanya ada di KDS1 (dipakai 6 entri kamus) DITAMBAHKAN ke master KDS Terpadu di `kds_paritas` (induk UI-08, kode baru berurutan; master `kds_paritas` kini beda dari KDS2 untuk 6 baris itu). Master `kds_dev`/`kds_test`/seed tidak diubah; bila produksi nanti dibangun dari seed, 6 unit ini harus ditambahkan juga.
- **Hasil** (`npm run migrasi:kds1`, dry-run dulu lalu `-- --terapkan`, satu transaksi, cadangan tabel terdampak dibuat sebelumnya): kamus 286 dari 286, catatan 243 dari 243, 0 ditolak, 0 tidak cocok saat verifikasi (jumlah dan nilai); 252 entri berkode semuanya ada di master (`scripts/kds1-neon/cek-kamus-lokal.ts`). Menjalankan ulang aman (entri yang sudah ada dilewati, tidak ditimpa).
- Belum dibuktikan: Standarisasi dengan berkas SIMPEGA asli memakai kamus ini (menunggu berkas mentah 2026 dari pengguna).

## 15. Uji Standarisasi dengan berkas SIMPEGA asli (14 Okt 2026)
- **Berkas**: `REKAP_PEGAWAI (7).xlsx` (1,0 MB, tarikan September 2026) dari `Downloads\Projects\Nominatif dan Rekap Pegawai 2026`. Diuji HANYA-BACA terhadap `kds_paritas` (salinan data asli lokal; `klasifikasiBerkas` tidak menulis apa pun) dengan `scripts/uji-berkas-asli.ts` dan `scripts/uji-berkas-asli-selisih.ts`; yang dicetak hanya angka agregat, tidak ada NIP/nama. Pembanding: snapshot September 2026 di `kds_paritas` (KDS2) dan agregat snapshot September di Neon KDS1 (`scripts/kds1-neon/agregat-sept.ts`, baca-saja).
- **Kecepatan**: 2.786 baris dibaca dan diklasifikasi dalam **1,6 detik** (jauh di bawah batas 300 dtk Vercel). Semua kolom berkas terdeteksi.
- **Hasil**: 2.730 berhasil, 56 perlu Review (semuanya `IdentitasEksternalPerluVerifikasi`: Akademisi Luar dengan NIP placeholder SIMPEGA; 56 dari 56 ada di snapshot KDS2, jadi KDS1 dulu menyelesaikannya; kamus identitas belum ada di data KDS1 sehingga setiap bulan baru perlu konfirmasi satu kali per orang). Jumlah baris 2.786 = jumlah baris snapshot September di KDS1.
- **Kesamaan dengan KDS2** (2.730 baris berhasil): nama, jenis kelamin, jenis pegawai, status, jabatan dosen, kategori Akademisi Luar, unit kerja, pendidikan, agama, tanggal lahir 100%; tanggal mulai kerja 99,9% (2 baris beda).
- **Temuan 1, diputuskan pengguna**: KDS1 mencatat Tendik "Pelaksana" (767) dan "Laboran" (66) sebagai Jabatan Fungsional Tendik, tetapi riwayat KDS2 mencatat Fungsi Umum Pelaksana (karena ekspor KDS1 membuang jenjang "-" sehingga kunci "<jabatan> <jenjang>" di importer KDS2 tidak cocok dan jatuh ke Fungsi Umum; "Laboran" = alias Teknisi Laboratorium di KDS2). Pengguna memilih **mengikuti KDS2**: `lib/domain/classify.ts` kini memetakan jabatan Tendik berjenjang "-" yang namanya ada di Fungsi Umum Pelaksana ke Fungsi Umum (pilihan eksplisit di Kamus tetap menang). Ini SATU-SATUNYA beda sengaja dari logika klasifikasi KDS1; data sintetis tes paritas KDS1 mengecualikan dua nama itu, dan `tests/integration/standarisasiTendik.test.ts` menguji aturannya (mutasi terdeteksi). Setelah aturan, kolom jabatan Tendik dan Fungsi Umum 100% sama dengan KDS2.
- **Temuan 2, untuk diketahui (tidak diubah)**: golongan Non-ASN: 549 baris PTNA dan 45 baris CPTNA berbeda dari KDS2. Hasil Terpadu = teks berkas SIMPEGA = snapshot KDS1 (mis. PTNA II/b 256 di KDS1), sedangkan KDS2 menyimpan satu tingkat lebih rendah (II/a, III/a, ...) atau kosong. Dugaan: golongan Non-ASN di KDS2 diisi ulang dari sumber lain pada 13 Okt 2026. Perlu dicek pengguna apakah golongan KDS2 atau SIMPEGA yang benar sebelum Rekap/Statistik berbasis golongan Non-ASN dipakai.
- **Temuan 3, perbaikan di Terpadu**: jabatan tambahan: 24 pegawai punya slot lebih banyak daripada KDS2 (mis. 2 vs 1), sesuai catatan KDS2 bahwa jabatan "merangkap" bulan <= September 2026 hilang slot keduanya di jalur lama; Standarisasi Terpadu (3 slot) menangkapnya.
