# F3: modul baca (laporan) — keputusan dan alat

Dokumen kerja F3. Rencana lengkap ada di percakapan persetujuan 13 Okt 2026; ringkasannya di bawah.

## Cara paritas dibuktikan: oracle
Kunci jawaban F3 adalah **kode KDS2 asli**, bukan terjemahan SQL. `scripts/oracle/kds2-oracle.php`
memuat Laravel KDS2 (folder referensi, tidak diubah) terhadap `kds2_produksi`, memanggil controller
langsung, dan mengembalikan data yang akan dirender KDS2 (urutan baris, nilai sel, nama file).

- Aman: sesi MySQL `READ ONLY` (penulisan ditolak server; dibuktikan tes), cache/session/queue
  memakai driver `array`. Keluaran berisi data pegawai asli, hanya lewat berkas sementara yang
  dihapus; **jangan dicetak atau di-commit**.
- Dipakai dari tes lewat `tests/support/oracle.ts` (`tanyaOracle([...])`, banyak permintaan sekali
  boot Laravel). Tambahkan laporan baru dengan menambah penangan di `kds2-oracle.php`.
- Prasyarat: `php` di PATH (Laragon), folder KDS2 utuh (`KDS2_PATH`), MySQL `kds2_produksi`, dan
  `kds_paritas` terisi (F2). Tanpa itu, tes paritas dilewati dengan pesan jelas.

## Urutan nama: pembanding aplikasi (bukan kolasi PostgreSQL)
KDS2 mengurutkan nama dengan `utf8mb4_unicode_ci`. Spike terhadap 25.705 baris:

| Cara | Posisi beda |
|---|---|
| PostgreSQL bawaan (Windows) | 287 |
| ICU `und-x-icu` | 16 |
| ICU level-1 (tak peka besar/kecil + aksen) | 8 |
| **Pembanding aplikasi `lib/laporan/urutNama.ts`** | **0 (10 dari 10 bulan identik)** |

Alasan: di MySQL tanda baca <code>`</code> dan <code>^</code> tepat setelah spasi (ICU menaruhnya setelah `%`),
dan PostgreSQL mengabaikan kekuatan perbandingan bila `rules` kustom dipakai sehingga tidak bisa
ditambal lewat kolasi. Aturan: tanpa memandang huruf besar/kecil dan aksen; tanda baca (menurut bobot
MySQL) < angka < huruf; spasi ujung diabaikan; seri: byte nama asli (huruf besar dulu), lalu `id`.
Daftar laporan dikirim lengkap ke klien (seperti KDS2), jadi pengurutan di aplikasi tidak merugikan.
Pencarian nama memakai pencocokan substring tak peka huruf besar/kecil di klien, bukan SQL.

## Struktur kode
| Berkas | Isi |
|---|---|
| `lib/laporan/urutNama.ts` | pembanding nama ala MySQL |
| `lib/laporan/periode.ts` | nama bulan, `resolveBulanTahun` (parameter → snapshot terbaru → sekarang WIB), `keInt`, `parameterTerisi` |
| `lib/laporan/filter.ts` | filter Jenis/Status/Keaktifan, `nipNonaktif`, `urutanKodeStatus` |
| `lib/laporan/namaFile.ts` | nama file unduhan sesuai tab + filter |
| `lib/laporan/komponen.ts` | urutan 16 kolom komponen rekap |
| `lib/laporan/ekspor.ts`, `xlsx.ts` | CSV, salin (TSV), header unduhan; penulis .xlsx (server) |
| `components/laporan/TabelLaporan.tsx` | tabel klien: cari, urut, halaman, Salin/CSV/Excel/Cetak |
| `components/laporan/FormLaporan.tsx` | formulir GET periode + filter (tautan dapat dibagikan) |

## Dua cara urut di KDS2 (jangan tertukar)
- **Nominatif, Rekap Bulanan/Tahunan:** `orderBy('nama')` di MySQL -> `urutNama.ts` (kolasi `unicode_ci`).
- **Pegawai Belum Ada Rekap:** `sortBy('nama')` di PHP (Collection) -> `urutPhp.ts` (byte UTF-8, huruf besar
  dulu; dua string angka dibandingkan numerik). Tampilan awal di KDS2 lalu diurut DataTables menurut kolom
  Unit Kerja (huruf kecil, kode UTF-16); halaman ini mengirim data yang sudah dalam urutan tampil itu.
  Tombol Salin/CSV tidak memuat kolom nomor (DataTables KDS2 memuatnya).

## Rekap Bulanan: hal yang menentukan paritas
- **Urutan default** = TK terbanyak, seri menurut urutan baris dari DB. KDS2 tidak memakai ORDER BY, sehingga
  urutan seri bergantung rencana kueri MySQL: filter Non-aktif (`nip IN ...`) -> NIP naik; filter lain -> id
  naik. Ditiru di `laporanRekapBulanan` dan dibuktikan oracle (data nyata: seri di semua bulan).
- **Sel kuning:** `koreksiBerlaku` (periode yang menutup SELURUH bulan, angka mengalahkan periode, koreksi
  dibatalkan diabaikan) + `hitungTandai` (sel asal bila dihapus atau masih > 0, sel tujuan bila > 0).
  `cakupanKoreksi` ada di `lib/domain/koreksi.ts` (dipakai lagi di F4 untuk menerapkan koreksi).
- **Bawaan periode** = bulan berjalan WIB (`periodeBulanBerjalan`), bukan snapshot terbaru; parameter yang ada
  tetapi kosong menjadi 0 seperti (int) PHP. Di Okt 2026 tabel tampil dengan semua sel "-".
- Ekspor Excel: urut nama (bukan TK), sel tanpa rekap = string kosong, judul kolom memakai nama komponen
  (mis. "Σ Hari"); parameter `jenis`/`status` boleh berulang atau `jenis[]`.
- Tautan "Koreksi" dan "Rincian" per baris tampil nonaktif sampai F4.
- Data nyata (2026): 1.956 baris bertanda koreksi, 690 lencana catatan, 122 "Belum ada keterangan"; kasus
  koreksi "dihapus" belum ada di data nyata, dijaga tes sintetis (`tests/integration/rekap-bulanan.test.ts`).

## Rekap Tahunan: keputusan performa dan paritas
**Keputusan: model detail baris-per-komponen DIPERTAHANKAN; tidak perlu tabel ringkasan.** Ukur (13 Okt 2026,
komputer pengembangan, data nyata 2026: 19.185 rekap bulanan, 306.960 baris detail, 2.871 pegawai):
- `totalPerNip` (SUM setahun, 13 komponen angka) ±0,47 dtk, dengan ±0,13 dtk di dalam PostgreSQL
  (rencana: Seq Scan 76 ribu baris detail + Hash Join + HashAggregate; indeks `(tahun,bulan)` dan covering
  index detail sudah ada). Sisanya: mengirim daftar NIP dan membaca ±36 ribu baris hasil.
- `laporanRekapTahunan` utuh ±0,6 dtk; halaman 2.788 baris ±0,85 dtk (dev server) dengan muatan 1,1 MB;
  ekspor Excel ±3 dtk (sebagian besar menulis xlsx 2.788x20 sel). Target F3.4: <= 2 dtk -> terpenuhi.
- Ambang untuk memutuskan ulang: bila SUM tahunan > 2 dtk (mis. data bertahun-tahun dan filter tanpa
  batasan tahun), pertimbangkan ringkasan per (nip, tahun, komponen) yang diisi saat upload. Belum perlu.
- Memakai `CAST` awalan angka seperti MySQL (`'3abc'` -> 3, `'abc'` -> 0); komponen teks tidak dijumlahkan.

Paritas: baris = snapshot terakhir tiap NIP lewat `MAX(id)`; urutan TK setahun + seri (id naik; untuk filter
Non-aktif NIP naik, seperti Rekap Bulanan); sel angka kosong "0" dan teks kosong "-" di halaman, tetapi
SEMUA yang kosong "0" di ekspor Excel (kebiasaan KDS2). **Ekspor Excel diurut `nama` oleh MySQL, dan urutan
antar-nama kembar (huruf besar/kecil/aksen berbeda) TIDAK stabil di KDS2** (pada 2.871 baris tidak mengikuti
id/NIP naik maupun turun) - tes paritas membandingkan kelompok nama kembar sebagai himpunan, isi baris
tetap harus identik per NIP. Di sini urutan seri deterministik (byte nama, lalu id).

## Statistik Dosen dan Tendik
Halaman `/statistik/dosen` dan `/statistik/tendik` (server component, tanpa JavaScript klien; periode bawaan =
snapshot terbaru). Hal yang menentukan angka dan sudah dibuktikan oracle untuk 10 bulan:
- **Dosen memakai INNER JOIN ke jabatan fungsional**: dosen tanpa jabatan fungsional tidak dihitung sama
  sekali (tidak juga di "Jumlah"). Data nyata 2026 tidak memuat kasus ini -> dijaga tes sintetis.
- Unit **UA-179** dikecualikan (ada di bulan 2, 3, 8 data nyata: 2, 41, 47 baris -> tercakup paritas).
- Kolom golongan Dosen dinamis: jabatan dari jenjang tertinggi; golongan PNS tertinggi dulu, lalu skala PPPK
  (romawi), lalu tak dikenal menurut kemunculan; satu kolom "-" bila ada golongan kosong (ada di 3 bulan).
- Pendidikan dicocokkan persis setelah trim PHP (huruf besar/kecil dibedakan); yang di luar daftar
  (11 baris di Okt 2026) hanya ikut "Jumlah". Dosen memakai daftar dengan `Sp1`, Tendik dengan `Profesi`.
- Pengelompokan fakultas/jurusan memakai `sortKeys()` PHP (urut byte, `urutPhp.ts`); jurusan dengan nama
  sama dalam satu fakultas digabung (pengelompokan menurut nama).
- Tabel tidak punya tombol ekspor (sama dengan KDS2); sel 0 pada baris biasa ditampilkan "-", baris total
  menampilkan angka apa adanya.

## Dashboard (halaman Ringkasan, `/`)
Data dari `lib/laporan/dashboard.ts` (`dataDashboard`); grafik Chart.js di klien (`components/dashboard`).
Terbukti sama dengan KDS2 lewat oracle: kartu jumlah pegawai, status upload bulan berjalan (cap waktu WIB
`dd-mm-yyyy HH:mm`), KPI dan empat grafik per jenis untuk 10 bulan, serta Dashboard Kinerja untuk 2026/2025/2027.
Yang menentukan angka:
- **Kartu atas memakai SEMUA baris snapshot terbaru** (mis. 600 akademisi luar), sedangkan **dashboard pegawai
  mengecualikan UA-179** (akademisi luar jadi 169 karena mayoritas ber-unit "belum diketahui"). Perilaku KDS2.
- "Punya jabatan tambahan" = COUNT(DISTINCT snapshot dosen yang punya jabatan tambahan), kueri terpisah tanpa
  pengecualian UA-179.
- Dashboard Kinerja: hanya Dosen+Tendik yang ada di snapshot bulan TERBARU tahun itu; unit induk dari snapshot itu;
  kategori izin = komponen non-Rekap bertipe angka (11 komponen, urutan kode), seri mengikuti kemunculan
  (NIP naik, lalu kode); rata-rata kehadiran = JUMLAH_MASUK_NYATA / SIGMA_HARI.
- Persen memakai `round(...,1)` PHP (pra-pembulatan presisi); total 0 -> 0.
- Grafik pegawai diberi judul singkat (KDS2 tanpa judul); tab Pegawai/Kinerja dan sub-tab Dosen/Tendik/AKL tetap
  memakai tombol seperti KDS2. Tautan upload/tambah pegawai nonaktif sampai F4.
- Catatan tampilan: kolom sidebar 16 rem membuat konten tak terlihat bila jendela sangat sempit (<±500 px).

## Perbedaan disengaja dari KDS2
- `?keaktifan[]=semua` membuat KDS2 galat (PHP "Array to string conversion", halaman 500); di sini
  kembali ke "aktif".
- Tombol tabel: Salin, CSV, **Excel (unduhan server, isi sama dengan ekspor KDS2)**, Cetak (cetak
  browser/PDF). Tombol PDF terpisah tidak ada.
- Tanggal "bulan berjalan" memakai zona WIB.

## Kebiasaan KDS2 yang dipertahankan demi paritas
- Rekap Tahunan memilih snapshot terakhir pegawai lewat `MAX(id)`, bukan bulan terbesar (id dipertahankan di F2).
- Rekap Bulanan/Belum Upload memakai bulan **berjalan** bila parameter kosong (di Okt 2026 hasilnya
  kosong karena rekap Okt belum ada); Nominatif dan Statistik memakai snapshot terbaru.
- Statistik dan Dashboard mengecualikan unit `UA-179`.

## Status langkah
- [x] F3.0 Dasar (oracle, urutan nama, pembantu, tabel, ekspor, formulir)
- [x] F3.1 Nominatif (kode + paritas + pemeriksaan di browser: cari, urut, detail, Excel, 404) · [x] F3.2 Belum Upload (paritas 10 bulan + browser) · [x] F3.3 Rekap Bulanan (paritas + browser) · [x] F3.4 Rekap Tahunan (paritas + browser + keputusan performa)
- [ ] F3.5 Statistik · [x] F3.6 Dashboard (paritas + browser) · [x] F3.7 Penutup (paritas penuh, kinerja stabil, dokumentasi)

## Keamanan: pelajaran dari pemeriksaan F3.1
Perlindungan halaman semula hanya dari `app/(app)/layout.tsx`; `proxy.ts` TIDAK memaksa login karena
`authConfig` tidak punya callback `authorized` (terbukti: unduhan tanpa login hanya ditolak oleh
pemeriksaan di rute itu sendiri). Sekarang `authorized` ada (`lib/auth.config.ts`, dites), sehingga
semua rute di luar matcher (login, `/api/auth`, aset) diarahkan ke `/login` bila belum masuk.
**Aturan: setiap Route Handler tetap wajib memeriksa `auth()` sendiri** (pertahanan berlapis), dan
rute baru yang sengaja publik harus dikecualikan di matcher `proxy.ts` dengan alasan tertulis.

## Pemeriksaan visual dengan data asli
`npm run dev:paritas` (atau konfigurasi `kds-terpadu-paritas` di `.claude/launch.json`) menjalankan server di port 3001 dengan database `kds_paritas`. Login dengan akun admin lokal (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` di `.env`).

## Penutup F3 (13 Okt 2026)

### Inventaris: apa yang sudah dibuktikan sama dengan KDS2
| Modul | Halaman | Dibandingkan terhadap kode KDS2 asli (oracle) | Cakupan data nyata |
|---|---|---|---|
| Nominatif | `/nominatif`, `/nominatif/[id]`, ekspor | daftar + urutan + nama file (10 bulan), detail SEMUA 2.788 snapshot bulan terbaru + sampel, ekspor 15 kasus | 25.705 snapshot |
| Belum Ada Rekap | `/rekap-kehadiran/belum-upload` | angka, ringkasan per unit berurutan, tiap baris (10 bulan) | 4 tidak aktif (Sep), 2.188 belum (Okt) |
| Rekap Bulanan | `/rekap-kehadiran/bulanan`, ekspor | urutan TK + seri, nilai, lencana, sel koreksi, koreksi berlaku, ekspor | 102.190 baris x 108 kombinasi filter |
| Rekap Tahunan | `/rekap-kehadiran/tahunan`, ekspor | MAX(id), urutan TK setahun, total semua komponen, lencana, ekspor | 20.512 baris x 63 kombinasi |
| Statistik | `/statistik/dosen`, `/statistik/tendik` | setiap sel, kolom dinamis, fakultas/jurusan, total (10 bulan) | UA-179 di 3 bulan, golongan PPPK |
| Dashboard | `/` | kartu, status upload, KPI + grafik x 3 jenis x 10 bulan, kinerja 3 tahun | 29 persen desimal, 13 seri |
| Ekspor Excel | semua | 66.730 baris x 48 berkas pada rangkaian penuh | — |

Dua lapis tes: (1) per-modul, selalu ikut `npm test`; (2) rangkaian PENUH semua kombinasi filter
(`npm run test:paritas-penuh`, ±3 menit, opsional karena lambat). Kasus yang tidak ada di data nyata dijaga tes
sintetis di `kds_test` (koreksi "dihapus", dosen tanpa jabatan fungsional, `MAX(id)`, `CAST` awalan angka, "Lainnya").

### Perintah
| Perintah | Fungsi |
|---|---|
| `npm test` | seluruh tes (paritas dilewati dengan pesan bila prasyarat tidak ada) |
| `npm run test:paritas-penuh` | semua kombinasi filter terhadap oracle (opsional, lambat) |
| `npm run ukur-kinerja` | waktu hitung semua laporan terhadap `kds_paritas` |
| `npm run dev:paritas` | server di port 3001 dengan data asli lokal, untuk pemeriksaan visual |

### Kinerja akhir (komputer pengembangan, data nyata 2026; terbaik dari 5 kali jalan, lapisan data)
| Laporan | ms | Baris |
|---|---:|---:|
| Nominatif daftar Okt | 70 | 2.788 |
| Nominatif detail satu pegawai | 4 | - |
| Nominatif data ekspor | 185 | 2.788 |
| Belum Ada Rekap Okt | 55 | 2.188 |
| Rekap Bulanan Sep (aktif / semua) | 357 / 350 | 2.786 / 2.790 |
| Rekap Bulanan data ekspor | 429 | 2.786 |
| Rekap Tahunan 2026 (aktif / semua) | 587 / 591 | 2.788 / 2.871 |
| Rekap Tahunan data ekspor | 687 | 2.788 |
| Statistik Dosen / Tendik | 43 / 22 | 11 / 37 |
| Dashboard bawaan | 893 | - |
| Ekspor + tulis xlsx: Tahunan / Bulanan | 1.014 / 762 | 2.788 / 2.786 |
Semua di bawah target 2 dtk. Waktu render halaman ditambah ±0,2–0,4 dtk (dev server).

### Temuan kinerja terpenting: rencana generik PostgreSQL
Pengukuran satu kali jalan tidak menangkapnya: setelah ±5 eksekusi, PostgreSQL mengganti rencana prepared
statement yang sama dengan rencana GENERIK. Untuk kueri SUM (join detail rekap + `nip = ANY($n)`) rencana itu
±3x lebih lambat (Rekap Tahunan 600 -> 1.600 ms, Dashboard 930 -> 2.600 ms) sehingga laporan terasa normal
lalu melambat setelah beberapa kali dibuka. Perbaikan: `lib/laporan/kueri.ts` (`kueriRencanaKustom`) menjalankan
kueri berat dengan `SET LOCAL plan_cache_mode = force_custom_plan` di dalam transaksi (tidak bocor, aman dengan
pooler transaksi seperti Neon). Dijaga `tests/paritas/kinerja-stabil.test.ts` (eksekusi terlambat < 2x tercepat)
dan `tests/integration/kueri-rencana.test.ts`. **Aturan: kueri agregat mentah yang berat WAJIB lewat pembantu itu**
(ingat juga untuk modul tulis F4 bila ada agregat sejenis). Alternatif tingkat konfigurasi:
`statement_cache_size=0` pada `DATABASE_URL` (tidak dipilih karena mudah terlupa di lingkungan baru).

### Utang teknis dan UX yang dicatat (bukan paritas)
1. Sidebar tetap 16 rem: konten tak terlihat di jendela <±500 px. Perlu sidebar yang bisa menciut (ponsel/tablet).
2. Kartu "Akademisi Luar" di Ringkasan (600) berbeda dari dashboard AKL (169, tanpa UA-179): perilaku KDS2 yang
   dipertahankan; mungkin perlu penjelasan di layar.
3. Default periode berbeda antar halaman (Rekap Bulanan = bulan berjalan, lainnya = snapshot terbaru): dipertahankan
   demi paritas; kandidat perbaikan UX setelah cutover.
4. Pengurutan nama dilakukan di aplikasi (`urutNama.ts`/`urutPhp.ts`) karena kolasi PostgreSQL tidak bisa persis;
   bila daftar menjadi jauh lebih besar (>±20 ribu baris per laporan), pertimbangkan penomoran halaman sisi server.
5. Ekspor Excel ±1 dtk untuk 2.800 baris (penulisan xlsx dominan); cukup untuk sekarang.
6. `npm audit`: Next sudah dinaikkan ke 16.4.0 (13 Okt 2026) sehingga celah kritis di next/og tertutup; tersisa 5 non-kritis
   (`prisma` CLI -> `deepmerge-ts`, `exceljs` -> `uuid`) yang tidak berdampak langsung (alat pengembangan / pemakaian tanpa buffer).

## Peninjauan `npm audit` (14 Okt 2026)
- Sebelum: 13 temuan (2 critical, 8 high, 3 moderate). Dinaikkan **vitest 3 -> 5.0.4** dan **@types/node 20 -> 22.19.19** (cocok dengan Node 22; vitest 5 mewajibkannya): kedua temuan critical (vitest/tinypool, hanya alat uji lokal) hilang; 562 tes, lint, typecheck, build tetap hijau. Sesudah: **10 temuan (8 high, 2 moderate)**, semua diputuskan diterima:
  - `prisma` CLI -> `@prisma/config` -> `deepmerge-ts` (high, stack exhaustion saat menggabungkan konfigurasi): hanya alat pengembangan (migrasi) yang dijalankan manual dengan berkas konfigurasi sendiri; bukan kode yang melayani permintaan. "Perbaikan" yang ditawarkan menurunkan prisma ke 6.12 (mundur dari 6.19), jadi tidak diikuti.
  - `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob/micromatch/braces` (high, DoS pola glob): hanya saat lint di komputer pengembang. "Perbaikan" menurunkan ke eslint-config-next 14, jadi tidak diikuti.
  - `exceljs` -> `uuid` (moderate, batas buffer pada uuid v3/v5/v6 bila argumen `buf` diberikan): exceljs tidak memberi argumen itu; isi berkas unggahan tidak mempengaruhinya. Tidak ada versi exceljs yang memperbaikinya selain `3.4.0` (mundur jauh).
  - Tinjau lagi bila prisma/eslint-config-next menerbitkan versi yang memperbaikinya.
