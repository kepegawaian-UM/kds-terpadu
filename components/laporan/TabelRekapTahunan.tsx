"use client";

import { useMemo } from "react";

import type { BarisRekapTahunan } from "@/lib/laporan/rekapTahunan";

import { type KolomLaporan, TabelLaporan } from "./TabelLaporan";

/** Baris untuk tabel: tanpa `total` (duplikat dari `sel`) supaya muatan halaman tidak membengkak. */
export type BarisTabelTahunan = Omit<BarisRekapTahunan, "total">;

export function TabelRekapTahunan({
  baris,
  komponen,
  namaFile,
  urlExcel,
}: {
  baris: BarisTabelTahunan[];
  komponen: { kode: string; nama: string; tipeNilai: string }[];
  namaFile: string;
  urlExcel: string;
}) {
  // Kolom dibuat di klien (fungsi tidak bisa dikirim dari komponen server); kolom komponen dinamis.
  const kolom = useMemo<KolomLaporan<BarisTabelTahunan>[]>(
    () => [
      { id: "nip", header: "NIP", nilai: (b) => b.nip },
      {
        id: "nama",
        header: "Nama",
        nilai: (b) => (b.badge ? `${b.nama} ${b.badge[1]}` : b.nama),
        render: (b) => (
          <>
            {b.nama}
            {b.badge && (
              <span
                className={`ml-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${
                  b.badge[0] === "catatan" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"
                }`}
              >
                {b.badge[1]}
              </span>
            )}
          </>
        ),
      },
      ...komponen.map<KolomLaporan<BarisTabelTahunan>>((k) => ({
        id: k.kode,
        header: k.kode,
        tooltip: k.nama,
        numerik: k.tipeNilai !== "teks",
        rata: "tengah",
        nilai: (b) => b.sel[k.kode] ?? "-",
      })),
      {
        id: "aksi",
        header: "Aksi",
        tanpaEkspor: true,
        nilai: () => "",
        // Rincian = Rekap Individual, dibangun di tahap F4.
        render: () => (
          <span className="cursor-not-allowed text-xs text-slate-400" title="Tersedia di tahap F4">
            Rincian
          </span>
        ),
      },
    ],
    [komponen]
  );

  return <TabelLaporan kolom={kolom} data={baris} kunciBaris={(b) => b.id} namaFile={namaFile} urlExcel={urlExcel} />;
}
