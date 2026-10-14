# F5.4: kesiapan sebelum KDS2 dimatikan (F6) dan sebelum data asli masuk internet

Disusun 14 Okt 2026 dengan membandingkan semua rute dan layanan KDS2 (`routes/web.php`, controller, perintah artisan, model auth)
terhadap KDS Terpadu. Bahasa sengaja sederhana. **Bobot**: R rendah, S sedang, T tinggi.

## 1. Fitur KDS2 yang SUDAH ada di Terpadu (diperiksa satu per satu)
| KDS2 | Terpadu | Bukti |
|---|---|---|
| Dashboard (`/dashboard`) | `/` | F3, paritas oracle |
| Nominatif: daftar, detail, ekspor, tambah manual, upload + hasil, template | `/nominatif`, `/nominatif/[id]`, `/nominatif/export`, `/nominatif/baru`, `/nominatif/upload`, `/nominatif/upload/hasil/[id]`, `/nominatif/upload/template` | F3, F4.3, paritas |
| Rekap: upload + hasil + template, bulanan, tahunan (+ekspor), belum ada rekap, individual, massal (cetak, Excel) | `/rekap-kehadiran/...` (semua rute ada) | F3, F4.1, F4.4, paritas |
| Koreksi Rekap: daftar, pratinjau, simpan, terapkan ulang, impor Excel, template, batalkan | `/koreksi-rekap` (+ `/template`) | F4.2, paritas |
| Statistik Dosen dan Tendik | `/statistik/dosen`, `/statistik/tendik` | F3, paritas |
| Perintah `php artisan nominatif:periksa` | tahap **Periksa** pada semua halaman unggah | F4 |
| Audit log perubahan manual | `audit_log` (tambah pegawai, koreksi, Review, hapus) | F4 |
| Standarisasi KDS1 (upload, Review, kamus, bandingkan, hapus pegawai) | `/standarisasi`, `/kamus`, `/bandingkan` | F4.5 |

## 2. Celah yang ditemukan
### A. Wajib sebelum data asli boleh di internet (jalur B, hosting)
| # | Celah | Keadaan | Bobot | Catatan |
|---|---|---|---|---|
| A1 | **Pembatasan percobaan login** (**SELESAI 14 Okt 2026**) | KDS2 memblokir setelah 5 percobaan gagal (Breeze `RateLimiter`). Terpadu: **tidak ada**; siapa pun di internet bisa menebak kata sandi tanpa batas | S | Satu admin + internet = risiko utama. Usulan: hitung gagal per email di database, kunci 15 menit setelah 5 kali, catat di audit |
| A2 | **Halaman Akun: ganti kata sandi** (**SELESAI 14 Okt 2026**) | KDS2 punya `/profile`. Terpadu: kata sandi hanya dari seed (`SEED_ADMIN_PASSWORD`), tidak bisa diganti dari aplikasi | S | Syarat `docs/07` §1 ("kata sandi admin kuat") tidak bisa dipenuhi tanpa ini kecuali lewat seed ulang |
| A3 | **Reset kata sandi darurat** (**SELESAI 14 Okt 2026**) | KDS2: lupa-kata-sandi lewat email (Breeze). Terpadu: tidak ada, dan email belum disiapkan | R | Cukup skrip lokal `npm run admin:reset-sandi` yang dijalankan pemilik server dengan akses database; tanpa email |
| A4 | **Header keamanan HTTP** (**SELESAI 14 Okt 2026**, tanpa script-src) | Belum diatur (`next.config.ts`/`vercel.json` tanpa header) | R | X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; CSP bertahap (grafik/inline perlu diuji) |
| A5 | **Cadangan terjadwal** | Skrip `scripts/cadangan` sudah diuji, tapi belum dijadwalkan | R | Jadwal (Windows Task Scheduler atau GitHub Actions ke Drive); syarat `docs/07` §1 |
| A6 | **Batas ukuran dan waktu di Vercel nyata** | Diuji hanya lokal | S | Uji unggah 6,7 MB per potongan dan satu Simpan Standarisasi dengan data sintetis di proyek Vercel/Neon sungguhan |
| A7 | **Latensi database** | Kueri laporan terbukti < 1 dtk lokal; Neon di Singapura dari Malang belum diukur | S | Ukur Rekap Tahunan dan Statistik; `kueriRencanaKustom` wajib tetap dipakai |
| A8 | **Muat data di Neon Free (0,5 GB)** | Belum diukur | S | Ukur ukuran `kds_paritas` (±330 ribu baris) + pertumbuhan 12 bulan; pemicu pindah paket di `docs/07` §8 |

### B. Sebelum KDS2 dimatikan (F6)
| # | Celah | Bobot | Catatan |
|---|---|---|---|
| B1 | **Catatan Status Pegawai** (Pensiun, Resign, Meninggal dunia, Habis kontrak, batal masuk) | R-S | Di KDS2 juga tidak ada layar: dibuat lewat migrasi/SQL saja. Terpadu membacanya (badge, filter Keaktifan) tetapi belum bisa menambah. Usulan: halaman kecil tambah/ubah catatan beserta audit; atau tetap lewat skrip bila jarang |
| B2 | **Dump akhir KDS2** dan arsip | R | Sebelum dimatikan: dump MySQL terakhir ke Drive (`...\bak`), simpan beserta kode Laravel |
| B3 | **Penutupan KDS1 di Neon** | R | Setelah Kamus dan Catatan termigrasi (F4.5c), simpan cadangan akhir Neon KDS1 lalu hentikan proyek; ini tindakan pihak ketiga: minta persetujuan Anda |
| B4 | **Panduan pemakaian singkat** alur baru (berkas mentah SIMPEGA -> Standarisasi -> Review -> Rekap -> Koreksi) | R | Satu halaman bergambar untuk admin pengganti; belum ada |
| B5 | **Keputusan data yang menggantung** | S | Golongan Non-ASN (594 baris), 2 tanggal mulai kerja, 1 jabatan tambahan (`docs/09` §9); 56 Akademisi Luar perlu konfirmasi identitas tiap bulan |
| B6 | **Seed produksi memuat 6 unit asrama** | R | Master `kds_paritas` sudah ditambah; seed/migrasi produksi harus menyusul agar Kamus hasil migrasi valid |
| B7 | **Default periode antar halaman berbeda** | R | Dipertahankan demi paritas; ubah setelah cutover bila diinginkan |

### C. Sengaja tidak dibawa
| KDS2 | Alasan |
|---|---|
| Registrasi, verifikasi email, hapus akun (`/profile` DELETE), konfirmasi kata sandi | Satu admin tetap; akun dibuat lewat seed |
| UI CRUD master data | Non-goal (master lewat seed/migrasi); pengecualian yang sudah ada: tambah unit/role/prodi dari layar Review (docs/08) |
| Antrean/queue Laravel, cache, sesi di database | Tidak dibutuhkan (satu pengguna; JWT; unggah sinkron) |
| Unduh "Nominatif Bulanan .xlsx" per batch KDS1 (arsip) | Snapshot langsung menjadi Nominatif dan bisa diekspor dari `/nominatif/export` |

## 3. Urutan pengerjaan yang disarankan
1. **A1 + A2 + A3 + A4** (satu paket "keamanan akun", sekitar sehari): login dibatasi, halaman Akun, skrip reset, header keamanan. Murni kode lokal, dengan tes; tidak menyentuh pihak ketiga.
2. **B1** bila Anda ingin layarnya (kalau tidak, dicatat sebagai skrip).
3. **A5** (jadwal cadangan) bersama A6-A8 saat jalur B dimulai (butuh akun Vercel/Neon dan persetujuan Anda).
4. **B2-B4, B6** saat F6 mendekat.

## 4. Paket keamanan akun (selesai 14 Okt 2026)
- **Login dibatasi**: 5 kali salah beruntun mengunci akun 15 menit (setara KDS2). Selama terkunci, kata sandi yang BENAR pun ditolak (supaya penebak tidak tahu kapan tebakannya benar) dan percobaan tidak memperpanjang kunci. Berhasil masuk menghapus hitungan. Email tak dikenal dan kata sandi salah tampil sama (waktu pemeriksaan disamakan). Layar login menampilkan pesan khusus saat terkunci. Penguncian dicatat di `audit_log` (tanpa kata sandi). Kolom baru di tabel `user`: `gagalMasuk`, `terkunciSampai`, `sandiDiubahPada` (migrasi `keamanan_akun`, sudah diterapkan ke `kds_dev`, `kds_test`, `kds_paritas`, `kds_f5`; belum ke database produksi karena belum ada).
- **Halaman Akun** (`/akun`, dari kartu nama di sidebar): ganti nama dan ganti kata sandi. Aturan kata sandi baru: minimal 12 karakter, memuat huruf dan angka, tidak memuat bagian email, berbeda dari yang lama. Kata sandi lama diperiksa lewat jalur yang sama dengan login, jadi menebaknya dari sesi yang tertinggal ikut mengunci akun. Audit mencatat penggantian tanpa menyimpan kata sandi.
- **Reset darurat**: `npm run admin:reset-sandi -- <email>` (terminal, kata sandi diketik tersembunyi dua kali, tanpa email, membuka kunci, mengikuti aturan yang sama, audit "sistem (skrip reset darurat)"). Untuk database produksi, pemilik mengisi `DATABASE_URL` sementara di terminalnya sendiri.
- **Header keamanan** untuk semua halaman: `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, dan CSP yang hanya membatasi bingkai/form/base/object. CSP `script-src` ketat sengaja belum diaktifkan: butuh nonce per permintaan dan uji terpisah supaya tidak merusak halaman Next.
- **Bukti**: 8 tes integrasi (waktu dikendalikan; tiga perusakan sengaja pada logika kunci terdeteksi) + 2 tes header; di browser: header tampil pada respons, lima percobaan salah pada akun uji menghasilkan pesan terkunci, halaman Akun menolak konfirmasi tak sama. Seluruh 590 tes, lint, typecheck, dan build hijau.
- **Belum**: pembatasan per alamat IP (Vercel menyembunyikan IP asli di balik proxy; kunci per akun sudah cukup untuk satu admin), pemaksaan keluar semua sesi lama saat kata sandi diganti (sesi JWT tetap berlaku sampai habis), dan 2FA aplikasi (syarat `docs/07` memakai 2FA di GitHub/Vercel/Neon, bukan di aplikasi).
