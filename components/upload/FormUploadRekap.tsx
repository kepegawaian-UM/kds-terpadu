"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { batalkanUploadRekap, periksaUploadRekap, simpanUploadRekap } from "@/app/(app)/rekap-kehadiran/upload/actions";
import type { RingkasanLayar } from "@/app/(app)/rekap-kehadiran/upload/actions";
import type { HasilUnggah } from "@/lib/upload/klien";

import { Angka, AWALAN_PERINGATAN, TabelCatatan } from "./bagian";
import { PanelAnomali, perluKonfirmasi } from "./PanelAnomali";
import { UnggahBerkas } from "./UnggahBerkas";

const NAMA_BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const angka = (n: number) => n.toLocaleString("id-ID");

type Tahap = { jenis: "isi" } | { jenis: "periksa"; unggahan: HasilUnggah } | { jenis: "tinjau"; unggahan: HasilUnggah; ringkasan: RingkasanLayar };

export function FormUploadRekap({ bulanAwal, tahunAwal }: { bulanAwal: number; tahunAwal: number }) {
  const router = useRouter();
  const [bulan, setBulan] = useState(bulanAwal);
  const [tahun, setTahun] = useState(tahunAwal);
  const [namaSheet, setNamaSheet] = useState("");
  const [tahap, setTahap] = useState<Tahap>({ jenis: "isi" });
  const [galat, setGalat] = useState<string | null>(null);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sibuk, mulai] = useTransition();

  const masukan = (u: HasilUnggah) => ({ uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile, bulan, tahun, namaSheet: namaSheet.trim() });

  function periksa(u: HasilUnggah) {
    setGalat(null);
    setKonfirmasi(false);
    setTahap({ jenis: "periksa", unggahan: u });
    mulai(async () => {
      const h = await periksaUploadRekap(masukan(u));
      if (h.ok) setTahap({ jenis: "tinjau", unggahan: u, ringkasan: h.ringkasan });
      else {
        setGalat(h.error);
        setTahap({ jenis: "isi" });
        await batalkanUploadRekap(u.uploadId);
      }
    });
  }

  function simpan(u: HasilUnggah) {
    setGalat(null);
    mulai(async () => {
      const h = await simpanUploadRekap(masukan(u));
      if (h.ok) {
        const k = h.koreksi;
        router.push(`/rekap-kehadiran/upload/hasil/${h.batchId}?koreksi=${k.barisDiubah},${k.hariDipindah},${k.sebagian},${k.kurang}`);
      } else {
        setGalat(h.error);
      }
    });
  }

  function batal(u: HasilUnggah) {
    mulai(async () => {
      await batalkanUploadRekap(u.uploadId);
      setTahap({ jenis: "isi" });
      setGalat(null);
    });
  }

  const mengisi = tahap.jenis === "isi";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <p className="text-sm text-slate-600">Gunakan template resmi supaya kolom terbaca dengan benar oleh sistem.</p>
          <a href="/rekap-kehadiran/upload/template" className="whitespace-nowrap text-sm text-blue-700 underline">
            Unduh Template
          </a>
        </div>

        <div className="grid max-w-md grid-cols-2 gap-4">
          <div>
            <label htmlFor="up-bulan" className="block text-sm font-medium">Bulan</label>
            <select id="up-bulan" className={kotak} value={bulan} onChange={(e) => setBulan(Number(e.target.value))} disabled={!mengisi}>
              {NAMA_BULAN.slice(1).map((n, i) => (
                <option key={n} value={i + 1}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="up-tahun" className="block text-sm font-medium">Tahun</label>
            <input id="up-tahun" type="number" className={kotak} value={tahun} onChange={(e) => setTahun(Number(e.target.value))} disabled={!mengisi} min={2000} max={2100} />
          </div>
        </div>

        <div className="mt-4 max-w-md">
          <label htmlFor="up-sheet" className="block text-sm font-medium">Nama sheet (opsional)</label>
          <input id="up-sheet" type="text" className={kotak} value={namaSheet} onChange={(e) => setNamaSheet(e.target.value)} placeholder="mis. V-Lama" maxLength={100} disabled={!mengisi} />
          <p className="mt-1 text-xs text-slate-500">
            Kosongkan jika berkas hanya berisi satu sheet data. Isi bila berkas berupa workbook dengan banyak sheet: hanya sheet bernama ini yang dibaca.
          </p>
        </div>

        <div className="mt-5 max-w-md">
          <UnggahBerkas saatSelesai={periksa} nonaktif={!mengisi || sibuk} />
          <p className="mt-1 text-xs text-slate-500">
            Maksimal 12 MB. Berkas diperiksa dulu tanpa menyimpan apa pun; Anda memutuskan setelah melihat ringkasannya.
          </p>
        </div>
      </div>

      {galat && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {galat}
        </div>
      )}

      {tahap.jenis === "periksa" && <p role="status" className="text-sm text-slate-600">Memeriksa berkas…</p>}

      {tahap.jenis === "tinjau" && <Tinjauan r={tahap.ringkasan} bulan={bulan} tahun={tahun} sibuk={sibuk} konfirmasi={konfirmasi} saatKonfirmasi={setKonfirmasi} namaFile={tahap.unggahan.namaFile} saatSimpan={() => simpan(tahap.unggahan)} saatBatal={() => batal(tahap.unggahan)} />}
    </div>
  );
}

function Tinjauan({ r, bulan, tahun, sibuk, konfirmasi, saatKonfirmasi, namaFile, saatSimpan, saatBatal }: { r: RingkasanLayar; bulan: number; tahun: number; sibuk: boolean; konfirmasi: boolean; saatKonfirmasi: (b: boolean) => void; namaFile: string; saatSimpan: () => void; saatBatal: () => void }) {
  const salahBulan = r.bulanDiBerkas !== null && r.bulanDiBerkas.toLowerCase() !== NAMA_BULAN[bulan].toLowerCase();
  const kegagalan = r.catatan.filter((c) => !c.alasan.startsWith(AWALAN_PERINGATAN));
  const peringatan = r.catatan.filter((c) => c.alasan.startsWith(AWALAN_PERINGATAN));
  const gagalTotal = r.gagal;
  const tertahan = perluKonfirmasi(r.anomali) && !konfirmasi;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" aria-label="Hasil pemeriksaan">
      <h2 className="text-base font-semibold text-slate-900">
        Hasil pemeriksaan — {NAMA_BULAN[bulan]} {tahun}
      </h2>
      <p className="text-sm text-slate-500">Belum ada yang disimpan. Periksa ringkasan ini, lalu pilih Simpan atau Batal.</p>

      {salahBulan && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Kolom BULAN di berkas umumnya berisi &quot;{r.bulanDiBerkas}&quot;, tetapi Anda memilih <b>{NAMA_BULAN[bulan]}</b>. Pastikan bulan yang dipilih sudah benar sebelum menyimpan.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Angka judul="Total baris" nilai={r.totalBaris} />
        <Angka judul="Akan diproses" nilai={r.berhasil} kelas="text-emerald-700" />
        <Angka judul="Dilewati (gagal)" nilai={gagalTotal} kelas={gagalTotal > 0 ? "text-red-700" : "text-slate-900"} />
        <Angka judul="Peringatan" nilai={r.peringatan} kelas={r.peringatan > 0 ? "text-amber-700" : "text-slate-900"} />
      </div>

      <p className="text-sm text-slate-700">
        <b>{angka(r.akanDiganti)}</b> pegawai sudah punya absensi {NAMA_BULAN[bulan]} {tahun} dan datanya akan <b>DIGANTI</b>; <b>{angka(r.akanBaru)}</b> pegawai ditambahkan baru.
        Koreksi Absensi yang aktif diterapkan ulang otomatis setelah disimpan.
      </p>

      <PanelAnomali anomali={r.anomali} total={r.anomaliTotal} dikonfirmasi={konfirmasi} saatKonfirmasi={saatKonfirmasi} namaBerkas={namaFile} />

      {kegagalan.length > 0 && <TabelCatatan judul="Baris yang akan dilewati" baris={kegagalan} kelas="text-slate-800" />}
      {peringatan.length > 0 && <TabelCatatan judul="Peringatan (baris tetap diproses)" baris={peringatan} kelas="text-amber-700" potongAwalan />}
      {r.catatanTotal > r.catatan.length && (
        <p className="text-xs text-slate-500">Menampilkan {angka(r.catatan.length)} dari {angka(r.catatanTotal)} catatan; daftar lengkap tersedia di halaman hasil setelah disimpan.</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={saatSimpan} disabled={sibuk || r.berhasil === 0 || tertahan} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={saatBatal} disabled={sibuk} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          Batal
        </button>
        {r.berhasil === 0 && <span className="text-sm text-red-700">Tidak ada baris yang dapat diproses.</span>}
        {tertahan && <span className="text-sm text-red-700">Centang konfirmasi peringatan penting dulu.</span>}
      </div>
    </section>
  );
}
