# Prompt pembuka sesi Claude Code (salin dan tempel di chat baru)

Cara memakai:
1. Buka aplikasi Claude Code, buat **chat baru**, lalu pilih folder `D:\ANAS\Project\KDS-Terpadu` sebagai folder kerja.
2. Tempel teks di antara dua garis di bawah ini sebagai pesan pertama.
3. Saat Claude meminta akses ke folder lain (KDS2 dan KDS1), setujui. Keduanya hanya untuk dibaca.

---

Kamu bekerja di proyek **KDS Terpadu**: menyatukan KDS1 (standarisasi nominatif, Next.js + Prisma + PostgreSQL) dan
KDS2 (arsip nominatif dan rekap kehadiran, Laravel + MySQL) ke satu aplikasi Next.js + PostgreSQL untuk Seksi Kinerja,
Disiplin, dan Sistem Informasi (KDS) SDM Universitas Negeri Malang. Balas dalam Bahasa Indonesia. Saya pemula di bidang
infrastruktur dan jaringan, jadi jelaskan langkah dengan bahasa sederhana.

Langkah awal, urut:
1. Baca `CLAUDE.md`, lalu `docs/01-rancangan.md`, `docs/02-peta-fitur-kds2.md`, dan `docs/03-akun-dan-hosting.md`.
2. Minta akses baca ke dua folder referensi: `D:\ANAS\Project\Sistem Kepegawaian UM` (KDS2) dan
   `D:\ANAS\Project\tool-standardisasi-nominatif-simpega-um` (KDS1). Jangan mengubah isi keduanya.
3. Baca `prisma/schema.prisma` dan `README.md` KDS1, serta `CLAUDE.md` dan `Skema_Database_SIMPEGA_UM.md` KDS2.
4. Ringkas ke saya, maksimal satu halaman: (a) apa yang sudah ada di KDS1 yang bisa dipakai ulang, (b) apa saja yang
   harus ditambahkan dari KDS2, (c) tiga risiko teknis terbesar menurutmu, dan (d) pertanyaan yang perlu saya jawab.
5. Setelah saya menyetujui ringkasan itu, susun **rencana tahap F0 dan F1** (langkah, berkas yang akan dibuat,
   cara menguji) dan tunggu persetujuan saya sebelum menulis kode.

Aturan selama bekerja:
- Jangan membuat akun, proyek Vercel/Neon, deploy, atau menulis ke database produksi tanpa persetujuan saya.
- Jangan menyalin data pegawai (NIP, nama) ke repo ini. Data uji harus sintetis.
- Tiap modul selesai hanya bila **tes paritas** terhadap KDS2 (database MySQL lokal `kds2_produksi`) lulus.
- Perbarui bagian **Status** di `CLAUDE.md` setiap ada keputusan atau kemajuan.

---

Catatan untuk Anda (pemilik proyek), tidak perlu ditempel:
- Nama "KDS Terpadu" adalah nama kerja. Bila ingin nama lain, ganti di `CLAUDE.md`, `README.md`, dan `package.json`
  (setelah dibuat), dan beri tahu Claude di chat baru.
- Pertanyaan yang kemungkinan diajukan Claude di langkah 4: nama final, hosting (Vercel + Neon atau server UM),
  akun institusi untuk Vercel/database, dan apakah data asli boleh berada di server luar negeri.
