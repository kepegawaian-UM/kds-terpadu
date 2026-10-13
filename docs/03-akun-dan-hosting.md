# Akun dan hosting: panduan untuk pemula

## Apa yang dimaksud "akun menerima email verifikasi"
Saat mendaftar di layanan seperti Vercel, Neon, atau GitHub, layanan itu mengirim **satu surat ke alamat email
pendaftar** berisi tautan atau kode angka. Akun baru aktif setelah tautan itu diklik atau kode itu dimasukkan.
Artinya, **Anda harus bisa membuka kotak surat alamat itu**.

Cara memeriksa `kepegawaian@um.ac.id`:
1. Coba masuk ke kotak surat itu (biasanya lewat Gmail atau webmail UM, dengan akun yang bersangkutan).
2. Kirim satu surat uji dari email lain ke alamat itu, lalu lihat apakah masuk.
3. Kalau surat masuk dan bisa Anda baca, alamat itu bisa dipakai mendaftar. Kalau alamat itu hanya "alias" yang
   diteruskan ke orang lain, atau Anda tidak punya kata sandinya, tanyakan ke bagian IT atau bos.

## Siapa memegang apa

| Keperluan | Layanan | Fungsi | Email yang disarankan |
|---|---|---|---|
| Menyimpan kode | GitHub | Menyimpan kode dan riwayatnya | Akun institusi yang sudah ada (organisasi `takkepegawaian-um`) |
| Menjalankan aplikasi di internet | Vercel | "Kamar sewaan" tempat aplikasi hidup | Email institusi (mis. `kepegawaian@um.ac.id`) |
| Menyimpan data | Neon (atau Supabase) | Database PostgreSQL | Email institusi yang sama dengan Vercel |
| Asisten pemrograman | Claude | Menulis kode dan menjalankan perintah | `tak.kepegawaian@um.ac.id` (sudah ada; **tidak perlu sama** dengan akun lain) |

Aturan praktis:
- **Data pegawai sebaiknya berada di akun institusi, bukan pribadi.** Kalau suatu hari Anda pindah tugas, akun institusi
  tetap bisa diserahkan ke penerus. Akun pribadi boleh dipakai untuk **uji coba tanpa data asli** saja.
- **Vercel dan database boleh akun yang berbeda.** Keduanya hanya dihubungkan oleh satu alamat koneksi
  (`DATABASE_URL`) yang ditempel sebagai pengaturan di Vercel.
- Batas "2 proyek" Supabase gratis berlaku per akun. Karena KDS1 sudah memakai **Neon**, database KDS Terpadu bisa
  memakai Neon juga tanpa proyek Supabase baru. Karena aplikasi memakai Prisma, pindah ke Supabase nanti hanya
  mengganti satu alamat koneksi.
- Aktifkan verifikasi dua langkah, dan simpan kode pemulihan di tempat yang aman. Tambahkan satu orang kedua (mis.
  atasan) sebagai pemilik cadangan bila layanan mengizinkan.

## Hosting: dua jalur yang belum diputuskan
| Jalur | Biaya | Catatan |
|---|---|---|
| Vercel + Neon | Paket gratis dengan batas; pemakaian resmi institusi sebaiknya paket berbayar (Vercel Pro ±$20/bulan) | Paket Hobby Vercel hanya untuk non-komersial; batas upload 4,5 MB dan durasi fungsi; data di wilayah Singapura |
| Server UM | Gratis untuk unit | Perlu permintaan ke UPT TIK; data tetap di kampus |

Keputusan akhir diambil bersama atasan sebelum data asli masuk. Selama pengembangan gunakan **data sintetis**.

## Daftar persiapan F0
- [ ] Nama final aplikasi dan repo
- [ ] Cek kotak surat `kepegawaian@um.ac.id` (lihat atas)
- [ ] Repo GitHub baru di organisasi institusi (kosong, privat)
- [ ] Akun Vercel dan database (setelah hosting diputuskan; untuk eksperimen cukup proyek uji tanpa data asli)
- [ ] Jawaban atasan: apakah wajib Supabase, data boleh di luar kampus?
