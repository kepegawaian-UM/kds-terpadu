<?php
/**
 * ORACLE PARITAS IMPORTER NOMINATIF: NominatifBulananImporter + KontrakNominatif KDS2 ASLI di SQLite memori
 * (lihat sqlite-umum.php). Tanpa MySQL, tanpa data asli.
 *
 * Pemakaian:  php kds2-nominatif.php <masukan.json> <keluaran.json>
 *   masukan : {"master":{"mst_jenis_pegawai":[{...}],...},                       // opsional, mengganti master di SQLite
 *              "kasus":[{"id","keadaan":{"pegawai","nominatif":[{"nip","bulan","tahun","jenis","tmt","jt":[{"role","unit","prodi","status"}]}]},
 *                        "berkas":"C:/tmp/x.xlsx","tulisBerkas":{"baris":[[sel...]],"namaSheet":["Data"],"indeksData":0},
 *                        "bulan":9,"tahun":2026,"namaFileAsli":"nominatif.xlsx"}]}
 *   sel     : skalar | {"f":"A1-B1"} rumus | {"d":"2018-01-01"} sel tanggal (nomor seri Excel + format tanggal)
 *   keluaran: {"id":{"galat":null|"...","batch":{...},"pegawai":[nip...],"nominatif":[...],"jt":[...],"catatan":[...]}}
 */

declare(strict_types=1);

require __DIR__.'/sqlite-umum.php';

use App\Services\NominatifBulananImporter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

$masuk = json_decode((string) file_get_contents($berkasMasuk), true, 512, JSON_THROW_ON_ERROR);
if (! empty($masuk['master'])) {
    muatMaster($masuk['master']);
}
$keluar = [];

foreach ($masuk['kasus'] as $kasus) {
    DB::beginTransaction();
    try {
        muatKeadaan($kasus['keadaan'] ?? []);
        $idBatchAwal = (int) DB::table('upload_batch')->max('id');
        if (isset($kasus['tulisBerkas'])) {
            tulisBerkas($kasus['berkas'], $kasus['tulisBerkas']);
        }

        $galat = null;
        $batch = null;
        try {
            $berkas = new UploadedFile($kasus['berkas'], $kasus['namaFileAsli'] ?? 'nominatif.xlsx', null, null, true);
            $batch = app(NominatifBulananImporter::class)->import($berkas, (int) $kasus['bulan'], (int) $kasus['tahun'], 'oracle');
        } catch (Throwable $e) {
            $galat = get_class($e).': '.$e->getMessage();
            if ($e instanceof Illuminate\Validation\ValidationException) {
                $galat = 'ValidationException: '.implode(' ', $e->errors()['file'] ?? []);
            }
        }

        $nominatif = DB::table('nominatif_bulanan')->orderBy('id')->get()->map(function ($n) use ($batch, $idBatchAwal) {
            $a = (array) $n;
            $a['upload_batch_id'] = $batch && (int) $n->upload_batch_id === (int) $batch->id ? 'baru' : 'lama';
            unset($a['dibuat_pada']);

            return $a;
        })->all();

        $keluar[$kasus['id']] = [
            'galat' => $galat,
            'batch' => $batch ? [
                'jenis' => $batch->jenis, 'nama_file' => $batch->nama_file, 'diupload_oleh' => $batch->diupload_oleh,
                'total_baris' => (int) $batch->total_baris, 'baris_berhasil' => (int) $batch->baris_berhasil, 'baris_gagal' => (int) $batch->baris_gagal,
            ] : null,
            'pegawai' => DB::table('pegawai')->orderBy('nip')->pluck('nip')->all(),
            'nominatif' => $nominatif,
            'jt' => DB::table('nominatif_bulanan_jabatan_tambahan')->orderBy('id')->get()->map(fn ($j) => (array) $j)->all(),
            'catatan' => $batch ? DB::table('upload_error_rows')->where('upload_batch_id', $batch->id)->orderBy('id')
                ->get(['nomor_baris', 'nip_dimaksud', 'alasan_gagal'])->map(fn ($c) => [(int) $c->nomor_baris, $c->nip_dimaksud, $c->alasan_gagal])->all() : [],
        ];
    } finally {
        DB::rollBack();
    }
}

file_put_contents($berkasKeluar, json_encode($keluar, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR | JSON_PARTIAL_OUTPUT_ON_ERROR));
