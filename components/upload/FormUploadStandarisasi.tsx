"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { batalkanUploadStandarisasi, periksaUploadStandarisasi, simpanUploadStandarisasi } from "@/app/(app)/standarisasi/actions";
import { ALASAN_LABEL, type AlasanBarisBermasalah } from "@/lib/constants";
import type { RingkasanStandarisasi } from "@/lib/standarisasi/proses";
import type { HasilUnggah } from "@/lib/upload/klien";

import { Angka, angka } from "./bagian";
import { UnggahBerkas } from "./UnggahBerkas";

const NAMA_BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

type Tahap = { jenis: "isi" } | { jenis: "periksa"; unggahan: HasilUnggah } | { jenis: "tinjau"; unggahan: HasilUnggah; ringkasan: RingkasanStandarisasi };

export function FormUploadStandarisasi({ bulanAwal, tahunAwal }: { bulanAwal: number; tahunAwal: number }) {
  const router = useRouter();
  const [bulan, setBulan] = useState(bulanAwal);
  const [tahun, setTahun] = useState(tahunAwal);
  const [tahap, setTahap] = useState<Tahap>({ jenis: "isi" });
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  const masukan = (u: HasilUnggah) => ({ uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile, bulan, tahun });

  function periksa(u: HasilUnggah) {
    setGalat(null);
    setTahap({ jenis: "periksa", unggahan: u });
    mulai(async () => {
      const h = await periksaUploadStandarisasi(masukan(u));
      if (h.ok) setTahap({ jenis: "tinjau", unggahan: u, ringkasan: h.ringkasan });
      else {
        setGalat(h.error);
        setTahap({ jenis: "isi" });
        await batalkanUploadStandarisasi(u.uploadId);
      }
    });
  }

  function simpan(u: HasilUnggah) {
    setGalat(null);
    mulai(async () => {
      const h = await simpanUploadStandarisasi(masukan(u));
      if (h.ok) router.push(`/standarisasi/${h.batchId}`);
      else setGalat(h.error);
    });
  }

  function batal(u: HasilUnggah) {
    mulai(async () => {
      await batalkanUploadStandarisasi(u.uploadId);
      setTahap({ jenis: "isi" });
      setGalat(null);
    });
  }

  const mengisi = tahap.jenis === "isi";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-5 text-sm text-slate-600">
          Unggah berkas hasil tarikan data pegawai (format REKAP_PEGAWAI) yang <b>sudah dibersihkan</b>. Aplikasi mencocokkan kolomnya dengan data master; baris yang tidak bisa dipastikan masuk antrean <b>Review</b>.
        </p>
        <div role="note" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Jangan unggah berkas asli SIMPEGA.</b> Berkas asli memuat data pribadi sensitif (NIK, nama ibu kandung, alamat, email, rekening, dan lainnya). Bersihkan dulu di komputer Anda:
          <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">npm run bersihkan -- &quot;C:\jalur\REKAP_PEGAWAI.xlsx&quot;</code>
          lalu unggah berkas <b>_bersih</b> yang dihasilkan. Berkas yang masih memuat kolom sensitif ditolak dan langsung dibuang.
        </div>
        <div className="grid max-w-md grid-cols-2 gap-4">
          <div>
            <label htmlFor="std-bulan" className="block text-sm font-medium">Bulan</label>
            <select id="std-bulan" className={kotak} value={bulan} onChange={(e) => setBulan(Number(e.target.value))} disabled={!mengisi}>
              {NAMA_BULAN.slice(1).map((n, i) => (
                <option key={n} value={i + 1}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="std-tahun" className="block text-sm font-medium">Tahun</label>
            <input id="std-tahun" type="number" className={kotak} value={tahun} onChange={(e) => setTahun(Number(e.target.value))} disabled={!mengisi} min={2000} max={2100} />
          </div>
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

function Tinjauan({ r, bulan, tahun, sibuk, saatSimpan, saatBatal }: { r: RingkasanStandarisasi; bulan: number; tahun: number; sibuk: boolean; saatSimpan: () => void; saatBatal: () => void }) {
  const banyakHilang = r.pembanding !== null && r.tidakAdaDiBerkas > Math.max(20, r.pembanding.jumlah * 0.1);
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" aria-label="Hasil pemeriksaan">
      <h2 className="text-base font-semibold text-slate-900">
        Hasil pemeriksaan — {NAMA_BULAN[bulan]} {tahun}
      </h2>
      <p className="text-sm text-slate-500">Belum ada yang disimpan. Periksa ringkasan ini, lalu pilih Simpan atau Batal.</p>

      {r.akanMenimpa > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Bulan {NAMA_BULAN[bulan]} {tahun} sudah punya <b>{angka(r.akanMenimpa)}</b> baris Nominatif. Menyimpan akan <b>MENGGANTI SELURUHNYA</b> (termasuk perbaikan manual sebelumnya).
        </div>
      )}
      {banyakHilang && r.pembanding && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>{angka(r.tidakAdaDiBerkas)}</b> dari {angka(r.pembanding.jumlah)} pegawai pada snapshot {NAMA_BULAN[r.pembanding.bulan]} {r.pembanding.tahun} tidak ada di berkas ini dan akan tampil non-aktif. Pastikan berkasnya lengkap dan bulannya benar.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Angka judul="Total baris" nilai={r.totalBaris} />
        <Angka judul="Langsung berhasil" nilai={r.berhasil} kelas="text-emerald-700" />
        <Angka judul="Perlu Review" nilai={r.perluReview} kelas={r.perluReview > 0 ? "text-amber-700" : "text-slate-900"} />
        <Angka judul="Dikecualikan permanen" nilai={r.dikecualikan} />
      </div>

      {r.tmtDikoreksi > 0 && (
        <p className="text-sm text-slate-700">
          <b>{angka(r.tmtDikoreksi)}</b> pegawai memakai tanggal mulai kerja dari <Link href="/koreksi-pegawai" className="text-blue-700 underline">Koreksi Pegawai</Link> (bukan dari berkas).
        </p>
      )}

      {r.perAlasan.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Alasan baris perlu Review</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {r.perAlasan.map((a) => (
              <li key={a.alasan} className="flex justify-between border-b border-slate-100 pb-1">
                <span>{ALASAN_LABEL[a.alasan as AlasanBarisBermasalah] ?? a.alasan}</span>
                <b>{angka(a.jumlah)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.contohBermasalah.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Contoh baris perlu Review (maks. 20)</h3>
          <div className="max-h-60 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <tbody>
                {r.contohBermasalah.map((c, i) => (
                  <tr key={i} className="border-t first:border-t-0">
                    <td className="px-3 py-1.5 font-mono text-xs">{c.nip}</td>
                    <td className="px-3 py-1.5 text-slate-600">{c.detailAlasan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={saatSimpan} disabled={sibuk || r.totalBaris === 0} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={saatBatal} disabled={sibuk} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          Batal
        </button>
      </div>
    </section>
  );
}
