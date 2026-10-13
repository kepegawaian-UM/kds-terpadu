# KDS Terpadu — Brief Proyek untuk Claude Code

> Dokumen ini dibaca pertama kali oleh setiap sesi Claude Code di folder ini. Perbarui bagian **Status** di akhir
> setiap kali ada keputusan atau kemajuan. Balas pengguna dalam **Bahasa Indonesia**.

## 1. Apa ini
**KDS Terpadu** = aplikasi tunggal yang menyatukan **KDS1** (standarisasi nominatif) dan **KDS2** (arsip nominatif +
rekap kehadiran) milik Seksi **K**inerja, **D**isiplin, dan **S**istem Informasi (KDS), Subdirektorat Sumber Daya Manusia,
Universitas Negeri Malang (UM). (Arti "KDS" disimpulkan dari nama unit atasan pengguna di data sumber: "Seksi Kinerja,
Disiplin, dan Sistem Informasi". Nama "KDS Terpadu" adalah nama kerja; ganti bila pengguna memutuskan lain — rename
folder/repo/`package.json` saja.)

Pengguna aplikasi: **admin SDM pusat saja** (single-role, tanpa approval workflow). Data: ±2.200 pegawai Dosen dan
Tendik + ±600 Akademisi Luar UM, diinput bulanan lewat file Excel. Sifatnya **arsip historis terstandardisasi**, bukan
cermin kondisi terkini (itu tugas SIMPEGA resmi universitas — JANGAN memakai kata "SIMPEGA" sebagai nama aplikasi ini).

## 2. Keputusan yang sudah diambil
| Hal | Keputusan |
|---|---|
| Arah | Satu aplikasi **Next.js (App Router) + TypeScript + Prisma + PostgreSQL**; Laravel KDS2 ditulis ulang bertahap lalu dimatikan |
| Auth | NextAuth (Credentials), satu peran admin — sama dengan KDS1 |
| Excel | `exceljs` (baca dan tulis); cetak PDF lewat CSS `@media print` di browser (cara yang sama dengan KDS2) |
| UI | Tailwind CSS; bahasa antarmuka Indonesia; zona waktu **Asia/Jakarta (WIB)** |
| Hosting | **Belum final.** Rencana awal: Vercel (wilayah `sin1`) + PostgreSQL (Neon dulu, Supabase opsional). Alternatif: server UM. Jangan mengunci diri ke satu vendor: semua lewat `DATABASE_URL` + Prisma |
| KDS2 Laravel | Tetap berjalan **lokal** di komputer pengguna selama transisi, dan menjadi **kunci jawaban** (lihat §5) |
| Bahasa kode | Identifier domain memakai istilah Indonesia seperti di KDS1/KDS2 (`nominatifBulanan`, `rekapKehadiran`, `koreksiRekap`); komentar boleh Indonesia |

## 3. Referensi (BACA SAJA, jangan diubah dari proyek ini)
| Apa | Lokasi |
|---|---|
| KDS2 (Laravel, sumber kebenaran perilaku) | `D:\ANAS\Project\Sistem Kepegawaian UM` — baca `CLAUDE.md`, `Skema_Database_SIMPEGA_UM.md`, `app/Services/*`, `tests/Feature/*` |
| KDS1 (Next.js + Prisma, fondasi kode) | `D:\ANAS\Project\tool-standardisasi-nominatif-simpega-um` — baca `README.md`, `prisma/schema.prisma`, `lib/**`, `prisma/seed-data/*.json` |
| Data KDS2 lokal (MySQL) | database `kds2_produksi` (root tanpa password, port 3306); server lokal `http://localhost:8001` |
| Backup | `G:\My Drive\_OLD ARCHIVE\__ANAS\bak` |

Akses ke folder referensi harus diminta lewat `request_directory` (atau `/add-dir`) di awal sesi. **Jangan menyalin data
pegawai (NIP, nama) ke repo ini.** Yang boleh masuk repo hanya data master (unit, prodi, jabatan, golongan, dst).

## 4. Aturan bisnis inti (ringkasan dari KDS2 — baca `CLAUDE.md` KDS2 untuk lengkapnya)
1. **Nominatif = arsip snapshot bulanan.** Satu baris per NIP per bulan/tahun (unik `nip+bulan+tahun`). Tabel `pegawai` hanya jangkar identitas.
2. Satu pegawai = satu Jenis Pegawai per snapshot. **Jabatan Tambahan maks 3 slot** per bulan; Dasar Remunerasi memakai slot pertama (prioritas: Jabatan Tambahan, lalu Jabatan Fungsional, lalu Fungsi Umum Pelaksana).
3. Upload Nominatif bulanan mencerminkan **seluruh** pegawai aktif bulan itu; NIP yang tidak muncul dianggap tidak aktif. Kolom master dicocokkan **by NAMA** (abaikan huruf besar/kecil dan koma). Header file dicek (kolom bergeser = file ditolak).
4. **Rekap Kehadiran Bulanan**: 22 kolom (komponen `SIGMA_HARI, I, S, SD, TD, TB, TK, CTH, CTM, CTB, CAP, CTLN, TOTAL, JUMLAH_MASUK_NYATA, JENIS_SHIFT, CUTI_ANAK_KE`). NIP tak dikenal dilewati; **validasi TMT** (bulan sebelum TMT ditolak, bulan TMT sendiri diterima); **Akademisi Luar tidak masuk Rekap**; peringatan (bulan tak cocok, TOTAL ≠ JUMLAH_MASUK_NYATA) tidak menggagalkan baris. Re-upload mengganti data bulan itu.
5. **Rekap Tahunan** dihitung `SUM()` on-the-fly dari rekap bulanan, tanpa tabel sendiri.
6. **Koreksi Rekap** (jenis `periode` dan `angka`) diterapkan ulang otomatis setelah tiap upload rekap; koreksi `angka` menang atas `periode` pada bulan yang sama.
7. Filter **Keaktifan** (Aktif/Non-aktif/Semua) pada laporan; "non-aktif" = tidak ada di snapshot bulan terakhir tahun itu atau tercatat di `catatanStatusPegawai` (hanya untuk tahun terbaru).
8. **Audit log** hanya untuk perubahan manual; upload massal cukup jejak `uploadBatch` + `barisBermasalah`.
9. Golongan: ASN wajib; Non-ASN (PTNA/CPTNA) opsional dan disimpan bila ada dan valid; PTT/Akademisi Luar kosong.

## 5. Cara bekerja
- **KDS2 adalah kunci jawaban.** Setiap modul yang selesai harus punya **tes paritas**: data yang sama → angka yang sama dengan KDS2 (bandingkan terhadap MySQL `kds2_produksi`). Jangan menganggap modul selesai sebelum paritasnya terbukti.
- Kerjakan **per modul**, mulai yang hanya-baca (risiko rendah), baru modul penulis/upload. Urutan di `docs/01-rancangan.md`.
- **Batas Vercel** harus dirancang dari awal (bukan belakangan): body permintaan maks 4,5 MB, durasi fungsi terbatas, tanpa filesystem tetap. File mentah SIMPEGA 6,7 MB dan impor 2.800 baris ada di jalur kritis. Pola KDS1 (`app/api/upload-chunk`, model `UploadChunk`) sudah menjawab sebagian; evaluasi dulu sebelum memutuskan.
- Tes otomatis wajib untuk logika bisnis (importer, validasi, koreksi, agregasi). Perbaikan bug = tulis tes yang gagal dulu.
- Rahasia hanya di `.env` (tidak di-commit). Jangan menulis kredensial ke chat atau berkas.
- Tindakan yang menyentuh layanan pihak ketiga (membuat akun, proyek Vercel/Neon, deploy, menulis ke database produksi) **minta persetujuan pengguna dulu**; pengguna adalah pemula di bidang infrastruktur, jelaskan dengan bahasa sederhana.
- Perubahan data produksi (KDS2 lokal maupun nanti) selalu: dry-run → backup → eksekusi dalam transaksi → verifikasi → catat.

## 6. Status (perbarui terus)
- [x] F0 Persiapan (selesai 13 Okt 2026): nama final KDS Terpadu; repo GitHub privat https://github.com/kepegawaian-UM/kds-terpadu (akun `kepegawaian@um.ac.id`, push pertama commit 7c7977d); PostgreSQL 18 lokal dengan `kds_dev` dan `kds_test`. Vercel/Neon DITUNDA sampai sebelum F4 (hosting belum diputuskan).
- Keputusan 13 Okt 2026: kode KDS1 boleh disalin (tanpa riwayat git); basis Next 16 / React 19 / Prisma 6 seperti KDS1; akses MySQL `kds2_produksi` hanya SELECT (hanya agregat, tanpa menyalin NIP/nama ke repo); data uji sintetis.
- [ ] F1 Fondasi (hampir selesai, 13 Okt 2026): kerangka Next 16 + auth/login/layout; `prisma/schema.prisma` gabungan (id Int untuk tabel asal KDS2 agar id bisa dipertahankan di F2, cuid untuk tabel khusus KDS1); migrasi `fondasi_gabungan` + seed jalan di `kds_dev` dan `kds_test`; seed master dihasilkan dari `kds2_produksi` lewat `scripts/ekspor-master-kds2.ts` (seed KDS1 ternyata beda dari KDS2); 23 tes lulus termasuk paritas 12 tabel master vs KDS2; lint/typecheck/build bersih; login salah ditolak dan rute terlindungi terbukti di browser. **Sisa:** konfirmasi login benar + tombol Keluar (dites pengguna), `prisma migrate reset` dari kosong (butuh persetujuan eksplisit pengguna), tinjau 14 kerentanan `npm audit`. `lib/services/*`, `exportNominatif.ts`, `exportBandingkan.ts` SENGAJA belum disalin dari KDS1 (terikat id string; dipindah di F4). Catatan: Prisma menolak `migrate reset` oleh AI tanpa persetujuan eksplisit; kredensial login uji ada di `.env` lokal dan tidak boleh dibaca ke chat.
- [x] F2 Data (selesai 13 Okt 2026, belum di-commit): `scripts/migrasi-kds2.ts` + `scripts/verifikasi-migrasi.ts` (lihat `docs/04-migrasi-f2.md`). Salinan data asli ada di database lokal `kds_paritas` (TIDAK di repo/Neon/Vercel). 10 tabel domain identik baris demi baris dengan `kds2_produksi` (±330 ribu baris, ±30 detik), agregat/jam WIB/sequence cocok; verifikasi terbukti mendeteksi kerusakan satu sel. 46 tes lulus. Temuan: jenis batch `kehadiran_manual` (belum terdokumentasi), id punya celah (sequence disetel ke AUTO_INCREMENT), `setval` tidak ikut rollback (dry-run tidak menerapkan sequence), collation MySQL `unicode_ci` vs PostgreSQL (urutan/pencarian nama di F3). Data KDS1 (Neon) ditunda ke F4. **Sisa F1 yang terbuka:** `migrate reset` dari kosong (butuh persetujuan), `npm audit`.
- [ ] F3 Modul baca: Nominatif, Rekap Bulanan/Tahunan, Statistik, Dashboard. **F3.0 Dasar selesai (13 Okt 2026, belum di-commit):** oracle paritas = kode KDS2 asli dijalankan via PHP read-only (`scripts/oracle/kds2-oracle.php`, `tests/support/oracle.ts`); urutan nama via pembanding aplikasi `lib/laporan/urutNama.ts` (0 beda dari 25.705 baris; kolasi PostgreSQL tidak bisa persis); pembantu laporan (periode, filter, nama file) terbukti sama dengan KDS2; komponen `TabelLaporan` (TanStack Table v8) + `FormLaporan` + ekspor CSV/Excel. 103 tes lulus. **F3.1 Nominatif selesai kode+tes (13 Okt 2026, belum di-commit; tampilan diperiksa di browser dengan data asli: cari/urut/detail/Excel/404 berfungsi; ditemukan dan diperbaiki: proxy tidak memaksa login, kini ada callback `authorized`; Route Handler wajib cek `auth()` sendiri):** daftar/detail/ekspor Excel terbukti sama dengan KDS2 (10 bulan; detail SEMUA 2.788 snapshot bulan terbaru + sampel; 15 kasus ekspor); temuan: tanggal lahir bertahun <1000 di data sumber (format 'Y' PHP berpadding 4 digit). Server pemeriksaan visual: `kds-terpadu-paritas` (port 3001, database kds_paritas). Detail dan langkah F3.2–F3.7: `docs/05-f3-laporan.md`. Keputusan pengguna 13 Okt: oracle PHP disetujui, tombol tabel Salin/CSV/Excel(server)/Cetak, Chart.js untuk Dashboard, default bulan tiru KDS2.
- [ ] F4 Modul tulis: Upload Nominatif (+standarisasi KDS1), Upload Rekap, Koreksi, Rekap Individual
- [ ] F5 Paralel dengan KDS2 selama ≥2 siklus bulanan
- [ ] F6 Cutover dan matikan Laravel

Catatan keputusan terbuka: hosting final (Vercel+Neon vs server UM), apakah Supabase wajib atas arahan atasan,
akun mana yang memiliki Vercel/DB (disarankan akun institusi, bukan pribadi).
