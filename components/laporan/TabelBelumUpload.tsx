"use client";

import type { BarisBelum } from "@/lib/laporan/belumUpload";

import { type KolomLaporan, TabelLaporan } from "./TabelLaporan";

const labelStatus = (b: BarisBelum) =>
  b.belumTmt ? "Belum Mulai Kerja" : (b.keterangan ?? "Perlu Ditindaklanjuti");

const KOLOM: KolomLaporan<BarisBelum>[] = [
  { id: "nip", header: "NIP", nilai: (b) => b.nip },
  { id: "nama", header: "Nama", nilai: (b) => b.nama },
  { id: "jenis", header: "Jenis", nilai: (b) => b.jenis },
  { id: "unit", header: "Unit Kerja", nilai: (b) => b.unit },
  { id: "tmt", header: "TMT", nilai: (b) => b.tmt },
  {
    id: "status",
    header: "Status",
    nilai: labelStatus,
    render: (b) => {
      const perlu = !b.belumTmt && b.keterangan === null;
      return (
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            perlu ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {labelStatus(b)}
        </span>
      );
    },
  },
];

export function TabelBelumUpload({ baris, namaFile }: { baris: BarisBelum[]; namaFile: string }) {
  return <TabelLaporan kolom={KOLOM} data={baris} kunciBaris={(b) => b.nip} namaFile={namaFile} />;
}
