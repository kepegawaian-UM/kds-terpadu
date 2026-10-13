# Peta fitur yang harus dipindahkan dari KDS2

Sumber: `routes/web.php`, view, dan layanan di `D:\ANAS\Project\Sistem Kepegawaian UM`. Kolom **Paritas** = apa yang
harus identik dengan KDS2 agar modul dinyatakan selesai. **Bobot**: R rendah, S sedang, T tinggi (perkiraan kerumitan).

## A. Nominatif
| Fitur | Rute KDS2 | Tahap | Bobot | Paritas dan catatan |
|---|---|---|---|---|
| Daftar snapshot per bulan/tahun (default ke bulan terbaru), filter | `nominatif` | F3 | R | Jumlah dan isi baris sama |
| Detail pegawai (identitas, golongan, jabatan, dasar remunerasi per snapshot) | `nominatif/{id}` | F3 | S | Dasar Remunerasi: Jabatan Tambahan slot pertama, lalu Fungsional, lalu Fungsi Umum |
| Ekspor Excel Nominatif | `nominatif/export` | F3 | R | Kolom dan nama file |
| Tambah Pegawai manual (masuk snapshot bulan berjalan, tercatat di audit log) | `nominatif/create` | F4 | S | Audit log wajib |
| Upload Nominatif bulanan + halaman hasil (gagal/peringatan) | `nominatif/upload` | F4 | T | Cocokkan master by NAMA (abaikan koma/huruf besar), cek header, 3 slot jabatan tambahan, golongan Non-ASN, alias asrama; 2.788 baris < batas durasi |
| Template upload | `nominatif/template` | F4 | R | 22 kolom |
| **Standarisasi file mentah SIMPEGA (KDS1)**: upload, klasifikasi, review, kamus, bandingkan batch, arsip | (di KDS1) | F4 | T | Alur KDS1 dipertahankan; keluarannya langsung menjadi snapshot, tanpa unduh-unggah manual |

## B. Rekap Kehadiran
| Fitur | Rute KDS2 | Tahap | Bobot | Paritas dan catatan |
|---|---|---|---|---|
| Upload rekap bulanan + hasil | `rekap-kehadiran/upload` | F4 | T | NIP tak dikenal dilewati; validasi TMT; AKL ditolak; peringatan; re-upload mengganti; NIP ganda = baris terakhir; "nama sheet" untuk workbook banyak sheet; penolakan file >6 sheet atau >15.000 baris |
| Rekap Bulanan (tabel penuh, urut TK terbanyak, filter Jenis/Status/Keaktifan, sel hasil koreksi berwarna, badge status, tautan Rincian dan Koreksi, ekspor, nama file mengikuti filter) | `rekap-kehadiran/bulanan` | F3 | S | Isi setiap sel dan urutan sama |
| Rekap Tahunan (SUM setahun, filter sama, ekspor) | `rekap-kehadiran/tahunan` | F3 | S | Total per komponen per pegawai sama; performa SUM |
| Pegawai belum ada rekap (dengan alasan status) | `rekap-kehadiran/belum-upload` | F3 | R | Daftar dan alasan sama |
| Rekap Individual (dokumen A4, hitam putih, kop UM, cetak/PDF dan Excel) | `rekap-kehadiran/individual` | F4 | S | Angka per bulan, total, persentase hadir; tanpa penanda koreksi |
| Rekap Individual Massal (kriteria TK minimal, centang, cetak semua, Excel multi-sheet, maks 200) | `rekap-kehadiran/individual/massal` | F4 | S | Daftar kandidat dan urutan sama |

## C. Koreksi Rekap
| Fitur | Rute KDS2 | Tahap | Bobot | Paritas dan catatan |
|---|---|---|---|---|
| Daftar koreksi, pratinjau dampak, simpan dan terapkan | `koreksi-rekap` | F4 | T | Cakupan penuh/sebagian/di luar/digantikan; angka mengalahkan periode; idempoten |
| Terapkan ulang otomatis setelah upload rekap | (hook di upload) | F4 | T | Hasil sama setelah re-upload |
| Impor massal dari Excel (template, pratinjau, simpan, duplikat dilewati, maks 2000) | `koreksi-rekap/impor` | F4 | S | |
| Batalkan koreksi (tidak mengembalikan angka yang sudah dikoreksi) | `koreksi-rekap/{id}/batalkan` | F4 | R | |

## D. Statistik dan Dashboard
| Fitur | Rute KDS2 | Tahap | Bobot | Paritas dan catatan |
|---|---|---|---|---|
| Statistik Dosen (jabatan × golongan per unit) | `statistik/dosen` | F3 | S | Kolom dinamis per jabatan |
| Statistik Tendik (unit × status × gender, golongan) | `statistik/tendik` | F3 | S | |
| Dashboard: kartu jumlah pegawai, status upload bulan berjalan, grafik, ringkasan kinerja (hanya pegawai aktif) | `dashboard` | F3 | S | Angka sama |

## E. Layanan pendukung
- Filter Keaktifan (Aktif/Non-aktif/Semua) di Rekap Bulanan, Tahunan, dan kandidat Massal.
- `catatanStatusPegawai` (Pensiun, Resign, Meninggal dunia, Habis kontrak, batal masuk) + badge "Belum ada keterangan".
- Penjaga file Excel: batas sheet/baris, header kontrak Nominatif, dry-run (`nominatif:periksa` di KDS2; di Terpadu cukup halaman "periksa dulu" sebelum simpan).
- Audit log perubahan manual dan koreksi.
- Backup dan ekspor Excel dengan nama file sesuai tab + filter (mis. "Rekap Kehadiran Tahunan Dosen PNS Aktif 2026").

## F. Tidak dipindahkan (Non-Goals)
- UI CRUD master data (master dikelola lewat seed/migrasi).
- Approval workflow dan multi-peran.
- Sinkronisasi real-time ke mesin fingerprint.
