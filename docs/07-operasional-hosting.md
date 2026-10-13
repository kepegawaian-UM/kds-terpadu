# Operasional hosting: Vercel Hobby + Neon Free ("A-gratis")

Keputusan 13 Okt 2026 (lihat `docs/06-perbandingan-hosting.md` §10). Panduan ini menjelaskan apa yang harus disiapkan, cara
cadangan dan pemulihan, dan **rencana keluar** bila layanan gratis bermasalah. Bahasa sengaja sederhana.

## 1. Syarat keputusan (harus terpenuhi sebelum DATA ASLI masuk)
- [ ] **Konfirmasi tertulis** dari atasan/UPT TIK bahwa data boleh disimpan di server cloud Singapura (dasar saat ini hanya "KDS1 sudah di sana").
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
