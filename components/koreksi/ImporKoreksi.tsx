"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { batalkanImporKoreksi, periksaImporKoreksi, simpanImporKoreksi } from "@/app/(app)/koreksi-rekap/actions";
import type { BarisKoreksi, RingkasanKoreksi } from "@/lib/koreksi/impor";
import type { HasilUnggah } from "@/lib/upload/klien";

import { UnggahBerkas } from "../upload/UnggahBerkas";

const BULAN_PENDEK = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const angka = (n: number) => n.toLocaleString("id-ID");

type Tahap = { jenis: "isi" } | { jenis: "periksa" } | { jenis: "tinjau"; unggahan: HasilUnggah; baris: BarisKoreksi[]; barisTotal: number; ringkasan: RingkasanKoreksi };

export function ImporKoreksi() {
  const router = useRouter();
  const [tahap, setTahap] = useState<Tahap>({ jenis: "isi" });
  const [galat, setGalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  const masukan = (u: HasilUnggah) => ({ uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile });

  function periksa(u: HasilUnggah) {
    setGalat(null);
    setSelesai(null);
    setTahap({ jenis: "periksa" });
    mulai(async () => {
      const h = await periksaImporKoreksi(masukan(u));
      if (h.ok) setTahap({ jenis: "tinjau", unggahan: u, baris: h.baris, barisTotal: h.barisTotal, ringkasan: h.ringkasan });
      else {
        setGalat(h.pesan ?? "Berkas tidak dapat diproses.");
        setTahap({ jenis: "isi" });
        await batalkanImporKoreksi(u.uploadId);
      }
    });
  }

  function simpan(u: HasilUnggah, jumlah: number) {
    if (!window.confirm(`Simpan ${jumlah} koreksi dan terapkan ke data rekap sekarang? Baris yang gagal atau duplikat dilewati.`)) return;
    mulai(async () => {
      const h = await simpanImporKoreksi(masukan(u));
      if (h.ok) {
        setSelesai(h.pesan);
        setTahap({ jenis: "isi" });
        router.refresh();
      } else setGalat(h.pesan ?? "Gagal menyimpan.");
    });
  }

  function batal(u: HasilUnggah) {
    mulai(async () => {
      await batalkanImporKoreksi(u.uploadId);
      setTahap({ jenis: "isi" });
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" aria-label="Impor massal">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-slate-500">Impor Massal dari Excel</h2>
        <a href="/koreksi-rekap/template" download className="whitespace-nowrap text-sm text-blue-700 underline">
          Unduh Template
        </a>
      </div>

      <div className="max-w-md">
        <UnggahBerkas saatSelesai={periksa} nonaktif={tahap.jenis !== "isi" || sibuk} />
        <p className="mt-1 text-xs text-slate-500">Maks 2.000 baris. Setelah unggah Anda melihat pratinjau per baris dan harus konfirmasi dulu; belum ada yang tersimpan sebelum itu.</p>
      </div>

      {galat && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{galat}</div>}
      {selesai && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{selesai}</div>}
      {tahap.jenis === "periksa" && <p role="status" className="text-sm text-slate-600">Memeriksa berkas…</p>}

      {tahap.jenis === "tinjau" && (
        <div className="space-y-4" aria-label="Pratinjau impor">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Total baris", tahap.ringkasan.total, ""], ["Siap disimpan", tahap.ringkasan.valid, "text-green-700"], ["Gagal", tahap.ringkasan.gagal, "text-red-600"],
              ["Duplikat (dilewati)", tahap.ringkasan.duplikat, "text-gray-600"], ["Hari yang akan dipindah", tahap.ringkasan.hari, "text-slate-900"],
            ].map(([judul, nilai, kelas]) => (
              <div key={judul as string} className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{judul}</div>
                <div className={`text-2xl font-bold ${kelas}`}>{angka(nilai as number)}</div>
              </div>
            ))}
          </div>
          {tahap.ringkasan.sebagian > 0 && <p className="text-xs text-yellow-700">{tahap.ringkasan.sebagian} bulan sebagian (tidak diubah)</p>}

          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-2">Baris</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">NIP</th><th className="px-2 py-2">Perubahan</th>
                  <th className="px-2 py-2">Periode / Bulan</th><th className="px-2 py-2">Alasan</th><th className="px-2 py-2">Dampak / Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {tahap.baris.map((b) => (
                  <tr key={b.baris} className="border-t align-top">
                    <td className="px-2 py-1.5">{b.baris}</td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${b.status === "valid" ? "bg-green-100 text-green-700" : b.status === "duplikat" ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-700"}`}>
                        {b.status === "valid" ? "Siap" : b.status === "duplikat" ? "Duplikat" : "Gagal"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">{b.data.nip}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{b.data.dari_komponen} &rarr; {b.data.ke_komponen ?? "dihapus"}{b.data.jenis === "angka" && b.data.jumlah_hari ? ` (${b.data.jumlah_hari} hari)` : ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {b.data.jenis === "angka" && b.data.bulan ? `${BULAN_PENDEK[b.data.bulan]} ${b.data.tahun} (angka)` : b.data.tanggal_mulai ? `${b.data.tanggal_mulai} s.d. ${b.data.tanggal_selesai ?? "tanpa batas"}` : "-"}
                    </td>
                    <td className="px-2 py-1.5">{b.data.alasan}</td>
                    <td className="px-2 py-1.5">
                      {b.status === "valid" && b.dampak ? (
                        <>
                          {b.dampak.bulan} bulan, {b.dampak.hari} hari dipindah
                          {b.dampak.sebagian > 0 && <div className="text-xs text-yellow-700">{b.dampak.sebagian} bulan sebagian, tidak diubah</div>}
                        </>
                      ) : (
                        b.pesan
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tahap.barisTotal > tahap.baris.length && <p className="text-xs text-slate-500">Menampilkan {angka(tahap.baris.length)} dari {angka(tahap.barisTotal)} baris.</p>}

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => batal(tahap.unggahan)} disabled={sibuk} className="text-sm text-slate-600 underline disabled:opacity-50">
              Batal
            </button>
            {tahap.ringkasan.valid > 0 ? (
              <button type="button" onClick={() => simpan(tahap.unggahan, tahap.ringkasan.valid)} disabled={sibuk} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
                {sibuk ? "Menyimpan…" : `Simpan & Terapkan ${tahap.ringkasan.valid} Koreksi`}
              </button>
            ) : (
              <span className="text-sm text-slate-500">Tidak ada baris yang bisa disimpan.</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
