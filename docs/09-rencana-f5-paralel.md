# Rencana F5: KDS Terpadu berjalan paralel dengan KDS2

Disusun 14 Okt 2026, setelah F4 selesai. Bahasa sengaja sederhana. Belum ada yang dibuat di Vercel/Neon; semua langkah di bawah
yang menyentuh layanan pihak ketiga menunggu persetujuan Anda (aturan proyek).

## 1. Tujuan dan ukuran lulus
**Tujuan:** membuktikan dengan data bulanan nyata bahwa KDS Terpadu menghasilkan angka yang sama dengan KDS2 sebelum KDS2
dimatikan (F6). **Lulus** bila selama **2 siklus bulanan berturut-turut** (data yang sama diproses di keduanya):
1. Snapshot Nominatif sama (jumlah baris dan setiap kolom), kecuali perbedaan yang sudah **diputuskan dan dicatat** (§4).
2. Rekap Kehadiran bulanan sama (22 kolom per pegawai) dan Koreksi Rekap menghasilkan angka akhir yang sama.
3. Laporan (Rekap Bulanan/Tahunan, Statistik, Dashboard, ekspor Excel) sama untuk bulan itu.
4. Tidak ada pekerjaan admin yang harus dikembalikan ke KDS2 karena Terpadu tidak bisa melakukannya.

## 2. Dua jalur yang berjalan bersamaan
**Jalur A: di komputer Anda, data asli, tanpa pihak ketiga (mulai bisa sekarang).**
Terpadu dijalankan lokal terhadap database `kds_f5` (salinan data asli, seperti `kds_paritas`, TIDAK di repo/Neon/Vercel).
Tiap bulan Anda mengerjakan seperti biasa di KDS2, lalu mengulang file yang sama di Terpadu, lalu skrip pembanding mencocokkan hasilnya.

**Jalur B: hosting (Vercel + Neon), baru setelah syarat terpenuhi (§5).**
Sebelum itu hanya data sintetis di Vercel/Neon. Jalur B tidak menghalangi lulusnya F5: pembuktian paritas dilakukan di jalur A.

## 3. Siklus bulanan (kerjakan tiap bulan)
| # | Langkah | Di mana | Siapa |
|---|---|---|---|
| 1 | Unduh berkas mentah SIMPEGA bulan itu (REKAP_PEGAWAI) | SIMPEGA | Anda |
| 2 | Alur lama: Standarisasi di KDS1, ekspor, Upload Nominatif di KDS2, Upload Rekap, Koreksi | KDS1 dan KDS2 | Anda |
| 3 | **Berkas mentah yang sama** diproses di Terpadu: Standarisasi (Periksa, Simpan, selesaikan antrean Review) | Terpadu lokal | Anda |
| 4 | Upload Rekap dan Koreksi Rekap yang sama di Terpadu | Terpadu lokal | Anda |
| 5 | Jalankan pembanding `npm run f5:bandingkan -- <bulan> <tahun>` (dibuat di F5.1) | komputer Anda | Anda, saya bantu baca hasil |
| 6 | Setiap selisih diberi satu dari tiga status: **galat Terpadu** (saya perbaiki + tes), **beda sengaja** (dicatat di §4), **galat data KDS2** (dicatat, KDS2 tidak diubah) | catatan F5 | bersama |
| 7 | Bila siklus bersih tanpa galat Terpadu: hitung satu siklus lulus | catatan F5 | |

Catatan: antrean Review di Terpadu harus Anda selesaikan sendiri (pilihan manusia); pilihan yang diingat masuk Kamus Koreksi.
Bandingkan Batch bisa dipakai untuk memeriksa orang baru, hilang, dan NIP berubah antar bulan.

## 4. Perbedaan yang sudah diketahui (harus diputuskan sebelum siklus pertama dinilai)
| Hal | Keadaan | Status |
|---|---|---|
| Tendik "Pelaksana" (767) dan "Laboran" (66) | Terpadu mengikuti KDS2 (Fungsi Umum) | **Diputuskan** 14 Okt 2026 |
| Golongan Non-ASN (594 baris September) | KDS2 satu tingkat lebih rendah atau kosong dibanding SIMPEGA/KDS1/Terpadu | **Perlu keputusan Anda**: cek beberapa pegawai di SIMPEGA; bila SIMPEGA benar, data KDS2 yang dikoreksi (bukan Terpadu) |
| Jabatan tambahan "merangkap" (24 orang) | Terpadu menangkap slot kedua/ketiga; KDS2 jalur lama kehilangan | Diterima sebagai perbaikan; pembanding mencatatnya sebagai "beda sengaja" |
| Akademisi Luar ber-NIP placeholder (56 orang/bulan) | Perlu konfirmasi identitas sekali per orang di Review | Perlu waktu admin tiap bulan sampai kamus identitas terisi |
| Unit asrama (6 unit) | Ada di master Terpadu `kds_paritas`, tidak di KDS2 | Master `kds_f5` dibuat dari `kds_paritas`; seed perlu menyusul sebelum produksi |
| Urutan baris tanpa ORDER BY di KDS2 | Bergantung rencana MySQL | Pembanding mengurutkan dulu |

## 5. Syarat hosting (jalur B), dengan pemilik tiap syarat
Sumber: `docs/07-operasional-hosting.md` §1. Yang saya **tidak** lakukan sendiri: membuat akun, memasukkan rahasia, menyetujui syarat layanan.
| Syarat | Pemilik | Status |
|---|---|---|
| Konfirmasi tertulis lokasi data (Singapura) dari atasan/UPT TIK | Anda (surat/email) | **Belum** |
| Akun Vercel dan Neon atas nama `kepegawaian@um.ac.id` + verifikasi dua langkah (juga GitHub) | Anda | Belum |
| Orang kedua tercatat sebagai pemulih akun/cadangan | Anda | Belum |
| `AUTH_SECRET` baru dan kata sandi admin kuat (di pengelola kata sandi) | Anda | Belum |
| Cadangan terjadwal berjalan dan uji pulih berhasil di database produksi | Saya siapkan, Anda jalankan | Skrip sudah ada dan diuji lokal |
| Tidak ada data asli di repo | Sudah dijaga `.gitignore` dan aturan proyek | Terpenuhi |
| Neon Free hanya 0,5 GB: cek muat data asli (±330 ribu baris F2 + 12 bulan baru) | Saya ukur | **Perlu diukur** (jalur B) |
| Seed master untuk produksi memuat 6 unit asrama | Saya | Menyusul |

## 6. Pekerjaan teknis F5 (urut)
- **F5.1 Pembanding bulanan** `scripts/f5-bandingkan.ts`: KDS2 MySQL (hanya SELECT) vs Terpadu PostgreSQL untuk satu bulan; membandingkan Nominatif (per kolom, per NIP), Jabatan Tambahan, Rekap Kehadiran, Koreksi, dan total laporan; keluaran hanya angka agregat dan daftar kode selisih (tanpa nama/NIP di layar, daftar NIP ke berkas lokal yang tidak di-commit). Memakai pola `verifikasi-migrasi` (F2) dan oracle F3.
- **F5.2 Database `kds_f5`**: salinan `kds_paritas` plus perubahan terbaru KDS2 (jalankan ulang `migrasi:kds2` ke database baru, dry-run dulu), lalu aplikasi dijalankan `next start` (bukan `dev`) agar mirip produksi.
- **F5.3 Siklus 1 dan 2** sesuai §3, dengan catatan selisih per siklus di `docs/10-catatan-f5.md`.
- **F5.4 Kesiapan F6**: daftar pekerjaan KDS2 yang belum ada di Terpadu (bila ada), rencana beku KDS2, dump akhir.
- Paralel dengan jalur B: setelah §5 lengkap, ukur muat data, siapkan proyek Neon/Vercel dengan data sintetis dulu, uji unggah file 6,7 MB dan batas 300 dtk di Vercel nyata, baru (dengan persetujuan Anda) memuat data asli.

## 7. Risiko dan penanganan
| Risiko | Penanganan |
|---|---|
| Bulan berikutnya muncul pola data baru yang tidak ada di sampel (jabatan, unit, golongan baru) | Antrean Review menahan baris yang tak pasti; tidak ada tebakan. Master baru ditambah lewat Review, dicatat. |
| Dua sistem lalu beda karena salah satu dikerjakan manual berbeda | Catat urutan kerja di §3; selisih tanpa sebab teknis ditandai "beda urutan kerja", bukan galat |
| Beban kerja ganda admin selama 2 bulan | Langkah 3-4 memakai berkas yang sama dan Terpadu lebih cepat (Standarisasi 1,6 dtk, tanpa ekspor-unggah ulang) |
| Data asli bocor lewat repo | Tidak ada data di repo; hasil pembanding hanya agregat; berkas selisih tetap lokal |

## 8. Yang saya butuhkan dari Anda untuk mulai
1. Setuju dengan rencana ini (atau perubahan yang Anda mau).
2. Keputusan awal soal golongan Non-ASN (cukup mulai dicek; tidak menghalangi F5.1).
3. Lokasi berkas mentah bulan-bulan sebelumnya yang masih Anda punya (untuk uji tambahan saat F5.1 dibuat; saya hanya membaca).
