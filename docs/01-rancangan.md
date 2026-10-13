# Rancangan KDS Terpadu

Dokumen kerja. Angka waktu adalah perkiraan kasar, bukan janji.

## 1. Titik awal: apa yang sudah ada

| | KDS1 (Next.js) | KDS2 (Laravel) |
|---|---|---|
| Fungsi | Merapikan export mentah SIMPEGA (85+ kolom) menjadi file Nominatif Bulanan; antrean review; kamus pemetaan; bandingkan batch | Arsip Nominatif bulanan, Rekap Kehadiran, Koreksi, laporan, Rekap Individual, Statistik, Dashboard |
| Teknologi | Next.js 16, TypeScript, Prisma, PostgreSQL, NextAuth, exceljs | PHP 8.3, Laravel 13, MySQL 8, Blade + Tailwind, maatwebsite/excel |
| Skala | ±49 berkas kode, 63 commit, skema 337 baris | 31 tabel, 122 tes, ±25 halaman |
| Hosting | Vercel + Neon | Komputer lokal pengguna (sebelumnya Railway) |

**Tumpang tindih data sangat besar.** Skema Prisma KDS1 sudah punya: seluruh tabel master (jenis pegawai, status,
golongan, jabatan fungsional dosen/tendik/fungsi umum, jabatan tambahan role, unit induk, unit asal, program studi,
kategori akademisi luar), `Pegawai`, `NominatifBulanan`, `NominatifBulananJabatanTambahan`, `UploadBatch`,
`BarisBermasalah`, `AuditLog`, `User`. Yang **belum ada** dan harus ditambah dari KDS2: `RekapKehadiranBulanan` +
detail, `KoreksiRekap`, `CatatanStatusPegawai`, master `KomponenKehadiran`, dan konsep pelaporan (tahunan, individual, statistik).

Konsekuensi: penyatuan terutama adalah **menambah modul rekap dan laporan ke fondasi KDS1**, bukan membangun dari nol.

## 2. Arsitektur target
- Satu aplikasi Next.js (App Router), satu database PostgreSQL, satu login.
- Modul sebagai folder rute: `standarisasi` (KDS1), `nominatif`, `rekap-kehadiran` (upload, bulanan, tahunan, individual, belum-upload), `koreksi-rekap`, `statistik`, `dashboard`.
- Lapisan domain di `lib/domain` (aturan murni, mudah dites) dan `lib/services` (akses database), mengikuti pola KDS1.
- Excel: `exceljs` untuk baca/tulis. Laporan cetak: halaman HTML + CSS `@media print`, sama dengan KDS2.
- Tabel laporan: pilih satu pustaka tabel sisi-klien (mis. TanStack Table) yang mendukung pencarian, urut, dan ekspor; keputusan di F3.

## 3. Masalah teknis yang harus dijawab lebih dulu
1. **Upload besar di Vercel.** Batas body 4,5 MB; file mentah SIMPEGA 6,7 MB. KDS1 punya `upload-chunk`. Putuskan: unggah per potongan, parsing di browser, atau penyimpanan objek.
2. **Impor 2.800 baris dalam satu permintaan.** Di KDS2 butuh ±7 detik (setelah dioptimalkan). Pastikan di Vercel tidak melewati batas durasi; bila perlu pecah per potongan dan simpan progres.
3. **Rekap Tahunan on-the-fly** berarti `SUM` atas ±300 ribu baris detail per tahun. Di PostgreSQL perlu indeks yang tepat atau bentuk simpanan yang lebih ringkas; ukur sebelum memutuskan.
4. **Model detail rekap.** KDS2 memakai tabel baris-per-komponen (`komponen_kode`, `nilai`). Pertimbangkan apakah bentuk itu dipertahankan atau diubah; apa pun pilihannya, tes paritas yang menjadi hakim.
5. **Migrasi data MySQL → PostgreSQL** (31 tabel, ±350 ribu baris): skrip sekali jalan, id dipertahankan, verifikasi jumlah baris dan checksum per tabel.
6. **Backup.** Paket gratis PostgreSQL terkelola punya riwayat pemulihan terbatas. Tetap jadwalkan dump berkala ke Google Drive.

## 4. Tahapan dan kriteria selesai

| Tahap | Isi | Selesai bila | Perkiraan |
|---|---|---|---|
| F0 Persiapan | Nama final, akun (GitHub, Vercel, DB), repo, akses folder referensi | Repo kosong siap dan bisa deploy "hello" | 1 minggu (tergantung akun) |
| F1 Fondasi | Proyek Next.js, skema Prisma gabungan (KDS1 + tambahan KDS2), seed master, login, layout, kerangka tes | Login jalan, `prisma migrate` bersih, tes dasar hijau | 1–2 minggu |
| F2 Data | Skrip migrasi MySQL `kds2_produksi` → PostgreSQL, laporan verifikasi | Jumlah baris dan checksum semua tabel cocok | ±1 minggu |
| F3 Modul baca | Nominatif (daftar+detail), Rekap Bulanan, Rekap Tahunan, Statistik Dosen/Tendik, Dashboard, filter Keaktifan, ekspor Excel | Tes paritas: angka sama dengan KDS2 untuk bulan-bulan 2026 | 3–4 minggu |
| F4 Modul tulis | Upload Nominatif (menyerap alur standarisasi KDS1), Upload Rekap, Koreksi Rekap (+impor Excel), Rekap Individual + Massal | Paritas importer: file yang sama → data tersimpan sama; tes untuk TMT, AKL, koreksi | 4–6 minggu |
| F5 Paralel | Setiap bulan, data yang sama diproses di KDS2 lokal dan KDS Terpadu | ≥2 siklus bulanan hasilnya identik | ±2 bulan kalender |
| F6 Cutover | Bekukan KDS2, migrasi data terakhir, arahkan pemakaian ke KDS Terpadu, simpan dump akhir | Pengguna bekerja penuh di KDS Terpadu | 1 minggu |

Alasan urutan: modul baca lebih dulu karena risikonya rendah dan memberi bukti paritas lebih awal; modul tulis
(upload) memuat aturan paling rumit dan batas Vercel, jadi dikerjakan setelah fondasi dan data stabil.

## 5. Strategi tes paritas
- Skrip pembanding membaca MySQL `kds2_produksi` (kunci jawaban) dan PostgreSQL baru untuk periode yang sama, lalu membandingkan: jumlah baris per laporan, total TK/TB per pegawai, hasil filter, dan isi sel Rekap Bulanan/Tahunan.
- Untuk importer: kumpulan file contoh (sintetis, tanpa data pegawai asli) yang diproses KDS2 dan KDS Terpadu, hasilnya disamakan. Skenario yang wajib: NIP tak dikenal, tanpa snapshot, Akademisi Luar, TMT, peringatan, re-upload, NIP ganda, kolom bergeser, tiga slot jabatan tambahan.

## 6. Risiko utama
| Risiko | Penanganan |
|---|---|
| Penulisan ulang KDS2 lebih lama dari perkiraan | Kerjakan modul baca dulu, ukur kecepatan nyata, perbarui perkiraan setelah F3 |
| Perbedaan hasil hitung antara PHP dan TypeScript (pembulatan, tanggal, zona waktu) | Tes paritas sejak modul pertama; semua tanggal memakai WIB |
| Batas layanan gratis (Vercel, DB) menghambat produksi | Putuskan paket sebelum F4; desain agar bisa pindah ke server UM |
| Data pegawai berada di server luar negeri | Putuskan dengan atasan sebelum data asli masuk; selama pengembangan pakai data sintetis |
| Orang tunggal sebagai pemelihara | Dokumentasi di repo, tes otomatis, pola kode seragam dengan KDS1 |
