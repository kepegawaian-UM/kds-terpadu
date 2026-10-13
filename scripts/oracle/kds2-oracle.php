<?php
/**
 * ORACLE PARITAS: menjalankan kode KDS2 (Laravel, folder referensi, TIDAK diubah) terhadap
 * MySQL `kds2_produksi` dan mengembalikan data yang akan dirender KDS2. Dipakai tes paritas F3+
 * sebagai "kunci jawaban" yang sebenarnya, bukan terjemahan SQL.
 *
 * Pemakaian:  php kds2-oracle.php <berkas-masukan.json> <berkas-keluaran.json>
 *   masukan : {"permintaan":[{"id":"a","laporan":"nominatif.index","params":{"bulan":10,"tahun":2026}}]}
 *   keluaran: {"a":{...hasil...}}  (galat per permintaan: {"error":"..."})
 *
 * Pengaman: sesi MySQL READ ONLY (server menolak tulis), cache/session/queue memakai driver array
 * (tidak ada tulis ke tabel cache/sessions). Keluaran berisi data pegawai asli: hanya untuk
 * berkas sementara yang dihapus oleh pemanggil; JANGAN dicetak atau di-commit.
 * Variabel lingkungan: KDS2_PATH, KDS2_DB (bawaan kds2_produksi).
 */

declare(strict_types=1);

$kds2 = rtrim(getenv('KDS2_PATH') ?: 'D:/ANAS/Project/Sistem Kepegawaian UM', '/\\');
$namaDb = getenv('KDS2_DB') ?: 'kds2_produksi';

foreach ([
    'DB_DATABASE' => $namaDb, 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array',
    'QUEUE_CONNECTION' => 'sync', 'APP_ENV' => 'testing', 'LOG_CHANNEL' => 'null',
] as $k => $v) {
    putenv("$k=$v");
    $_ENV[$k] = $v;
    $_SERVER[$k] = $v;
}

if ($argc < 3) {
    fwrite(STDERR, "Pemakaian: php kds2-oracle.php <masukan.json> <keluaran.json>\n");
    exit(2);
}
[$berkasMasuk, $berkasKeluar] = [$argv[1], $argv[2]];

require $kds2.'/vendor/autoload.php';
$app = require $kds2.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

DB::statement('SET SESSION TRANSACTION READ ONLY');

$minta = fn (array $params): Request => Request::create('/', 'GET', $params);

/** Daftar laporan yang bisa ditanyakan. Tambahkan per tahap F3. */
$penangan = [
    'ping' => fn (array $p) => [
        'db' => DB::getDatabaseName(),
        'tz' => date_default_timezone_get(),
        'php' => PHP_VERSION,
    ],

    // Membuktikan sesi memang read-only: percobaan tulis HARUS ditolak server.
    'tulisDiblokir' => function (array $p) {
        try {
            DB::table('pegawai')->where('nip', '__tidak_ada__')->delete();

            return ['diblokir' => false];
        } catch (Throwable $e) {
            return ['diblokir' => true];
        }
    },

    'filterJenisStatus.dariRequest' => function (array $p) use ($minta) {
        [$jenis, $status] = App\Support\FilterJenisStatus::dariRequest($minta($p));

        return ['jenis' => $jenis, 'status' => $status];
    },

    'filterKeaktifan.dariRequest' => fn (array $p) => App\Support\FilterKeaktifan::dariRequest($minta($p)),

    'filterKeaktifan.nipNonaktif' => fn (array $p) => App\Support\FilterKeaktifan::nipNonaktif((int) $p['tahun']),

    'namaFileUnduhan' => fn (array $p) => App\Support\NamaFileUnduhan::buat(
        $p['tab'], $p['jenis'] ?? [], $p['status'] ?? [], $p['periode'], $p['urutanStatus'] ?? [], $p['keaktifan'] ?? null
    ),

    // Urutan kode status seperti dropdown KDS2 (orderBy nama) dan daftar kode sah.
    'master.urutanStatus' => fn (array $p) => App\Models\MasterData\MstStatusKepegawaian::orderBy('nama')->pluck('kode')->all(),

    // Pengambilan periode bawaan tanpa parameter (bulan/tahun terbaru snapshot, atau now()).
    'periode.bawaan.nominatif' => function (array $p) use ($app, $minta) {
        $d = $app->make(App\Http\Controllers\NominatifBulananController::class)->index($minta($p))->getData();

        return ['bulan' => $d['bulan'], 'tahun' => $d['tahun']];
    },

    // Detail banyak snapshot sekaligus: nilai yang ditampilkan view nominatif/show.blade.php.
    'nominatif.showBanyak' => function (array $p) use ($app) {
        $ctl = $app->make(App\Http\Controllers\NominatifBulananController::class);
        $hasil = [];
        foreach ($p['ids'] as $id) {
            $n = $ctl->show(App\Models\NominatifBulanan::findOrFail((int) $id))->getData()['nominatif'];
            $fmt = fn ($d) => $d?->format('d-m-Y');
            $jabatan = match ($n->jenis_pegawai_kode) {
                'DSN' => [['Jabatan Fungsional Dosen', $n->jabatanFungsionalDosen?->nama ?? '-']],
                'TDK' => [
                    ['Jabatan Fungsional Tendik', $n->jabatanFungsionalTendik ? "{$n->jabatanFungsionalTendik->jabatan_pokok} ({$n->jabatanFungsionalTendik->jenjang})" : '-'],
                    ['Jabatan Fungsi Umum Pelaksana', $n->jabatanFungsiUmum?->nama ?? '-'],
                ],
                'AKL' => [['Kategori Akademisi Luar', $n->kategoriAkademisiLuar?->nama ?? '-']],
                default => [],
            };
            $hasil[$id] = [
                'id' => $n->id, 'nip' => $n->nip, 'nama' => $n->nama, 'bulan' => $n->bulan, 'tahun' => $n->tahun,
                'periodeLabel' => \Carbon\Carbon::create($n->tahun, $n->bulan, 1)->translatedFormat('F Y'),
                'jenisKelamin' => $n->jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan',
                'tanggalLahir' => $fmt($n->tanggal_lahir) ?? '-',
                'pendidikan' => $n->pendidikan_terakhir ?? '-',
                'agama' => $n->agama ?? '-',
                'tmt' => $fmt($n->tanggal_mulai_kerja),
                'unit' => $n->unitAsal?->nama, 'unitInduk' => $n->unitAsal?->unitInduk?->nama,
                'jenisPegawai' => $n->jenisPegawai?->nama,
                'status' => $n->statusKepegawaian?->nama.' ('.$n->statusKepegawaian?->kategori.')',
                'golongan' => $n->golongan?->kode ?? '-',
                'jabatan' => $jabatan,
                'dasarRemunerasi' => $n->dasar_remunerasi,
                'jabatanTambahan' => $n->jabatanTambahan->map(fn ($jt) => [
                    'role' => $jt->role?->nama_role,
                    'tempat' => $jt->programStudi?->nama ?? $jt->unitAsal?->nama ?? '-',
                    'status' => $jt->status_pengangkatan,
                ])->values()->all(),
            ];
        }

        return $hasil;
    },

    // Ekspor Excel Nominatif: judul kolom + baris persis seperti yang ditulis maatwebsite.
    'nominatif.export' => function (array $p) {
        $e = new App\Exports\NominatifExport(
            (int) $p['bulan'], (int) $p['tahun'], $p['jenis_pegawai_kode'] ?? null, $p['unit_asal_kode'] ?? null
        );

        return [
            'headings' => $e->headings(),
            'rows' => $e->collection()->map(fn ($r) => $e->map($r))->values()->all(),
        ];
    },

    // Laporan "Pegawai Belum Ada Rekap": data yang diberikan controller ke view (urutan = urutan controller).
    'rekap.belumUpload' => function (array $p) use ($app, $minta) {
        $d = $app->make(App\Http\Controllers\RekapKehadiranBelumUploadController::class)->index($minta($p))->getData();

        return [
            'bulan' => $d['bulan'], 'tahun' => $d['tahun'],
            'totalNominatif' => $d['totalNominatif'], 'totalSudahRekap' => $d['totalSudahRekap'],
            'jumlahBelumTmt' => $d['jumlahBelumTmt'], 'jumlahSudahTidakAktif' => $d['jumlahSudahTidakAktif'],
            'jumlahPerluTindakLanjut' => $d['jumlahPerluTindakLanjut'],
            'ringkasanPerUnit' => collect($d['ringkasanPerUnit'])->map(fn ($n, $unit) => [(string) $unit, $n])->values()->all(),
            'belum' => $d['belum']->map(fn ($b) => [
                'nip' => (string) $b['nip'], 'nama' => $b['nama'], 'jenis' => $b['jenis'], 'unit' => $b['unit'],
                'tmt' => $b['tmt']->format('d-m-Y'), 'belumTmt' => $b['belum_tmt'], 'keterangan' => $b['keterangan'],
            ])->values()->all(),
        ];
    },

    // Koreksi yang berlaku pada satu bulan (dasar sel berwarna di Rekap Bulanan).
    'koreksi.berlaku' => fn (array $p) => $app->make(App\Services\KoreksiRekapService::class)
        ->koreksiBerlaku((int) $p['bulan'], (int) $p['tahun']),

    // Rekap Kehadiran Bulanan: data view + tanda sel/lencana yang dihitung view bulanan.blade.php.
    'rekap.bulanan' => function (array $p) use ($app, $minta) {
        $d = $app->make(App\Http\Controllers\RekapKehadiranReportController::class)
            ->bulanan($minta($p), $app->make(App\Services\KoreksiRekapService::class))->getData();
        $baris = [];
        foreach ($d['nominatif'] as $item) {
            $nilai = $d['nilaiPerNip']->get($item->nip);
            $tandai = [];
            foreach ($d['koreksiPerNip'][$item->nip] ?? [] as $k) {
                $info = 'Dikoreksi: '.$k['alasan'].' ('.$k['dari'].' → '.($k['ke'] ?? 'dihapus').')';
                if ($k['ke'] === null || (int) ($nilai?->get($k['dari']) ?? 0) > 0) {
                    $tandai[$k['dari']] = $info;
                }
                if ($k['ke'] !== null && (int) ($nilai?->get($k['ke']) ?? 0) > 0) {
                    $tandai[$k['ke']] = $info;
                }
            }
            $badge = null;
            if ($d['catatanStatus']->has($item->nip)) {
                $badge = ['catatan', $d['catatanStatus'][$item->nip]];
            } elseif (isset($d['nipNonaktif'][(string) $item->nip])) {
                $badge = ['belum', 'Belum ada keterangan'];
            }
            $baris[] = [
                'id' => $item->id, 'nip' => (string) $item->nip, 'nama' => $item->nama,
                'nilai' => $nilai ? $nilai->all() : null, 'badge' => $badge, 'tandai' => (object) $tandai,
            ];
        }

        return [
            'bulan' => $d['bulan'], 'tahun' => $d['tahun'], 'jenis' => $d['jenis'], 'status' => $d['status'],
            'keaktifan' => $d['keaktifan'], 'namaFile' => $d['namaFile'],
            'komponen' => $d['komponenList']->map(fn ($k) => ['kode' => $k->kode, 'nama' => $k->nama])->values()->all(),
            'baris' => $baris,
        ];
    },

    // Ekspor Excel Rekap Bulanan: parameter diurai seperti controller exportBulanan.
    'rekap.bulanan.export' => function (array $p) use ($minta) {
        $req = $minta($p);
        [$jenis, $status] = App\Support\FilterJenisStatus::dariRequest($req);
        $e = new App\Exports\RekapKehadiranBulananExport(
            (int) $req->input('bulan', now()->month), (int) $req->input('tahun', now()->year),
            $req->input('jenis_pegawai_kode'), $req->input('unit_asal_kode'),
            $jenis, $status, App\Support\FilterKeaktifan::dariRequest($req)
        );

        return ['headings' => $e->headings(), 'rows' => $e->collection()->values()->all()];
    },

    // Rekap Kehadiran Tahunan: data view + nilai sel yang dirender view tahunan.blade.php.
    'rekap.tahunan' => function (array $p) use ($app, $minta) {
        $d = $app->make(App\Http\Controllers\RekapKehadiranReportController::class)->tahunan($minta($p))->getData();
        $baris = [];
        foreach ($d['nominatif'] as $item) {
            $total = $d['totalPerNip'][$item->nip] ?? [];
            $badge = null;
            if ($d['catatanStatus']->has($item->nip)) {
                $badge = ['catatan', $d['catatanStatus'][$item->nip]];
            } elseif (isset($d['nipNonaktif'][(string) $item->nip])) {
                $badge = ['belum', 'Belum ada keterangan'];
            }
            $baris[] = [
                'id' => $item->id, 'nip' => (string) $item->nip, 'nama' => $item->nama, 'badge' => $badge,
                // nilai persis seperti sel view: $total[kode] ?? (teks ? '-' : '0')
                'sel' => $d['komponenList']->map(fn ($k) => (string) ($total[$k->kode] ?? ($k->tipe_nilai === 'teks' ? '-' : '0')))->values()->all(),
            ];
        }

        return [
            'tahun' => $d['tahun'], 'jenis' => $d['jenis'], 'status' => $d['status'], 'keaktifan' => $d['keaktifan'],
            'namaFile' => $d['namaFile'],
            'komponen' => $d['komponenList']->map(fn ($k) => ['kode' => $k->kode, 'nama' => $k->nama, 'tipe' => $k->tipe_nilai])->values()->all(),
            'baris' => $baris,
        ];
    },

    'rekap.tahunan.export' => function (array $p) use ($minta) {
        $req = $minta($p);
        [$jenis, $status] = App\Support\FilterJenisStatus::dariRequest($req);
        $e = new App\Exports\RekapKehadiranTahunanExport(
            (int) $req->input('tahun', now()->year), $req->input('jenis_pegawai_kode'), $req->input('unit_asal_kode'),
            $jenis, $status, App\Support\FilterKeaktifan::dariRequest($req)
        );

        return ['headings' => $e->headings(), 'rows' => $e->collection()->values()->all()];
    },

    // Daftar id snapshot per periode (untuk menyusun sampel tes).
    'nominatif.index' => function (array $p) use ($app, $minta) {
        $d = $app->make(App\Http\Controllers\NominatifBulananController::class)->index($minta($p))->getData();

        return [
            'bulan' => $d['bulan'],
            'tahun' => $d['tahun'],
            'namaFile' => $d['namaFile'],
            'baris' => $d['nominatif']->map(fn ($n) => [
                'id' => $n->id, 'nip' => $n->nip, 'nama' => $n->nama,
                'jenis' => $n->jenisPegawai?->nama, 'unit' => $n->unitAsal?->nama,
            ])->values()->all(),
        ];
    },
];

$masuk = json_decode((string) file_get_contents($berkasMasuk), true, 512, JSON_THROW_ON_ERROR);
$hasil = [];
foreach ($masuk['permintaan'] ?? [] as $r) {
    try {
        $fn = $penangan[$r['laporan']] ?? throw new InvalidArgumentException('laporan tidak dikenal: '.$r['laporan']);
        $hasil[$r['id']] = $fn($r['params'] ?? []);
    } catch (Throwable $e) {
        $hasil[$r['id']] = ['error' => $e->getMessage()];
    }
}

file_put_contents(
    $berkasKeluar,
    json_encode($hasil, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR)
);
