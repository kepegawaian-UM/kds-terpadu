"use client";

import Link from "next/link";

import type { BarisNominatif } from "@/lib/laporan/nominatif";

import { type KolomLaporan, TabelLaporan } from "./TabelLaporan";

// Kolom didefinisikan di sisi klien: fungsi tidak bisa dikirim dari komponen server.
const KOLOM: KolomLaporan<BarisNominatif>[] = [
  { id: "nip", header: "NIP", nilai: (b) => b.nip },
  { id: "nama", header: "Nama", nilai: (b) => b.nama },
  { id: "jenis", header: "Jenis Pegawai", nilai: (b) => b.jenis ?? "" },
  { id: "unit", header: "Unit Kerja", nilai: (b) => b.unit ?? "" },
  {
    id: "aksi",
    header: "Aksi",
    tanpaEkspor: true,
    nilai: () => "Detail",
    render: (b) => (
      <Link href={`/nominatif/${b.id}`} className="text-accent-green underline hover:text-sidebar">
        Detail
      </Link>
    ),
  },
];

export function TabelNominatif({
  baris,
  namaFile,
  urlExcel,
}: {
  baris: BarisNominatif[];
  namaFile: string;
  urlExcel: string;
}) {
  return (
    <TabelLaporan kolom={KOLOM} data={baris} kunciBaris={(b) => b.id} namaFile={namaFile} urlExcel={urlExcel} />
  );
}
