# Perbandingan hosting KDS Terpadu

Disusun 13 Okt 2026 untuk keputusan bersama atasan dan UPT TIK. Bahasa sengaja sederhana. **Bukan nasihat hukum**:
bagian hukum perlu dikonfirmasi oleh bagian hukum/TIK UM (lihat §2 dan daftar pertanyaan di §7).

## 1. Ringkasan (baca ini dulu)
- **Pertanyaan yang menentukan bukan harga, melainkan lokasi data.** Aplikasi ini menyimpan data ±2.800 pegawai (NIP, nama,
  tanggal lahir, agama, pendidikan, golongan, status). Universitas Negeri adalah instansi pemerintah; bila KDS dianggap
  *sistem elektronik lingkup publik*, aturan (PP 71/2019) mewajibkan data dikelola, diproses, dan disimpan **di wilayah Indonesia**.
- Rencana awal kita (Vercel + Neon) berarti data berada di **Singapura** dan diproses di sana: **Vercel tidak punya wilayah di
  Indonesia** (yang terdekat Singapura/`sin1`). Itu berisiko bila aturan di atas berlaku.
- Dari sisi **teknis**, ketiga opsi di bawah semuanya bisa menjalankan aplikasi ini (Next.js + PostgreSQL, tanpa kunci vendor).
  Yang berbeda: siapa yang merawat server, biaya, dan batasnya.
- **Rekomendasi:** (1) tanyakan dulu soal lokasi data ke UPT TIK/bagian hukum (daftar pertanyaan di §7); (2) sambil menunggu,
  **tetap pakai data sintetis di Vercel/Neon atau lokal** dan jangan masukkan data asli ke luar negeri; (3) jika jawabannya
  "wajib di Indonesia", pilih **Opsi B (server UM)** atau **Opsi C (penyedia cloud/VPS Indonesia)**; (4) pengembangan F4 dapat
  dimulai sekarang karena dirancang **tidak bergantung hosting**; keputusan dibutuhkan paling lambat sebelum F5 (uji paralel
  dengan data asli).

## 2. Faktor penentu: lokasi data
| Hal | Yang diketahui (sumber di §8) | Yang perlu dipastikan |
|---|---|---|
| PP 71/2019 | Penyelenggara sistem elektronik **lingkup publik** wajib mengelola, memproses, dan/atau menyimpan sistem dan data elektronik di wilayah Indonesia; pengecualian hanya bila teknologi penyimpanannya belum tersedia di dalam negeri. Lingkup privat boleh di luar negeri. | Apakah KDS UM termasuk lingkup publik (UM = instansi penyelenggara negara)? Siapa yang berwenang menafsirkan di UM? |
| UU PDP 27/2022 (Pasal 56) | Transfer data pribadi ke luar Indonesia diperbolehkan dengan syarat berjenjang (negara tujuan setara, atau jaminan yang mengikat, atau persetujuan subjek data). Badan publik termasuk "pengendali data". Pasal ini sedang/telah diuji di MK (perkara 137/PUU-XXIII/2025). | Status terbaru putusan MK dan PP PDP; apakah persetujuan 2.800 pegawai realistis. |
| Data agama | Termasuk data pribadi yang bersifat spesifik menurut UU PDP; kolom `agama` ada di skema (sama seperti KDS2). | Apakah kolom ini masih perlu disimpan. |
| KDS1 sekarang | KDS1 sudah berjalan di Vercel + Neon (Singapura). | Apakah ini perlu ditinjau/dipindah bila jawaban di atas "wajib di Indonesia". |

## 3. Tiga opsi
**A. Vercel + Neon (rencana awal).** Aplikasi di Vercel, database PostgreSQL di Neon (wilayah Singapura). Dirawat penyedia; paling mudah untuk pemula.

**B. Server UM (UPT TIK).** Aplikasi (Node.js) dan PostgreSQL berjalan di server/VM kampus. Data tetap di kampus. Perlu UPT TIK menyediakan VM,
akses jaringan, HTTPS, dan cadangan, serta ada orang yang merawatnya.

**C. Cloud/VPS penyedia Indonesia.** Sewa server virtual dari penyedia pusat data di Indonesia (contoh jenis layanan; belum diminta
penawaran): aplikasi + PostgreSQL di satu VPS atau dua. Data di Indonesia, tanpa bergantung server kampus, tetapi berbayar dan tetap perlu perawatan dasar.

## 4. Perbandingan
| | **A. Vercel + Neon** | **B. Server UM** | **C. Cloud/VPS Indonesia** |
|---|---|---|---|
| **Lokasi data** | Singapura (Vercel tidak punya wilayah Indonesia; Neon tersedia di `aws-ap-southeast-1`) | Indonesia (kampus) | Indonesia |
| **Kesesuaian PP 71/2019 (bila lingkup publik)** | **Berisiko** | Sesuai | Sesuai (pastikan pusat data berada di Indonesia) |
| **Biaya** (verifikasi 13 Okt 2026) | Vercel **Pro $20 per pengguna/bulan** (Hobby gratis hanya untuk proyek pribadi non-komersial, jadi tidak cocok untuk penggunaan institusi) + Neon berbasis pemakaian (**Launch $0,106 per CU-jam**, penyimpanan $0,35/GB-bulan; paket Free hanya 0,5 GB). Untuk data sekecil ini kira-kira **US$25–45/bulan** | Tidak ada biaya sewa; biaya = waktu UPT TIK | **Perlu penawaran** (umumnya jauh lebih murah dari A untuk beban sekecil ini; angka belum diverifikasi) |
| **Merawat siapa** | Penyedia (kita hanya mengatur) | UPT TIK/Anda: sistem operasi, pembaruan keamanan, cadangan, HTTPS | Anda (atau UPT TIK) merawat server; penyedia hanya menyediakan mesin |
| **Cadangan** | Neon: riwayat pemulihan terbatas di paket Free; tetap perlu cadangan berkala ke Drive | Dibuat sendiri (skrip `pg_dump` terjadwal, seperti KDS2 sekarang) | Dibuat sendiri; sering ada snapshot berbayar |
| **Batas teknis penting** | Body permintaan **4,5 MB** per fungsi (file mentah SIMPEGA 6,7 MB harus dipotong); durasi fungsi maks **300 dtk (Hobby) / 800 dtk (Pro)**; tanpa penyimpanan berkas tetap | Tidak ada batas bawaan; unggah berkas besar langsung | Sama seperti B |
| **Kesulitan bagi pemula** | Paling mudah | Sedang-sulit (butuh bantuan UPT TIK) | Sedang |
| **Risiko kontinuitas** | Akun/kartu pembayaran terikat satu orang; vendor bisa mengubah harga/aturan | Bergantung dukungan UPT TIK dan pergantian staf | Langganan harus diperpanjang; akun terikat orang |
| **Kunci vendor** | Rendah (hanya `DATABASE_URL`) | Tidak ada | Rendah |
| **Kecepatan pengguna di kampus** | Lewat internet ke Singapura (cukup untuk aplikasi ini) | Terbaik (jaringan kampus) | Baik |

## 5. Dampak ke rancangan F4 (modul tulis)
Aplikasi dirancang agar **sama di ketiga opsi**; yang berbeda hanya cara unggah berkas besar dan lamanya proses:
- **Unggah berkas:** rancang unggahan **per potongan** (pola `UploadChunk` dari KDS1, <4 MB per potongan). Di Vercel ini wajib; di B dan C tetap
  berfungsi dan hanya sedikit lebih rumit dari perlu. Dengan begitu tidak ada pekerjaan ulang bila hosting berubah.
- **Lama proses impor:** KDS2 mengimpor 2.788 baris Nominatif dalam ±7 detik; Rekap ±900 baris cepat. Ini jauh di bawah batas 300 dtk Vercel. Alur standarisasi
  KDS1 (1-3 menit) juga masih muat, tetapi sebaiknya menyimpan **progres per tahap** agar bisa dilanjutkan bila terputus.
- **Tanpa berkas tetap:** file mentah tidak disimpan di disk server (di Vercel memang tidak bisa); hanya hasil di database. Ini menguntungkan privasi di semua opsi.
- **Agregat berat:** kueri SUM memakai `kueriRencanaKustom` (temuan F3.7) di semua opsi.
- **Cutover (F6):** di opsi B/C kita perlu rencana pemulihan (cadangan + uji pulihkan) yang kita tulis sendiri; di opsi A sebagian disediakan penyedia.

## 6. Perkiraan biaya dan beban kerja per opsi (kasar)
| | Biaya berulang | Beban kerja awal | Beban kerja rutin |
|---|---|---|---|
| A | ±US$25-45/bulan (Pro + Neon) | ±1 hari (proyek, variabel lingkungan, domain) | Rendah |
| B | Rp 0 (waktu UPT TIK) | Sedang: VM, PostgreSQL, Node, HTTPS, cadangan; ±2-5 hari kerja bersama UPT TIK | Sedang (pembaruan keamanan, pantau) |
| C | Perlu penawaran | Sedang: seperti B tanpa menunggu kampus | Sedang |

## 7. Pertanyaan untuk atasan / UPT TIK / bagian hukum
1. Apakah KDS (aplikasi SDM internal) dianggap **sistem elektronik lingkup publik** sehingga data **wajib** di pusat data dalam negeri? Siapa yang memutuskan di UM?
2. Apakah UM sudah punya **pusat data / VM** yang bisa dipakai (UPT TIK)? Siapa penanggung jawab, dan berapa lama permintaan VM biasanya diproses?
3. Apakah UM punya ketentuan **pendaftaran sistem elektronik** (PSE) dan **penilaian dampak PDP** yang harus dipenuhi sebelum data asli diproses?
4. Bila server UM dipakai: siapa yang menjaga **cadangan** dan **pemulihan**, dan siapa pengganti bila Anda pindah tugas?
5. Apakah KDS1 yang sekarang di Vercel + Neon perlu **ditinjau/dipindahkan** bila jawabannya "wajib di Indonesia"?
6. Apakah kolom **agama** perlu tetap disimpan? (data pribadi spesifik; tidak dipakai laporan KDS2.)
7. Siapa pemilik resmi akun (GitHub, hosting, domain) agar tidak terikat satu orang?

## 8. Sumber (diakses 13 Okt 2026)
- Batas Vercel Functions (body 4,5 MB, durasi 300/800/1800 dtk, memori): [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) (halaman terakhir diperbarui 24 Agu 2026). Catatan: beberapa situs pihak ketiga menyebut batas 100 MB, **tetapi dokumentasi resmi menulis 4,5 MB**; kita ikuti yang resmi.
- Wilayah Vercel (tidak ada Indonesia; terdekat `sin1` Singapura): [Vercel Regions](https://vercel.com/docs/regions).
- Harga Vercel (Hobby non-komersial, Pro $20 per pengguna; angka pihak ketiga, cek halaman harga resmi sebelum anggaran): [Vercel Cost 2026](https://makerkit.dev/blog/saas/vercel-cost), [Vercel pricing](https://schematichq.com/blog/vercel-pricing).
- Harga dan wilayah Neon (Free/Launch/Scale, Singapura `aws-ap-southeast-1`; angka dari kutipan pencarian, cek [neon.com/pricing](https://neon.com/pricing)): [Neon Pricing 2026](https://www.jetadmin.io/blog/neon-pricing/amp/), [Neon Regions](https://neon.com/docs/introduction/regions).
- PP 71/2019 (PSE lingkup publik wajib di Indonesia): [teks resmi JDIH Kemenkeu](https://jdih.kemenkeu.go.id/FullText/2019/71TAHUN2019PP.pdf), [Hukumonline: pokok-pokok aturan PP PSTE](https://www.hukumonline.com/berita/a/mengenal-pokok-pokok-aturan-baru-pp-pste-lt5de653d86d627/?page=all), [Selular.ID](https://selular.id/2019/12/pp-71-2019-hadir-demi-kedaulatan-data/).
- UU PDP Pasal 56 dan uji materi MK: [Hukumonline: Pasal 56 UU PDP](https://www.hukumonline.com/berita/a/pasal-56-uu-pdp-dinilai-belum-memadai-melindungi-subjek-data-pribadi-lt68f98c9417fa9), [Hukumonline: transfer data lintas negara pasca putusan MK](https://www.hukumonline.com/berita/a/transfer-data-lintas-negara-dan-ilusi-pelindungan-data-pribadi-pasca-putusan-mk-lt6981468330d9c), [MKRI: pemohon uji materi Pasal 56](https://www.mkri.id/berita/pemohon:-transfer-data-pribadi-ke-luar-negeri-berisiko-lebih-tinggi-23666).

## 10. Keputusan (13 Okt 2026)
Hasil wawancara dengan pengguna: lokasi data **boleh di luar negeri** (dasar: KDS1 sudah di Vercel + Neon, belum ada pernyataan tertulis);
**tidak ada** server/VM UM; perawatan oleh pengguna sendiri (mau belajar); **tidak ada anggaran** (harus gratis); akses **satu admin dari beberapa tempat**;
aplikasi boleh mati 1-2 hari; risiko syarat layanan paket gratis **diterima** dengan cadangan rutin.

**Keputusan: Opsi A-gratis (Vercel Hobby + Neon Free)**, dengan syarat: (1) konfirmasi tertulis lokasi data sebelum data asli masuk, (2) cadangan rutin ke Drive,
(3) rencana keluar tertulis, (4) verifikasi dua langkah dan akun di email institusi. Rencana cadangan bila konfirmasi tertulis ternyata "wajib di Indonesia":
**tetap lokal (Opsi D)** yang juga gratis. Panduan operasional, cadangan, dan rencana keluar: `docs/07-operasional-hosting.md`.

## 9. Keterbatasan dokumen ini
- Angka harga Vercel/Neon berasal dari halaman pihak ketiga dan kutipan pencarian; **cek halaman resmi sebelum menyusun anggaran**.
- Opsi C belum meminta penawaran penyedia mana pun.
- Rujukan pasal hukum dan putusan MK perlu dibaca langsung pada naskah resmi oleh bagian hukum.
