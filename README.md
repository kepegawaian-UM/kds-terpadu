# KDS Terpadu

Aplikasi tunggal Seksi Kinerja, Disiplin, dan Sistem Informasi (KDS), Subdirektorat SDM, Universitas
Negeri Malang: menyatukan KDS1 (standarisasi nominatif) dan KDS2 (arsip nominatif dan rekap kehadiran).
Brief, keputusan, dan status proyek ada di [CLAUDE.md](CLAUDE.md); rancangan di [docs/](docs/).

**Stack:** Next.js 16 (App Router) · TypeScript · Prisma 6 · PostgreSQL · NextAuth (satu admin) · Tailwind 4 · exceljs · Vitest.

## Menjalankan di komputer lokal
Prasyarat: Node.js 22, PostgreSQL 17 (dua database kosong: `kds_dev` dan `kds_test`).

```bash
npm install
cp .env.example .env          # lalu isi DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*
npx prisma migrate dev        # membuat tabel
npx prisma db seed            # master data (dari KDS2) + akun admin
npm run dev                   # http://localhost:3000
```

## Tes
```bash
npm test            # unit + paritas (paritas dilewati bila TEST_DATABASE_URL / MySQL KDS2 tidak ada)
npm run typecheck
npm run lint
```
Siapkan database tes sekali: `DATABASE_URL=<kds_test> npx prisma migrate deploy && npx prisma db seed`
(atau `npm run db:reset` dengan `DATABASE_URL` menunjuk `kds_test`).

## Master data
`prisma/seed-data/*.json` dihasilkan dari tabel master KDS2 (kunci jawaban), bukan ditulis tangan:
`npx tsx scripts/ekspor-master-kds2.ts` (butuh MySQL `kds2_produksi` lokal; hanya-baca).

## Migrasi data KDS2
Salinan data asli untuk tes paritas ada di database lokal `kds_paritas`. Cara menjalankan dan hasilnya: [docs/04-migrasi-f2.md](docs/04-migrasi-f2.md).

## Laporan (F3) dan oracle paritas
Kunci jawaban F3 adalah kode KDS2 yang dijalankan read-only lewat PHP. Lihat [docs/05-f3-laporan.md](docs/05-f3-laporan.md).

## Aturan data
Repo ini **tidak boleh** memuat data pegawai asli (NIP, nama). Data uji harus sintetis; rahasia hanya di `.env`.
