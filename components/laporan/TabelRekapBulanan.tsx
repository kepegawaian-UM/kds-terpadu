"use client";

import { useMemo } from "react";

import type { BarisRekapBulanan } from "@/lib/laporan/rekapBulanan";

import { type KolomLaporan, TabelLaporan } from "./TabelLaporan";

/** Komponen bertipe teks (bukan angka): tidak diurutkan sebagai angka. */
const KOMPONEN_TEKS = new Set(["JENIS_SHIFT", "CUTI_ANAK_KE"]);

const nonaktifFitur = "cursor-not-allowed text-xs text-slate-400";

export function TabelRekapBulanan({
  baris,
  komponen,
  namaFile,
  urlExcel,
}: {
  baris: BarisRekapBulanan[];
  komponen: { kode: string; nama: string }[];
  namaFile: string;
  urlExcel: string;
}) {
  // Kolom dibuat di klien (fungsi tidak bisa dikirim dari komponen server); kolom komponen dinamis.
  const kolom = useMemo<KolomLaporan<BarisRekapBulanan>[]>(
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
      ...komponen.map<KolomLaporan<BarisRekapBulanan>>((k) => ({
        id: k.kode,
        header: k.kode,
        tooltip: k.nama,
        numerik: !KOMPONEN_TEKS.has(k.kode),
        rata: "tengah",
        nilai: (b) => b.nilai?.[k.kode] ?? "-",
        kelasSel: (b) => (b.tandai[k.kode] ? "sel-koreksi" : ""),
        judulSel: (b) => b.tandai[k.kode],
      })),
      {
        id: "aksi",
        header: "Aksi",
        tanpaEkspor: true,
        nilai: () => "",
        // Koreksi dan Rincian (Rekap Individual) dibangun di tahap F4.
        render: () => (
          <span className="whitespace-nowrap">
            <span className={nonaktifFitur} title="Tersedia di tahap F4">
              Koreksi
            </span>{" "}
            <span className={`ml-2 ${nonaktifFitur}`} title="Tersedia di tahap F4">
              Rincian
            </span>
          </span>
        ),
      },
    ],
    [komponen]
  );

  return <TabelLaporan kolom={kolom} data={baris} kunciBaris={(b) => b.id} namaFile={namaFile} urlExcel={urlExcel} />;
}
