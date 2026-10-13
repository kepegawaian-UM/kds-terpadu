# Migrasi data F2: MySQL KDS2 → PostgreSQL

Selesai dan terbukti 13 Okt 2026. Skrip ini dipakai lagi di F6 (cutover), jadi dibuat bisa diulang.

## Cara menjalankan
Prasyarat: MySQL `kds2_produksi` lokal berjalan, `PARITAS_DATABASE_URL` di `.env` (dibuat oleh
`npx tsx scripts/siapkan-db-lokal.ts`), dan skema + master sudah ada di `kds_paritas`
(`prisma migrate deploy` + `prisma db seed` dengan `DATABASE_URL` menunjuk `kds_paritas`).

```bash
npm run migrasi:kds2 -- --dry-run   # jalankan penuh (FK, hitungan) lalu BATALKAN; tidak menyimpan apa pun
npm run migrasi:kds2                # migrasi sungguhan; target harus kosong
npm run migrasi:kds2 -- --ganti     # kosongkan data domain target, lalu migrasi ulang
npm run migrasi:verifikasi          # bandingkan MySQL vs PostgreSQL; kode keluar 1 bila ada beda
```

Pengaman: target harus database berakhiran `_paritas`; MySQL hanya dibaca (sesi READ ONLY, hanya
SELECT); satu transaksi (gagal = tidak ada yang tersimpan); menolak bila `baris_bermasalah`,
`catatan_perubahan_batch`, atau `kamus_koreksi` (data KDS1) berisi, bahkan dengan `--ganti`.
Data asli hanya ada di `kds_paritas` (lokal): jangan dicadangkan ke repo, Neon, atau Vercel.

## Hasil (13 Okt 2026)
10 tabel domain, **semua identik baris demi baris** (jumlah, id, setiap kolom): pegawai 2.871 ·
upload_batch 58 · nominatif_bulanan 25.705 · jabatan_tambahan 3.695 · rekap_bulanan 19.185 ·
rekap_detail 306.960 · upload_error_rows 10.802 · koreksi_rekap 118 · catatan_status 99 ·
audit_log 3.800. Waktu ±30 detik. Cek agregat (jumlah per bulan, SUM per komponen per bulan,
koreksi per jenis, batch per jenis), jam unggah WIB, dan sequence juga cocok. Verifikasi diuji
dengan merusak satu sel dan menggeser satu jam: keduanya terdeteksi.

## Pemetaan kolom
Definisi lengkap ada di `scripts/migrasi/tabel.ts`. Yang bukan salinan polos:

| KDS2 (MySQL) | KDS Terpadu (PostgreSQL) |
|---|---|
| `upload_batch.nama_file` / `diupload_oleh` / `diupload_pada` | `namaFileAsli` / `diunggahOlehNama` / `diunggahPada` |
| `total_baris` / `baris_berhasil` / `baris_gagal` | `jumlahBarisTotal` / `jumlahBerhasil` / `jumlahGagal` |
| (tidak ada) | `status` = `Selesai`; `diunggahOlehId` = null; `bulan`/`tahun` diisi hanya bila semua baris yang menunjuk batch itu satu periode (selain itu null, tidak ditebak) |
| `upload_error_rows.alasan_gagal` | `alasan` (awalan `[PERINGATAN]` dipertahankan) |
| `nominatif_bulanan.nip` | `pegawaiNip` |

Tidak dimigrasi: `users`, `sessions`, `cache*`, `jobs*`, `failed_jobs`, `password_reset_tokens`,
`migrations` (bukan data domain; akun masuk dibuat lewat seed). Data KDS1 (kamus koreksi, batch
standarisasi di Neon) ditunda ke F4.

## Aturan teknis yang perlu diingat
- **Id dipertahankan** termasuk celah (mis. detail rekap: 306.960 baris, id berikutnya 390.525).
  Sequence disetel ke `AUTO_INCREMENT` sumber agar id lama tidak dipakai ulang. `setval` TIDAK ikut
  rollback transaksi, jadi dry-run hanya menghitung (tidak menerapkan) sequence. Tes
  `tests/integration/migrasi.test.ts` menjaga ini.
- **Waktu**: kolom `TIMESTAMP` dibaca sebagai `UNIX_TIMESTAMP` (instan absolut), disimpan UTC
  (`timestamp(3)`), ditampilkan WIB. Server MySQL berzona WIB (`SE Asia Standard Time`).
- **Tanggal murni** (`DATE`) dibaca sebagai teks `YYYY-MM-DD`, disimpan sebagai tengah malam UTC
  pada kolom `@db.Date`: tidak bergeser oleh zona waktu. Tanggal `0000-00-00` ditolak (tidak ada
  di data saat ini).
- **Nilai detail rekap** tetap string (`nilai`); semua komponen berupa angka murni kecuali
  `JENIS_SHIFT` (teks) dan `CUTI_ANAK_KE` (angka atau `-`).
- **Urutan teks (untuk F3):** MySQL memakai `utf8mb4_unicode_ci` (tak peka huruf besar/kecil),
  PostgreSQL bawaan peka. Pencarian nama wajib `ILIKE`, dan tes paritas yang membandingkan
  *urutan* baris harus menyepakati collation (mis. `COLLATE "und-x-icu"` atau urut di aplikasi).

## Tes
- `tests/unit/migrasi.test.ts`: konversi nilai, batas parameter bind, urutan FK.
- `tests/integration/migrasi.test.ts`: sumber sintetis di memori ke `kds_test` (id/celah, sequence,
  dry-run tidak mengubah apa pun, target tidak kosong, data KDS1, rollback penuh, periode batch).
- `tests/paritas/migrasi.test.ts`: data asli `kds_paritas` vs `kds2_produksi` (dilewati bila
  prasyarat tidak ada). Jangan menjalankan tes lain yang menulis ke `kds_paritas`.
