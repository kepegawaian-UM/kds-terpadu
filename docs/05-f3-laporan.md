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
- [x] F3.1 Nominatif (kode + paritas + pemeriksaan di browser: cari, urut, detail, Excel, 404) · [x] F3.2 Belum Upload (paritas 10 bulan + browser) · [x] F3.3 Rekap Bulanan (paritas + browser) · [ ] F3.4 Rekap Tahunan
- [ ] F3.5 Statistik · [ ] F3.6 Dashboard · [ ] F3.7 Penutup (paritas penuh, performa)

## Keamanan: pelajaran dari pemeriksaan F3.1
Perlindungan halaman semula hanya dari `app/(app)/layout.tsx`; `proxy.ts` TIDAK memaksa login karena
`authConfig` tidak punya callback `authorized` (terbukti: unduhan tanpa login hanya ditolak oleh
pemeriksaan di rute itu sendiri). Sekarang `authorized` ada (`lib/auth.config.ts`, dites), sehingga
semua rute di luar matcher (login, `/api/auth`, aset) diarahkan ke `/login` bila belum masuk.
**Aturan: setiap Route Handler tetap wajib memeriksa `auth()` sendiri** (pertahanan berlapis), dan
rute baru yang sengaja publik harus dikecualikan di matcher `proxy.ts` dengan alasan tertulis.

## Pemeriksaan visual dengan data asli
`npm run dev:paritas` (atau konfigurasi `kds-terpadu-paritas` di `.claude/launch.json`) menjalankan server di port 3001 dengan database `kds_paritas`. Login dengan akun admin lokal (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` di `.env`).
