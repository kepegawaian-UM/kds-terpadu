"use client";

import { useMemo, useState } from "react";

import type { KandidatMassal } from "@/lib/laporan/rekapIndividual";

/**
 * Daftar kandidat cetak/unduh massal dengan kotak centang. Tombol membuka halaman cetak (tab baru) atau mengunduh Excel lewat
 * alamat GET yang memuat NIP terpilih (maks 200). Filter (jenis/status/keaktifan/min TK/unit induk) ikut dibawa untuk nama berkas.
 */
export function PilihanMassal({ kandidat, maks, tahun, minTk, keaktifan, jenis, status, unitInduk = "", kategori = "" }: { kandidat: KandidatMassal[]; maks: number; tahun: number; minTk: number; keaktifan: string; jenis: string[]; status: string[]; unitInduk?: string; kategori?: string }) {
  const [dipilih, setDipilih] = useState<Set<string>>(() => new Set(kandidat.slice(0, maks).map((k) => k.nip)));
  const n = dipilih.size;
  const terlalu = n > maks;

  const query = useMemo(() => {
    const q = new URLSearchParams({ tahun: String(tahun), min_tk: String(minTk), keaktifan });
    jenis.forEach((j) => q.append("jenis", j));
    status.forEach((s) => q.append("status", s));
    if (kategori) q.set("kategori", kategori); // hanya untuk nama berkas
    if (unitInduk) q.set("unit_induk", unitInduk); // hanya untuk nama berkas; daftar NIP sudah menentukan isinya
    kandidat.filter((k) => dipilih.has(k.nip)).forEach((k) => q.append("nip", k.nip));
    return q.toString();
  }, [dipilih, kandidat, tahun, minTk, keaktifan, jenis, status, unitInduk, kategori]);

  const ubah = (nip: string, centang: boolean) =>
    setDipilih((s) => {
      const baru = new Set(s);
      if (centang) baru.add(nip);
      else baru.delete(nip);
      return baru;
    });
  const semua = (centang: boolean) => setDipilih(new Set(centang ? kandidat.map((k) => k.nip) : []));
  const tombol = "rounded-md px-4 py-2 text-sm font-medium";
  const nonaktif = n === 0 || terlalu;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-label="Pilih pegawai">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-700">
          <b>{kandidat.length}</b> pegawai memenuhi kriteria. Dipilih: <b>{n}</b>
          {terlalu && <span className="text-red-600"> (maksimal {maks} per cetak/unduh)</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {nonaktif ? (
            <span className={`${tombol} cursor-not-allowed bg-slate-200 text-slate-400`}>Cetak Semua (PDF)</span>
          ) : (
            <a href={`/rekap-kehadiran/individual/massal/cetak?${query}`} target="_blank" rel="noopener" className={`${tombol} bg-sidebar text-white hover:bg-sidebar-lighter`}>
              Cetak Semua (PDF)
            </a>
          )}
          {nonaktif ? (
            <span className={`${tombol} cursor-not-allowed border border-slate-200 text-slate-400`}>Unduh Excel</span>
          ) : (
            <a href={`/rekap-kehadiran/individual/massal/excel?${query}`} download className={`${tombol} border border-slate-300 hover:bg-slate-50`}>
              Unduh Excel
            </a>
          )}
        </div>
      </div>

      {kandidat.length === 0 ? (
        <p className="text-sm text-slate-500">Tidak ada pegawai yang memenuhi kriteria. Turunkan batas TK atau ubah filter.</p>
      ) : (
        <>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b text-left text-slate-500">
                  <th className="w-8 px-2 py-2"><input type="checkbox" aria-label="Pilih semua" checked={n === kandidat.length} onChange={(e) => semua(e.target.checked)} /></th>
                  <th className="px-2 py-2">Nama</th><th className="px-2 py-2">NIP</th><th className="px-2 py-2">Jenis</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Unit Kerja</th>
                  <th className="px-2 py-2 text-center">TK</th><th className="px-2 py-2 text-center">% TK</th>
                </tr>
              </thead>
              <tbody>
                {kandidat.map((p) => (
                  <tr key={p.nip} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-2 py-1.5"><input type="checkbox" aria-label={`Pilih ${p.nama}`} checked={dipilih.has(p.nip)} onChange={(e) => ubah(p.nip, e.target.checked)} /></td>
                    <td className="px-2 py-1.5 font-medium">{p.nama}</td><td className="whitespace-nowrap px-2 py-1.5">{p.nip}</td><td className="px-2 py-1.5">{p.jenis}</td>
                    <td className="px-2 py-1.5">{p.status}</td><td className="px-2 py-1.5">{p.unit}</td><td className="px-2 py-1.5 text-center font-semibold">{p.tk}</td><td className="px-2 py-1.5 text-center">{p.persen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Diurutkan dari TK terbanyak. TK = tidak ada rekam presensi pada data sumber (belum tentu tidak hadir); periksa dulu sebelum dijadikan dasar tindak lanjut. Angka sudah memperhitungkan koreksi admin.
            {kandidat.length > maks && ` Lebih dari ${maks} pegawai: hanya ${maks} teratas yang tercentang otomatis.`}
          </p>
        </>
      )}
    </section>
  );
}
