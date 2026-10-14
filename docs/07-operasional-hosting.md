# Operasional hosting: Vercel Hobby + Neon Free ("A-gratis")

Keputusan 13 Okt 2026 (lihat `docs/06-perbandingan-hosting.md` §10). Panduan ini menjelaskan apa yang harus disiapkan, cara
cadangan dan pemulihan, dan **rencana keluar** bila layanan gratis bermasalah. Bahasa sengaja sederhana.

## 1. Syarat keputusan (harus terpenuhi sebelum DATA ASLI masuk)
- [x] **Konfirmasi tertulis** (pengguna menyatakan sudah ada, 14 Okt 2026; simpan salinannya bersama arsip proyek) dari atasan/UPT TIK bahwa data boleh disimpan di server cloud Singapura (dasar saat ini hanya "KDS1 sudah di sana").
- [ ] **Verifikasi dua langkah** aktif di GitHub, Vercel, dan Neon.
- [ ] Semua akun memakai **email institusi** (`kepegawaian@um.ac.id`), dan **satu orang kedua** dicatat sebagai pemilik cadangan/pemulih akun.
- [ ] **Cadangan terjadwal** berjalan dan **uji pulih berhasil** pada database produksi (§4).
- [ ] `AUTH_SECRET` baru (bukan yang di komputer lokal) dan kata sandi admin yang kuat (simpan di pengelola kata sandi, bukan di chat/berkas).
- [ ] Tidak ada data pegawai asli di repo (pengaman `.gitignore` sudah menolak `*.xlsx`, `*.csv`, `*.sql`, `.env*`).
Sampai semuanya tercentang: **pakai data sintetis** di Vercel/Neon.

## 2. Peta akun dan kepemilikan
| Layanan | Fungsi | Pemilik (disarankan) | Catatan |
|---|---|---|---|
| GitHub (`kepegawaian-UM/kds-terpadu`) | Menyimpan kode | akun institusi | repo privat; sudah ada |
| Vercel (Hobby) | Menjalankan aplikasi | `kepegawaian@um.ac.id` | gratis; syaratnya untuk proyek pribadi non-komersial (risiko diterima) |
| Neon (Free) | Database PostgreSQL | `kepegawaian@um.ac.id` | wilayah **AWS Asia Pacific (Singapore)**; tidak bisa diubah setelah dibuat |
| Google Drive | Tempat cadangan | akun yang sudah dipakai untuk cadangan KDS2 | folder `...\bak\kds-terpadu` |
Saya (Claude) **tidak membuat akun** apa pun; Anda yang mendaftar dan memasukkan rahasia sendiri. Saya memandu tiap langkah.

## 3. Langkah menyiapkan (dilakukan nanti, urut)
1. **Neon:** daftar → buat proyek `kds-terpadu`, wilayah *Singapore*. Dari menu *Connection string* salin **dua** alamat: (a) *pooled* (host memuat `-pooler`) dan (b) *direct* (tanpa `-pooler`).
2. **Vercel:** daftar → *Add New Project* → impor repo `kds-terpadu`. **Verifikasi saat itu:** paket Hobby mungkin membatasi repo milik *organisasi* GitHub privat; bila terhalang, jalan keluarnya (mis. memindahkan repo ke akun pribadi/institusi non-organisasi atau mengunggah lewat Vercel CLI) kita pilih bersama.
3. Variabel lingkungan di Vercel (bukan di chat): `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), `AUTH_SECRET` (baru). Tambahkan `vercel.json` dengan wilayah fungsi `sin1` dan `maxDuration` 300 untuk rute berat (maksimum Hobby 300 detik).
4. **Migrasi dan master data** dijalankan dari komputer Anda, bukan saat build: `npx prisma migrate deploy` lalu `npx prisma db seed` dengan `DATABASE_URL_UNPOOLED` produksi (akun admin dibuat dari `SEED_ADMIN_*` yang diisi sementara).
5. Data asli baru dimuat setelah §1 lengkap (di F5/F6, lewat skrip migrasi dengan target produksi, dry-run dulu).

## 4. Cadangan otomatis (sudah dibuat dan diuji)
| Hal | Isi |
|---|---|
| Skrip | `scripts/cadangan/cadangkan-database.ps1` (pg_dump format custom, diperiksa pg_restore, simpan 45 hari, log `cadangan.log`) |
| Jadwal | `scripts/cadangan/daftarkan-cadangan-harian.ps1` mendaftarkan tugas harian di Windows Task Scheduler (`StartWhenAvailable`: tetap jalan bila komputer baru menyala) |
| Alamat database | `.env.cadangan` (tidak di-commit; contoh: `.env.cadangan.example`), isinya `CADANGAN_DATABASE_URL` **alamat langsung Neon (tanpa `-pooler`)** |
| Tujuan | `G:\My Drive\_OLD ARCHIVE\__ANAS\bak\kds-terpadu` (ubah dengan `-Tujuan`) |
| Yang dicadangkan | database (data). Kode ada di GitHub; rahasia (`.env`, variabel Vercel) disimpan di pengelola kata sandi |

**Bukti uji (13 Okt 2026, database data asli lokal `kds_paritas`):** cadangan 53,5 MB menjadi berkas **2,7 MB**; dipulihkan ke database baru
dalam **4,9 detik** (373.293 baris); verifikasi F2 terhadap hasil pemulihan menyatakan **semua tabel identik dengan KDS2** dan akun admin serta master ikut pulih.
Dengan ukuran itu, 45 hari cadangan harian ≈ 120 MB di Drive.

Pemasangan (sekali): salin `.env.cadangan.example` menjadi `.env.cadangan`, isi alamat langsung Neon, jalankan skrip satu kali secara manual
(`powershell -ExecutionPolicy Bypass -File scripts\cadangan\cadangkan-database.ps1`), lalu daftarkan jadwal harian dengan `daftarkan-cadangan-harian.ps1`.
Periksa `cadangan.log` seminggu sekali; **uji pulih** (§5 langkah 2-3) satu kali sebelum data asli masuk dan setiap kuartal.

## 5. Memulihkan cadangan
1. Pilih berkas `kds_terpadu_YYYYMMDD_HHMMSS.dump` terbaru yang baik di folder cadangan.
2. Buat database kosong, lalu pulihkan: `pg_restore --no-owner --no-privileges --dbname="<alamat database kosong>" "<berkas.dump>"`.
3. Periksa: jalankan `npm run migrasi:verifikasi` (bila KDS2 masih ada) atau cocokkan jumlah baris tabel utama; buka aplikasi dan login.

## 6. Rencana keluar (bila Vercel atau Neon bermasalah)
Aplikasi **tidak terkunci vendor**: semua lewat `DATABASE_URL`. Waktu pemulihan sasaran: **setengah hari**.
| Kejadian | Langkah |
|---|---|
| Akun **Neon** ditangguhkan/habis kuota | Pulihkan cadangan terbaru (§5) ke PostgreSQL lain (lokal, VPS Indonesia, atau proyek Neon baru), ganti `DATABASE_URL` di Vercel, deploy ulang |
| Akun **Vercel Hobby** ditangguhkan | Jalankan aplikasi di komputer sendiri (`npm run build` lalu `npm start`; data dari cadangan) sambil memilih tempat baru (Vercel Pro dengan anggaran, VPS, atau server UM) |
| Keduanya | Gabungkan keduanya; data tetap aman karena cadangan ada di Drive dan kode di GitHub |
Simpan satu salinan variabel lingkungan produksi di pengelola kata sandi supaya bisa dipasang ulang di mana pun.

## 7. Batas paket gratis yang perlu diingat
| Batas | Nilai | Dampak |
|---|---|---|
| Neon Free: penyimpanan | 0,5 GB per proyek | Data sekarang 53,5 MB untuk 10 bulan (±5 MB/bulan) -> cukup ±8 tahun |
| Neon Free: komputasi | ±100 CU-jam/bulan; tidur setelah 5 menit tak dipakai | Permintaan pertama setelah diam bisa terasa lambat 1-3 detik; pemakaian satu admin sangat jauh di bawah batas |
| Vercel Hobby: body permintaan | 4,5 MB | Unggahan file mentah (6,7 MB) per potongan (rancangan F4) |
| Vercel Hobby: durasi fungsi | maks 300 detik | Impor 2.800 baris ±7 detik: aman |
| Vercel Hobby: syarat layanan | proyek pribadi non-komersial | Abu-abu untuk institusi; risiko penangguhan akun diterima (§1, §6) |
| Riwayat pemulihan Neon Free | singkat | Karena itu cadangan sendiri (§4) wajib |

## 8. Pemicu pindah ke paket berbayar atau ke Indonesia
- Atasan/UPT TIK menyatakan data wajib di Indonesia -> pindah ke server UM atau VPS Indonesia (rencana keluar §6, tanpa ubah kode).
- Akun Hobby ditangguhkan atau atasan ingin yang resmi -> Vercel Pro (±US$25-45/bulan dengan Neon Launch), tanpa ubah kode.
- Penyimpanan Neon mendekati 0,4 GB atau komputasi gratis tidak cukup -> naik ke Neon Launch.

## 9. Catatan pelaksanaan Neon (14 Okt 2026)
- Proyek Neon `kds-terpadu` dibuat oleh pengguna (akun GitHub institusi), wilayah **AWS Asia Pacific (Singapore, ap-southeast-1)**, database `neondb`. Dua alamat koneksi (pooling dan tanpa pooling) disimpan pengguna di `.env.neon` (diabaikan git, tidak pernah dicetak atau dikirim lewat chat).
- Dilakukan dari komputer pengguna atas persetujuan eksplisit: `scripts/neon/periksa.ts` (memastikan Neon Singapura, alamat pooling/tanpa pooling benar, database kosong; hanya membaca), `prisma migrate deploy` (4 migrasi), seed master + akun admin (`kepegawaian@um.ac.id`, kata sandi dari `SEED_ADMIN_PASSWORD` di `.env.neon`), dan `scripts/neon/samakan-master.ts` (6 unit asrama KDS1 ditambahkan dengan kode yang sama dengan salinan kerja lokal; 12 tabel master identik; 0 baris data pegawai).
- `AUTH_SECRET` produksi dibuat acak dan ditulis ke `.env.neon` (tidak ditampilkan); nilainya dipindahkan pengguna ke variabel Vercel (tipe Sensitive).
- **Belum ada data pegawai di Neon.** Data asli baru masuk setelah syarat §1 lengkap (cadangan terjadwal dan uji pulih, akun institusi dengan verifikasi dua langkah) dan lewat dry-run, cadangan, serta persetujuan pengguna.
- Seed bawaan (`prisma/seed-data`) tetap tanpa unit asrama karena tes paritas master membandingkan dengan KDS2; unit itu ditambahkan ke produksi lewat `samakan-master.ts` bila database baru dibuat.
- `.env.neon` berisi rahasia produksi: simpan salinannya di pengelola kata sandi, jangan di Drive atau repo. Bila bocor: ganti kata sandi role database di konsol Neon dan buat `AUTH_SECRET` baru.

## 10. Uji produksi di Vercel (14 Okt 2026, situs `kds-terpadu-nyrk.vercel.app`)
- **Dari luar, tanpa login**: halaman login 200 (0,7 dtk, wilayah fungsi `sin1`), 6 header keamanan aktif, semua halaman aplikasi, unduhan Excel/template, dan `/api/upload-chunk` dialihkan ke login (307); kode yang dikirim ke browser tidak memuat alamat database, kunci, atau sandi (0 kemunculan); peta kode sumber ditolak (403); `.env`, `.git`, `package.json`, skema database tidak terbuka.
- **Dengan login (pengguna masuk sendiri di panel browser)**: 18 halaman terbuka tanpa galat (rata-rata < 0,5 dtk; 1,4-1,9 dtk saat dingin), 3 template + 3 ekspor Excel 200, Ringkasan membaca Neon.
- **Unggah penuh dengan berkas SINTETIS** (10 baris, dibangun di halaman; disetujui eksplisit pengguna): berkas mentah (kolom NIK, Nama Ibu Kandung, Email Resmi palsu) **ditolak** oleh penjaga dengan pesan yang benar; berkas bersih: Periksa (10 baris, 4 berhasil, 6 Review), Simpan (1 dtk, batch #1), tampil di Ringkasan dan Nominatif, ekspor Excel 200, antrean Review terisi.
- **Pembersihan**: seluruh data contoh dihapus dari Neon dengan `scripts/neon/hapus-data-contoh.ts --ya` (satu transaksi); terbukti semua tabel domain = 0, akun admin tetap 1, master unit kerja tetap 218, kamus tidak berubah; Ringkasan kembali "Belum ada snapshot".
- **Belum diuji di produksi**: berkas 2.800 baris (waktu Simpan di Vercel Hobby; lokal 2,3 dtk), Rekap Tahunan/Statistik dengan data asli (latensi Malang-Singapura), cadangan terjadwal, ganti kata sandi lewat halaman Akun (dilakukan pengguna).

## 11. Cadangan Neon dan noindex (14 Okt 2026)
- **Cadangan harian terpasang** atas persetujuan pengguna: `.env.cadangan` (diabaikan git; alamat LANGSUNG Neon Singapura, disalin dari `.env.neon` tanpa ditampilkan), cadangan pertama `kds_terpadu_20261014_125913.dump` (0,07 MB, kini hanya master + akun admin) di `G:\My Drive\_OLD ARCHIVE\__ANAS\bak\kds-terpadu`, dan tugas Windows Task Scheduler **"KDS Terpadu Cadangan Harian"** (setiap hari 17:30, `StartWhenAvailable`, retensi 45 hari, log `cadangan.log` di folder tujuan). Ketergantungan: komputer ini menyala atau dinyalakan; periksa `cadangan.log` seminggu sekali.
- **Uji pulih lulus** (`npx tsx scripts/neon/uji-pulih.ts`): cadangan terbaru dipulihkan ke database lokal sementara dalam 0,7 detik; 28 tabel identik dengan Neon (590 baris), akun admin dan 4 catatan migrasi pulih; database sementara dihapus. Ulangi uji ini sebelum data asli masuk dan tiap kuartal.
- **noindex**: header `X-Robots-Tag: noindex, nofollow, noarchive` untuk semua halaman dan `public/robots.txt` (Disallow semua; dikecualikan dari proteksi login agar perayap membacanya). Aktif di Vercel setelah push dan deploy ulang otomatis.
- Perhatian: `.env.neon` dan `.env.cadangan` memuat kata sandi database dalam teks biasa di komputer ini; cadangan di Drive nanti memuat data asli. Jaga akses komputer dan Drive (verifikasi dua langkah, enkripsi disk).
