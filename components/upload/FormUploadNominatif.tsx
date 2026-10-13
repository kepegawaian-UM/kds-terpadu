"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { batalkanUploadNominatif, periksaUploadNominatif, simpanUploadNominatif } from "@/app/(app)/nominatif/upload/actions";
import type { RingkasanLayar } from "@/app/(app)/nominatif/upload/actions";
import type { HasilUnggah } from "@/lib/upload/klien";

import { Angka, angka, AWALAN_PERINGATAN, TabelCatatan } from "./bagian";
import { UnggahBerkas } from "./UnggahBerkas";

const NAMA_BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

type Tahap = { jenis: "isi" } | { jenis: "periksa"; unggahan: HasilUnggah } | { jenis: "tinjau"; unggahan: HasilUnggah; ringkasan: RingkasanLayar };

export function FormUploadNominatif({ bulanAwal, tahunAwal }: { bulanAwal: number; tahunAwal: number }) {
  const router = useRouter();
  const [bulan, setBulan] = useState(bulanAwal);
  const [tahun, setTahun] = useState(tahunAwal);
  const [namaSheet, setNamaSheet] = useState("");
  const [tahap, setTahap] = useState<Tahap>({ jenis: "isi" });
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  const masukan = (u: HasilUnggah) => ({ uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile, bulan, tahun, namaSheet: namaSheet.trim() });

  function periksa(u: HasilUnggah) {
    setGalat(null);
    setTahap({ jenis: "periksa", unggahan: u });
    mulai(async () => {
      const h = await periksaUploadNominatif(masukan(u));
      if (h.ok) setTahap({ jenis: "tinjau", unggahan: u, ringkasan: h.ringkasan });
      else {
        setGalat(h.error);
        setTahap({ jenis: "isi" });
        await batalkanUploadNominatif(u.uploadId);
      }
    });
  }

  function simpan(u: HasilUnggah) {
    setGalat(null);
    mulai(async () => {
      const h = await simpanUploadNominatif(masukan(u));
      if (h.ok) router.push(`/nominatif/upload/hasil/${h.batchId}`);
      else setGalat(h.error);
    });
  }

  function batal(u: HasilUnggah) {
    mulai(async () => {
      await batalkanUploadNominatif(u.uploadId);
      setTahap({ jenis: "isi" });
      setGalat(null);
    });
  }

  const mengisi = tahap.jenis === "isi";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <p className="text-sm text-slate-600">
            Berkas mencerminkan <b>seluruh</b> pegawai aktif pada bulan itu: pegawai yang tidak ada di berkas dianggap tidak aktif bulan tersebut.
          </p>
          {/* unduhan berkas dari Route Handler, bukan halaman: <Link> tidak cocok */}
          <a href="/nominatif/upload/template" download className="whitespace-nowrap text-sm text-blue-700 underline">
            Unduh Template
          </a>
        </div>

        <div className="grid max-w-md grid-cols-2 gap-4">
          <div>
            <label htmlFor="nom-bulan" className="block text-sm font-medium">Bulan</label>
            <select id="nom-bulan" className={kotak} value={bulan} onChange={(e) => setBulan(Number(e.target.value))} disabled={!mengisi}>
              {NAMA_BULAN.slice(1).map((n, i) => (
                <option key={n} value={i + 1}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nom-tahun" className="block text-sm font-medium">Tahun</label>
            <input id="nom-tahun" type="number" className={kotak} value={tahun} onChange={(e) => setTahun(Number(e.target.value))} disabled={!mengisi} min={2000} max={2100} />
          </div>
        </div>

        <div className="mt-4 max-w-md">
          <label htmlFor="nom-sheet" className="block text-sm font-medium">Nama sheet (opsional)</label>
          <input id="nom-sheet" type="text" className={kotak} value={namaSheet} onChange={(e) => setNamaSheet(e.target.value)} maxLength={100} disabled={!mengisi} />
          <p className="mt-1 text-xs text-slate-500">Kosongkan jika berkas hanya berisi satu sheet data.</p>
        </div>

        <div className="mt-5 max-w-md">
          <UnggahBerkas saatSelesai={periksa} nonaktif={!mengisi || sibuk} />
          <p className="mt-1 text-xs text-slate-500">Maksimal 12 MB. Berkas diperiksa dulu tanpa menyimpan apa pun; Anda memutuskan setelah melihat ringkasannya.</p>
        </div>
      </div>

      {galat && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {galat}
        </div>
      )}
      {tahap.jenis === "periksa" && <p role="status" className="text-sm text-slate-600">Memeriksa berkas…</p>}
      {tahap.jenis === "tinjau" && <Tinjauan r={tahap.ringkasan} bulan={bulan} tahun={tahun} sibuk={sibuk} saatSimpan={() => simpan(tahap.unggahan)} saatBatal={() => batal(tahap.unggahan)} />}
    </div>
  );
}

function Tinjauan({ r, bulan, tahun, sibuk, saatSimpan, saatBatal }: { r: RingkasanLayar; bulan: number; tahun: number; sibuk: boolean; saatSimpan: () => void; saatBatal: () => void }) {
  const kegagalan = r.catatan.filter((c) => !c.alasan.startsWith(AWALAN_PERINGATAN));
  const peringatan = r.catatan.filter((c) => c.alasan.startsWith(AWALAN_PERINGATAN));
  // Banyak pegawai snapshot sebelumnya yang hilang dari berkas = tanda berkas salah/terpotong (setengah dari sebelumnya, atau > 10%).
  const banyakHilang = r.pembanding !== null && r.tidakAdaDiBerkas > Math.max(20, r.pembanding.jumlah * 0.1);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" aria-label="Hasil pemeriksaan">
      <h2 className="text-base font-semibold text-slate-900">
        Hasil pemeriksaan — {NAMA_BULAN[bulan]} {tahun}
      </h2>
      <p className="text-sm text-slate-500">Belum ada yang disimpan. Periksa ringkasan ini, lalu pilih Simpan atau Batal.</p>

      {banyakHilang && r.pembanding && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>{angka(r.tidakAdaDiBerkas)}</b> dari {angka(r.pembanding.jumlah)} pegawai pada snapshot {NAMA_BULAN[r.pembanding.bulan]} {r.pembanding.tahun} tidak ada di berkas ini
          dan akan tampil non-aktif bulan {NAMA_BULAN[bulan]}. Pastikan berkasnya lengkap dan bulannya benar.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Angka judul="Total baris" nilai={r.totalBaris} />
        <Angka judul="Akan disimpan" nilai={r.berhasil} kelas="text-emerald-700" />
        <Angka judul="Dilewati (gagal)" nilai={r.gagal} kelas={r.gagal > 0 ? "text-red-700" : "text-slate-900"} />
        <Angka judul="Peringatan" nilai={r.peringatan} kelas={r.peringatan > 0 ? "text-amber-700" : "text-slate-900"} />
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li><b>{angka(r.akanDiganti)}</b> pegawai sudah punya data {NAMA_BULAN[bulan]} {tahun} dan akan <b>DIGANTI</b>; <b>{angka(r.akanBaru)}</b> ditambahkan baru.</li>
        <li><b>{angka(r.pegawaiBaru)}</b> NIP belum pernah ada di data pegawai (menjadi pegawai baru).</li>
        {r.pembanding ? (
          <li>
            <b>{angka(r.tidakAdaDiBerkas)}</b> pegawai pada snapshot {NAMA_BULAN[r.pembanding.bulan]} {r.pembanding.tahun} ({angka(r.pembanding.jumlah)} orang) tidak ada di berkas ini: dianggap tidak aktif bulan ini.
          </li>
        ) : (
          <li>Belum ada snapshot bulan sebelumnya sebagai pembanding.</li>
        )}
      </ul>

      {kegagalan.length > 0 && <TabelCatatan judul="Baris yang akan dilewati" baris={kegagalan} kelas="text-slate-800" />}
      {peringatan.length > 0 && <TabelCatatan judul="Peringatan (baris tetap diproses)" baris={peringatan} kelas="text-amber-700" potongAwalan />}
      {r.catatanTotal > r.catatan.length && (
        <p className="text-xs text-slate-500">Menampilkan {angka(r.catatan.length)} dari {angka(r.catatanTotal)} catatan; daftar lengkap tersedia di halaman hasil setelah disimpan.</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={saatSimpan} disabled={sibuk || r.berhasil === 0} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={saatBatal} disabled={sibuk} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          Batal
        </button>
        {r.berhasil === 0 && <span className="text-sm text-red-700">Tidak ada baris yang dapat diproses.</span>}
      </div>
    </section>
  );
}
