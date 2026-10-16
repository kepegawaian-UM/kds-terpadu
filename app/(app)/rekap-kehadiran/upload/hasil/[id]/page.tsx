import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { namaBulan } from "@/lib/laporan/periode";


const AWALAN = "[PERINGATAN] ";
const angka = (n: number) => n.toLocaleString("id-ID");
const waktuWib = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export default async function HasilUploadRekapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const batch = await prisma.uploadBatch.findFirst({ where: { id: Number(id), jenis: "kehadiran_bulanan" } });
  if (!batch) notFound();
  const catatan = await prisma.barisGagalUpload.findMany({ where: { uploadBatchId: batch.id }, orderBy: { id: "asc" } });
  const kegagalan = catatan.filter((c) => !c.alasan.startsWith(AWALAN));
  const peringatan = catatan.filter((c) => c.alasan.startsWith(AWALAN));

  const sp = await searchParams;
  const k = typeof sp.koreksi === "string" ? sp.koreksi.split(",").map(Number) : null;
  const [diubah, hari, sebagian, kurang] = k && k.length === 4 && k.every(Number.isInteger) ? k : [0, 0, 0, 0];

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Hasil Upload Absensi</h1>

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

      {(diubah > 0 || sebagian > 0 || kurang > 0) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Koreksi manual otomatis diterapkan setelah upload: {angka(diubah)} baris absensi diubah, {angka(hari)} hari dipindah.
          {sebagian > 0 && <> {angka(sebagian)} pegawai hanya sebagian bulan masuk periode koreksi sehingga TIDAK diubah.</>}
          {kurang > 0 && <> {angka(kurang)} koreksi angka hanya terpenuhi sebagian.</>}
        </div>
      )}

      {kegagalan.length > 0 && <Tabel judul="Detail baris gagal" kolom="Alasan gagal" baris={kegagalan} />}
      {peringatan.length > 0 && <Tabel judul="Peringatan (baris tetap diproses)" kolom="Catatan" baris={peringatan} kuning />}

      <p className="text-sm">
        <Link href="/rekap-kehadiran/upload" className="text-blue-700 underline">Upload berkas lain</Link>
        {batch.bulan && batch.tahun && (
          <>
            {" · "}
            <Link href={`/rekap-kehadiran/bulanan?bulan=${batch.bulan}&tahun=${batch.tahun}`} className="text-blue-700 underline">Lihat Absensi Bulanan</Link>
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
