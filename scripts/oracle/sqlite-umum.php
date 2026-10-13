<?php
/**
 * Bagian bersama oracle importer/koreksi: boot Laravel KDS2 (folder referensi, TIDAK diubah) di SQLite DALAM
 * MEMORI (seperti tes KDS2 sendiri), migrasi + master data, pemuat keadaan sintetis, dan penulis berkas xlsx.
 * Tidak menyentuh MySQL dan tidak memakai data asli.
 */

declare(strict_types=1);

use App\Models\NominatifBulanan;
use App\Models\Pegawai;
use App\Models\RekapKehadiranBulanan;
use App\Models\UploadBatch;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Shared\Date as SpreadsheetDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

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
    fwrite(STDERR, "Pemakaian: php <oracle>.php <masukan.json> <keluaran.json>\n");
    exit(2);
}
[$berkasMasuk, $berkasKeluar] = [$argv[1], $argv[2]];

require $kds2.'/vendor/autoload.php';
$app = require $kds2.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

if (DB::connection()->getDriverName() !== 'sqlite') {
    fwrite(STDERR, "Oracle ini hanya boleh berjalan di SQLite memori.\n");
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
                if (is_array($v) && isset($v['d'])) {
                    $sheet->setCellValue($alamat, SpreadsheetDate::PHPToExcel(strtotime($v['d'].' 00:00:00 UTC')));
                    $sheet->getStyle($alamat)->getNumberFormat()->setFormatCode('yyyy-mm-dd');
                } elseif (is_array($v) && isset($v['f'])) {
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

/** Memuat pegawai, snapshot Nominatif, rekap lama, dan koreksi lama (tanpa jejak audit) dari JSON sintetis. */
function muatKeadaan(array $k): void
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
        $baris = NominatifBulanan::create([
            'nip' => (string) $s['nip'], 'bulan' => $s['bulan'], 'tahun' => $s['tahun'], 'nama' => $s['nama'] ?? 'Pegawai '.$s['nip'],
            'jenis_kelamin' => 'L', 'jenis_pegawai_kode' => $s['jenis'], 'status_kepegawaian_kode' => 'PNS',
            'unit_asal_kode' => $unit, 'tanggal_mulai_kerja' => $s['tmt'], 'upload_batch_id' => $batchNominatif,
        ]);
        foreach ($s['jt'] ?? [] as $j) {
            DB::table('nominatif_bulanan_jabatan_tambahan')->insert([
                'nominatif_bulanan_id' => $baris->id, 'jabatan_tambahan_role_kode' => $j['role'], 'unit_asal_kode' => $j['unit'] ?? null,
                'program_studi_kode' => $j['prodi'] ?? null, 'status_pengangkatan' => $j['status'],
            ]);
        }
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
    foreach ($k['koreksi'] ?? [] as $kr) {
        Pegawai::firstOrCreate(['nip' => (string) $kr['nip']], ['dibuat_pada' => now()]);
        DB::table('koreksi_rekap')->insert(array_merge([
            'jenis' => 'periode', 'ke_komponen' => null, 'tanggal_selesai' => null, 'bulan' => null, 'tahun' => null,
            'jumlah_hari' => null, 'diterapkan_batch_id' => null, 'sumber' => null, 'dibuat_oleh' => 'lama',
            'dibuat_pada' => '2026-01-01 00:00:00', 'dibatalkan_pada' => null, 'alasan' => 'lama',
        ], $kr));
    }
}

function dumpRekap(?int $batchBaruId = null): array
{
    $rekap = [];
    foreach (DB::table('rekap_kehadiran_bulanan')->orderBy('id')->get() as $h) {
        $rekap[] = [
            'nip' => $h->nip, 'bulan' => (int) $h->bulan, 'tahun' => (int) $h->tahun,
            'baru' => $batchBaruId !== null && (int) $h->upload_batch_id === $batchBaruId,
            'detail' => DB::table('rekap_kehadiran_detail')->where('rekap_kehadiran_bulanan_id', $h->id)->orderBy('id')
                ->get(['id', 'komponen_kode', 'nilai'])->map(fn ($d) => [(int) $d->id, $d->komponen_kode, $d->nilai])->all(),
        ];
    }

    return $rekap;
}

/** Mengganti isi tabel master di SQLite dengan baris dari TS (supaya nama->kode identik dengan database uji). */
function muatMaster(array $master): void
{
    DB::statement('PRAGMA foreign_keys = OFF');
    foreach ($master as $tabel => $baris) {
        DB::table($tabel)->delete();
        $kolom = Schema::getColumnListing($tabel);
        foreach ($baris as $b) {
            $row = [];
            foreach ($b as $k => $v) {
                $snake = Str::snake($k);
                if (in_array($snake, $kolom, true)) {
                    $row[$snake] = is_bool($v) ? (int) $v : $v;
                }
            }
            DB::table($tabel)->insert($row);
        }
    }
    DB::statement('PRAGMA foreign_keys = ON');
}
