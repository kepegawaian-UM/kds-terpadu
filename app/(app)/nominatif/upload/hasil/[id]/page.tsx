import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { namaBulan } from "@/lib/laporan/periode";

export const metadata = { title: "Hasil Upload Nominatif — KDS Terpadu" };

const AWALAN = "[PERINGATAN] ";
const angka = (n: number) => n.toLocaleString("id-ID");
const waktuWib = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export default async function HasilUploadNominatifPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const batch = await prisma.uploadBatch.findFirst({ where: { id: Number(id), jenis: "nominatif_bulanan" } });
  if (!batch) notFound();
  const catatan = await prisma.barisGagalUpload.findMany({ where: { uploadBatchId: batch.id }, orderBy: { id: "asc" } });
  const kegagalan = catatan.filter((c) => !c.alasan.startsWith(AWALAN));
  const peringatan = catatan.filter((c) => c.alasan.startsWith(AWALAN));

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Hasil Upload Nominatif</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <dl className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <div><dt className="text-slate-500">Berkas</dt><dd className="mt-1 font-medium">{batch.namaFileAsli}</dd></div>
          <div><dt className="text-slate-500">Periode</dt><dd className="mt-1 font-medium">{batch.bulan && batch.tahun ? `${namaBulan(batch.bulan)} ${batch.tahun}` : "-"}</dd></div>
          <div><dt className="text-slate-500">Diunggah oleh</dt><dd className="mt-1 font-medium">{batch.diunggahOlehNama}</dd></div>
          <div><dt className="text-slate-500">Diunggah pada</dt><dd className="mt-1 font-medium">{waktuWib(batch.diunggahPada)} WIB</dd></div>
          <div><dt className="text-slate-500">Total baris</dt><dd className="mt-1 font-medium">{angka(batch.jumlahBarisTotal)}</dd></div>
        </dl>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{angka(batch.jumlahBerhasil)}</div>
            <div className="text-sm text-green-700">baris berhasil</div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <div className="text-2xl font-bold text-red-700">{angka(batch.jumlahGagal)}</div>
            <div className="text-sm text-red-700">baris gagal</div>
          </div>
        </div>
      </section>

      {kegagalan.length > 0 && <Tabel judul="Detail baris gagal" kolom="Alasan gagal" baris={kegagalan} />}
      {peringatan.length > 0 && <Tabel judul="Peringatan (baris tetap diproses)" kolom="Catatan" baris={peringatan} kuning />}

      <p className="text-sm">
        <Link href="/nominatif/upload" className="text-blue-700 underline">Upload berkas lain</Link>
        {batch.bulan && batch.tahun && (
          <>
            {" · "}
            <Link href={`/nominatif?bulan=${batch.bulan}&tahun=${batch.tahun}`} className="text-blue-700 underline">Lihat Nominatif</Link>
          </>
        )}
      </p>
    </div>
  );
}

function Tabel({ judul, kolom, baris, kuning = false }: { judul: string; kolom: string; baris: { id: number; nomorBaris: number; nipDimaksud: string; alasan: string }[]; kuning?: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className={`mb-4 text-sm font-semibold uppercase ${kuning ? "text-amber-600" : "text-slate-500"}`}>{judul}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-2">Baris ke-</th>
            <th className="py-2">NIP</th>
            <th className="py-2">{kolom}</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="py-2">{c.nomorBaris}</td>
              <td className="py-2">{c.nipDimaksud}</td>
              <td className={`py-2 ${kuning ? "text-amber-700" : ""}`}>{kuning ? c.alasan.slice(AWALAN.length) : c.alasan}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
