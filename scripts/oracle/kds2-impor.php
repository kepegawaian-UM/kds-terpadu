<?php
/**
 * ORACLE PARITAS IMPORTER: menjalankan importer KDS2 ASLI (kode Laravel di folder referensi, TIDAK diubah)
 * di SQLite DALAM MEMORI (cara yang sama dengan tes KDS2 sendiri). Tidak menyentuh MySQL dan tidak memakai
 * data asli: keadaan awal (pegawai, snapshot Nominatif, rekap lama) dikirim sebagai JSON sintetis.
 *
 * Pemakaian:  php kds2-impor.php <masukan.json> <keluaran.json>
 *   masukan : {"kasus":[{
 *       "id":"a",
 *       "keadaan":{"nominatif":[{"nip","bulan","tahun","jenis","tmt"}], "pegawai":["nip"],
 *                  "rekap":[{"nip","bulan","tahun","komponen":{"I":"2"}}]},
 *       "berkas":"C:/tmp/x.xlsx",                      // berkas yang dibaca importer
 *       "tulisBerkas":{"baris":[[...22 sel...]], "namaSheet":["Data","Lain"], "indeksData":0}, // opsional: oracle menulis berkas
 *                                                        // dengan PhpSpreadsheet ke "berkas" (sel {"f":"A1-B1"} = rumus)
 *       "bulan":9, "tahun":2026, "namaSheet":null, "namaFileAsli":"rekap.xlsx" }]}
 *   keluaran: {"a":{"batch":{...},"rekap":[...],"catatan":[...],"galat":null}}
 */

declare(strict_types=1);

require __DIR__.'/sqlite-umum.php';

use App\Services\RekapKehadiranImporter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

$masuk = json_decode((string) file_get_contents($berkasMasuk), true, 512, JSON_THROW_ON_ERROR);
$keluar = ['_konfigurasi' => config('rekap_kehadiran')];

foreach ($masuk['kasus'] as $kasus) {
    DB::beginTransaction();
    try {
        muatKeadaan($kasus['keadaan'] ?? []);
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

        $rekap = array_map(function ($h) {
            $h['detail'] = array_map(fn ($d) => [$d[1], $d[2]], $h['detail']);

            return $h;
        }, dumpRekap($batch ? (int) $batch->id : null));
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
