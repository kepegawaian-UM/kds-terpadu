<?php
/**
 * ORACLE PARITAS TAMBAH PEGAWAI MANUAL: NominatifBulananController::store + StoreNominatifManualRequest KDS2 ASLI di SQLite
 * memori (lihat sqlite-umum.php). Tanpa MySQL, tanpa data asli.
 *
 * Pemakaian:  php kds2-tambah-pegawai.php <masukan.json> <keluaran.json>
 *   masukan : {"master":{...},"kasus":[{"id","keadaan":{...},"pengguna":"Admin","sekarang":"2026-10-13 10:00:00",
 *             "input":{"nip":"..","nama":"..","jenis_kelamin":"L",...}}]}    // kolom kosong = null (seperti ConvertEmptyStringsToNull)
 *   keluaran: {"id":{"galat":null|{"field":["pesan"]},"pengecualian":null|"..","nominatif":[...],"pegawai":[...],"batch":[...],"audit":[...]}}
 */

declare(strict_types=1);

require __DIR__.'/sqlite-umum.php';

use App\Http\Controllers\NominatifBulananController;
use App\Http\Requests\StoreNominatifManualRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

$masuk = json_decode((string) file_get_contents($berkasMasuk), true, 512, JSON_THROW_ON_ERROR);
if (! empty($masuk['master'])) {
    muatMaster($masuk['master']);
}
$keluar = [];

foreach ($masuk['kasus'] as $kasus) {
    DB::beginTransaction();
    try {
        muatKeadaan($kasus['keadaan'] ?? []);
        DB::table('audit_log')->delete(); // jejak pemuatan keadaan bukan bagian dari yang diuji
        Carbon::setTestNow(Carbon::parse($kasus['sekarang'], 'Asia/Jakarta'));
        $user = (new User)->forceFill(['id' => 1, 'name' => $kasus['pengguna'] ?? 'Admin']);
        Auth::setUser($user);

        $galat = null;
        $pengecualian = null;
        try {
            $request = StoreNominatifManualRequest::create('/nominatif', 'POST', $kasus['input']);
            $request->setContainer(app())->setRedirector(app('redirect'));
            $request->setUserResolver(fn () => $user);
            $request->validateResolved();
            app(NominatifBulananController::class)->store($request);
        } catch (ValidationException $e) {
            $galat = $e->errors();
        } catch (Throwable $e) {
            $pengecualian = get_class($e).': '.$e->getMessage();
        }

        $keluar[$kasus['id']] = [
            'galat' => $galat,
            'pengecualian' => $pengecualian,
            'pegawai' => DB::table('pegawai')->orderBy('nip')->pluck('nip')->all(),
            'nominatif' => DB::table('nominatif_bulanan')->orderBy('id')->get()->map(function ($n) {
                $a = (array) $n;
                unset($a['dibuat_pada']);

                return $a;
            })->all(),
            'batch' => DB::table('upload_batch')->where('jenis', 'tambah_pegawai_manual')->orderBy('id')->get(['jenis', 'nama_file', 'diupload_oleh', 'total_baris', 'baris_berhasil', 'baris_gagal'])
                ->map(fn ($b) => (array) $b)->all(),
            'audit' => DB::table('audit_log')->orderBy('id')->get()->map(fn ($a) => [
                $a->nama_tabel, $a->id_record, $a->field_diubah, $a->nilai_lama, $a->nilai_baru, $a->diubah_oleh, $a->aksi,
            ])->all(),
        ];
    } finally {
        Carbon::setTestNow();
        Auth::logout();
        DB::rollBack();
    }
}

file_put_contents($berkasKeluar, json_encode($keluar, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR | JSON_PARTIAL_OUTPUT_ON_ERROR));
