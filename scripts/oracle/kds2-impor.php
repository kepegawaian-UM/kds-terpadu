<?php
/**
 * ORACLE PARITAS IMPORTER: menjalankan importer KDS2 ASLI (kode Laravel di folder referensi, TIDAK diubah)
 * di SQLite DALAM MEMORI (cara yang sama dengan tes KDS2 sendiri). Tidak menyentuh MySQL dan tidak memakai
 * data asli: keadaan awal (pegawai, snapshot Nominatif, rekap lama) dikirim sebagai JSON sintetis.
 *
 * Pemakaian:  php kds2-impor.php <masukan.json> <keluaran.json>
 *   masukan : {"kasus":[{
 *       "id":"a", "jenis":"rekap",
 *       "keadaan":{"nominatif":[{"nip","bulan","tahun","jenis","tmt"}], "pegawai":["nip"],
 *                  "rekap":[{"nip","bulan","tahun","komponen":{"I":"2"}}]},
 *       "berkas":"C:/tmp/x.xlsx",                      // berkas yang dibaca importer
 *       "tulisBerkas":{"baris":[[...22 sel...]], "namaSheet":["Data","Lain"], "indeksData":0}, // opsional: oracle menulis berkas
 *                                                        // dengan PhpSpreadsheet ke "berkas" (sel {"f":"A1-B1"} = rumus)
 *       "bulan":9, "tahun":2026, "namaSheet":null, "namaFileAsli":"rekap.xlsx" }]}
 *   keluaran: {"a":{"batch":{...},"rekap":[...],"detail":[...],"catatan":[...],"galat":null}}
 */

declare(strict_types=1);

$kds2 = rtrim(getenv('KDS2_PATH') ?: 'D:/ANAS/Project/Sistem Kepegawaian UM', '/\\');

foreach ([
    'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => ':memory:', 'DB_URL' => '',
    'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync',
    'APP_ENV' => 'testing', 'LOG_CHANNEL' => 'null',
] as $k => $v) {
    putenv("$k=$v");
    $_ENV[$k] = $v;
    $_SERVER[$k] = $v;
}

if ($argc < 3) {
    fwrite(STDERR, "Pemakaian: php kds2-impor.php <masukan.json> <keluaran.json>\n");
    exit(2);
}
[$berkasMasuk, $berkasKeluar] = [$argv[1], $argv[2]];

require $kds2.'/vendor/autoload.php';
$app = require $kds2.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\NominatifBulanan;
use App\Models\Pegawai;
use App\Models\RekapKehadiranBulanan;
use App\Models\UploadBatch;
use App\Services\RekapKehadiranImporter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

if (DB::connection()->getDriverName() !== 'sqlite') {
    fwrite(STDERR, "Oracle importer hanya boleh berjalan di SQLite memori.\n");
    exit(3);
}

Artisan::call('migrate:fresh', ['--force' => true]);
Artisan::call('db:seed', ['--class' => Database\Seeders\MasterDataSeeder::class, '--force' => true]);

function tulisBerkas(string $jalur, array $spec): void
{
    $buku = new Spreadsheet;
    $buku->removeSheetByIndex(0);
    $nama = $spec['namaSheet'] ?? ['Data']; // daftar nama sheet berurutan
    $indeksData = $spec['indeksData'] ?? 0; // sheet mana yang berisi baris data
    foreach ($nama as $i => $n) {
        $sheet = $buku->createSheet($i);
        $sheet->setTitle($n);
        $baris = $i === $indeksData ? $spec['baris'] : [['x']];
        foreach ($baris as $r => $sel) {
            foreach ($sel as $c => $v) {
                $alamat = [$c + 1, $r + 1];
                if ($v === null) {
                    continue;
                }
                if (is_array($v) && isset($v['f'])) {
                    $sheet->setCellValue($alamat, '='.$v['f']);
                } elseif (is_string($v)) {
                    $sheet->setCellValueExplicit($alamat, $v, DataType::TYPE_STRING);
                } else {
                    $sheet->setCellValue($alamat, $v);
                }
            }
        }
    }
    $buku->setActiveSheetIndex(0);
    (new Xlsx($buku))->save($jalur);
    $buku->disconnectWorksheets();
}

function muatKeadaan(array $k): int
{
    $unit = DB::table('mst_unit_asal')->orderBy('kode')->value('kode');
    $batchNominatif = UploadBatch::create([
        'jenis' => 'nominatif_bulanan', 'nama_file' => 'n.xlsx', 'diupload_oleh' => 't',
        'diupload_pada' => now(), 'total_baris' => 1, 'baris_berhasil' => 1, 'baris_gagal' => 0,
    ])->id;
    foreach ($k['pegawai'] ?? [] as $nip) {
        Pegawai::firstOrCreate(['nip' => (string) $nip], ['dibuat_pada' => now()]);
    }
    foreach ($k['nominatif'] ?? [] as $s) {
        Pegawai::firstOrCreate(['nip' => (string) $s['nip']], ['dibuat_pada' => now()]);
        NominatifBulanan::create([
            'nip' => (string) $s['nip'], 'bulan' => $s['bulan'], 'tahun' => $s['tahun'], 'nama' => 'Pegawai '.$s['nip'],
            'jenis_kelamin' => 'L', 'jenis_pegawai_kode' => $s['jenis'], 'status_kepegawaian_kode' => 'PNS',
            'unit_asal_kode' => $unit, 'tanggal_mulai_kerja' => $s['tmt'], 'upload_batch_id' => $batchNominatif,
        ]);
    }
    $batchRekapLama = null;
    foreach ($k['rekap'] ?? [] as $r) {
        Pegawai::firstOrCreate(['nip' => (string) $r['nip']], ['dibuat_pada' => now()]);
        $batchRekapLama ??= UploadBatch::create([
            'jenis' => 'kehadiran_bulanan', 'nama_file' => 'lama.xlsx', 'diupload_oleh' => 't',
            'diupload_pada' => now(), 'total_baris' => 1, 'baris_berhasil' => 1, 'baris_gagal' => 0,
        ])->id;
        $h = RekapKehadiranBulanan::create([
            'nip' => (string) $r['nip'], 'bulan' => $r['bulan'], 'tahun' => $r['tahun'], 'upload_batch_id' => $batchRekapLama,
        ]);
        foreach ($r['komponen'] as $kode => $nilai) {
            DB::table('rekap_kehadiran_detail')->insert([
                'rekap_kehadiran_bulanan_id' => $h->id, 'komponen_kode' => $kode, 'nilai' => (string) $nilai,
            ]);
        }
    }

    return (int) DB::table('upload_batch')->max('id');
}

$masuk = json_decode((string) file_get_contents($berkasMasuk), true, 512, JSON_THROW_ON_ERROR);
$keluar = ['_konfigurasi' => config('rekap_kehadiran')];

foreach ($masuk['kasus'] as $kasus) {
    DB::beginTransaction();
    try {
        $batasBatchId = muatKeadaan($kasus['keadaan'] ?? []);
        if (isset($kasus['tulisBerkas'])) {
            tulisBerkas($kasus['berkas'], $kasus['tulisBerkas']);
        }

        $galat = null;
        $batch = null;
        try {
            $berkas = new UploadedFile($kasus['berkas'], $kasus['namaFileAsli'] ?? 'rekap.xlsx', null, null, true);
            $batch = app(RekapKehadiranImporter::class)->import(
                $berkas, (int) $kasus['bulan'], (int) $kasus['tahun'], 'oracle', $kasus['namaSheet'] ?? null
            );
        } catch (Throwable $e) {
            $galat = get_class($e).': '.$e->getMessage();
        }

        $rekap = [];
        foreach (DB::table('rekap_kehadiran_bulanan')->orderBy('id')->get() as $h) {
            $rekap[] = [
                'nip' => $h->nip, 'bulan' => (int) $h->bulan, 'tahun' => (int) $h->tahun,
                'baru' => $batch !== null && (int) $h->upload_batch_id === (int) $batch->id,
                'detail' => DB::table('rekap_kehadiran_detail')->where('rekap_kehadiran_bulanan_id', $h->id)->orderBy('id')
                    ->get(['komponen_kode', 'nilai'])->map(fn ($d) => [$d->komponen_kode, $d->nilai])->all(),
            ];
        }
        $catatan = $batch ? DB::table('upload_error_rows')->where('upload_batch_id', $batch->id)->orderBy('id')
            ->get(['nomor_baris', 'nip_dimaksud', 'alasan_gagal'])->map(fn ($c) => [(int) $c->nomor_baris, $c->nip_dimaksud, $c->alasan_gagal])->all() : [];

        $keluar[$kasus['id']] = [
            'galat' => $galat,
            'batch' => $batch ? [
                'jenis' => $batch->jenis, 'nama_file' => $batch->nama_file, 'diupload_oleh' => $batch->diupload_oleh,
                'total_baris' => (int) $batch->total_baris, 'baris_berhasil' => (int) $batch->baris_berhasil, 'baris_gagal' => (int) $batch->baris_gagal,
            ] : null,
            'rekap' => $rekap,
            'catatan' => $catatan,
        ];
    } finally {
        DB::rollBack();
    }
}

file_put_contents($berkasKeluar, json_encode($keluar, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
