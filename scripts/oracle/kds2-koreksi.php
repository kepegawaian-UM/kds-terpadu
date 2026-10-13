<?php
/**
 * ORACLE PARITAS KOREKSI REKAP: menjalankan KoreksiRekapService + importer KDS2 ASLI di SQLite memori
 * (lihat sqlite-umum.php). Satu kasus = keadaan awal sintetis + urutan langkah; keluaran = hasil tiap langkah
 * dan keadaan akhir (rekap + detail ber-id, koreksi, audit_log).
 *
 * langkah: {"op":"impor","berkas":..,"tulisBerkas":..,"bulan":9,"tahun":2026,"pengguna":"Admin"}  (impor rekap + terapkan koreksi bulan itu, seperti controller)
 *          {"op":"buat","data":{...},"pengguna":"Admin"}      (simpan + terapkan, seperti KoreksiRekapController::store)
 *          {"op":"pratinjau","data":{...}}
 *          {"op":"batalkan","indeks":0,"pengguna":"Admin"}    (indeks = urutan koreksi menurut id, mulai 0)
 *          {"op":"terapkanUlang","bulan":9,"tahun":2026,"pengguna":"Admin"}
 *          {"op":"koreksiBerlaku","bulan":9,"tahun":2026} | {"op":"koreksiBerlakuNip","nip":"..","tahun":2026}
 *          {"op":"komponenTersedia"}
 */

declare(strict_types=1);

require __DIR__.'/sqlite-umum.php';

use App\Http\Requests\KoreksiRekapRequest;
use App\Models\KoreksiRekap;
use App\Models\User;
use App\Services\KoreksiRekapImporter;
use App\Services\KoreksiRekapService;
use App\Services\RekapKehadiranImporter;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Salinan KoreksiRekapController::buatDariRequest (data sudah tervalidasi). */
function buatDariData(array $data, string $pengguna): KoreksiRekap
{
    $angka = $data['jenis'] === 'angka';
    $awalBulan = $angka ? Carbon::create((int) $data['tahun'], (int) $data['bulan'], 1) : null;

    return new KoreksiRekap([
        'nip' => $data['nip'],
        'jenis' => $data['jenis'],
        'dari_komponen' => $data['dari_komponen'],
        'ke_komponen' => $data['ke_komponen'] ?? null,
        'tanggal_mulai' => $angka ? $awalBulan->toDateString() : $data['tanggal_mulai'],
        'tanggal_selesai' => $angka ? $awalBulan->copy()->endOfMonth()->toDateString() : ($data['tanggal_selesai'] ?? null),
        'bulan' => $angka ? (int) $data['bulan'] : null,
        'tahun' => $angka ? (int) $data['tahun'] : null,
        'jumlah_hari' => $angka ? (int) $data['jumlah_hari'] : null,
        'alasan' => $data['alasan'],
        'sumber' => $data['sumber'] ?? null,
        'dibuat_oleh' => $pengguna,
        'dibuat_pada' => now(),
    ]);
}

function sebagaiPengguna(?string $nama): void
{
    if ($nama === null) {
        Auth::logout();

        return;
    }
    Auth::setUser((new User)->forceFill(['id' => 1, 'name' => $nama]));
}

$masuk = json_decode((string) file_get_contents($berkasMasuk), true, 512, JSON_THROW_ON_ERROR);
$keluar = [];
$service = app(KoreksiRekapService::class);

foreach ($masuk['kasus'] as $kasus) {
    DB::beginTransaction();
    try {
        muatKeadaan($kasus['keadaan'] ?? []);
        DB::table('audit_log')->delete(); // jejak pemuatan keadaan bukan bagian dari yang diuji

        $hasilLangkah = [];
        foreach ($kasus['langkah'] as $langkah) {
            sebagaiPengguna($langkah['pengguna'] ?? null);
            try {
                $hasil = match ($langkah['op']) {
                    'impor' => (function () use ($langkah, $service) {
                        if (isset($langkah['tulisBerkas'])) {
                            tulisBerkas($langkah['berkas'], $langkah['tulisBerkas']);
                        }
                        $berkas = new UploadedFile($langkah['berkas'], 'rekap.xlsx', null, null, true);
                        $batch = app(RekapKehadiranImporter::class)->import($berkas, (int) $langkah['bulan'], (int) $langkah['tahun'], $langkah['pengguna'] ?? 'system');

                        return ['batch' => (int) $batch->id, 'koreksi' => $service->terapkanUntukBulan((int) $langkah['bulan'], (int) $langkah['tahun'])];
                    })(),
                    'buat' => (function () use ($langkah, $service) {
                        $koreksi = KoreksiRekap::create(buatDariData($langkah['data'], $langkah['pengguna'] ?? 'system')->getAttributes());

                        return $service->terapkanKoreksi($koreksi);
                    })(),
                    'pratinjau' => $service->pratinjau(buatDariData($langkah['data'], $langkah['pengguna'] ?? 'system'))->all(),
                    'batalkan' => (function () use ($langkah) {
                        $k = KoreksiRekap::orderBy('id')->get()[$langkah['indeks']];
                        $k->update(['dibatalkan_pada' => now()]);

                        return ['id' => (int) $k->id];
                    })(),
                    'terapkanUlang' => $service->terapkanUntukBulan((int) $langkah['bulan'], (int) $langkah['tahun']),
                    'koreksiBerlaku' => $service->koreksiBerlaku((int) $langkah['bulan'], (int) $langkah['tahun']),
                    'koreksiBerlakuNip' => array_map(
                        fn ($daftar) => array_map(fn ($k) => (int) $k->id, $daftar),
                        $service->koreksiBerlakuUntukNip($langkah['nip'], (int) $langkah['tahun'])
                    ),
                    'komponenTersedia' => $service->komponenTersedia()->all(),
                    'imporKoreksi' => (function () use ($langkah) {
                        if (isset($langkah['tulisBerkas'])) {
                            tulisBerkas($langkah['berkas'], $langkah['tulisBerkas']);
                        }
                        $berkas = new UploadedFile($langkah['berkas'], 'koreksi.xlsx', null, null, true);
                        $importer = app(KoreksiRekapImporter::class);
                        $hasil = $importer->parse($berkas);
                        $keluar = ['parse' => $hasil, 'simpan' => null];
                        if (! empty($langkah['simpan']) && ! isset($hasil['galat'])) {
                            $keluar['simpan'] = $importer->simpan($hasil['baris'], $langkah['pengguna'] ?? 'system');
                        }

                        return $keluar;
                    })(),
                    'validasi' => (function () use ($langkah) {
                        $request = KoreksiRekapRequest::create('/koreksi-rekap', 'POST', $langkah['input']);
                        $request->setContainer(app())->setRedirector(app('redirect'));
                        try {
                            $request->validateResolved();

                            return ['galat' => null];
                        } catch (ValidationException $e) {
                            return ['galat' => $e->errors()];
                        }
                    })(),
                };
                $hasilLangkah[] = ['hasil' => $hasil, 'galat' => null];
            } catch (Throwable $e) {
                $hasilLangkah[] = ['hasil' => null, 'galat' => get_class($e).': '.$e->getMessage()];
            }
        }

        $keluar[$kasus['id']] = [
            'langkah' => $hasilLangkah,
            'rekap' => dumpRekap(),
            'koreksi' => DB::table('koreksi_rekap')->orderBy('id')->get()->map(fn ($k) => (array) $k)->all(),
            'audit' => DB::table('audit_log')->orderBy('id')->get()->map(fn ($a) => [
                $a->nama_tabel, $a->id_record, $a->field_diubah, $a->nilai_lama, $a->nilai_baru, $a->diubah_oleh, $a->aksi,
            ])->all(),
        ];
    } finally {
        Auth::logout();
        DB::rollBack();
    }
}

file_put_contents($berkasKeluar, json_encode($keluar, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR | JSON_PARTIAL_OUTPUT_ON_ERROR));
