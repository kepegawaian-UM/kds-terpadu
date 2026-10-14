import Link from "next/link";

import { FormUploadStandarisasi } from "@/components/upload/FormUploadStandarisasi";
import { prisma } from "@/lib/db";
import { bulanTahunSekarang, namaBulan } from "@/lib/laporan/periode";

// Pemeriksaan dan penyimpanan (aksi server halaman ini) berjalan sinkron; batas Vercel Hobby 300 dtk.
export const maxDuration = 300;

const LENCANA: Record<string, string> = {
  Diproses: "bg-slate-100 text-slate-600",
  MenungguReview: "bg-amber-100 text-amber-700",
  Selesai: "bg-emerald-100 text-emerald-700",
  Dibatalkan: "bg-red-100 text-red-700",
};
const LABEL: Record<string, string> = { Diproses: "Diproses", MenungguReview: "Menunggu review", Selesai: "Selesai", Dibatalkan: "Dibatalkan" };
const waktuWib = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export default async function StandarisasiPage() {
  const [bulan, tahun] = bulanTahunSekarang(new Date());
  const batches = await prisma.uploadBatch.findMany({
    where: { jenis: "standarisasi_nominatif" },
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }, { diunggahPada: "desc" }],
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Standarisasi Nominatif</h1>
        <p className="text-sm text-slate-500">
          Mengubah berkas mentah tarikan data pegawai menjadi snapshot Nominatif bulanan yang baku. Cara lain: <Link href="/nominatif/upload" className="text-blue-700 underline">Upload Nominatif</Link> untuk berkas yang sudah sesuai template.
        </p>
      </div>

      <FormUploadStandarisasi bulanAwal={bulan} tahunAwal={tahun} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Riwayat Standarisasi</h2>
          <span className="text-sm">
            <Link href="/kamus" className="text-blue-700 underline">Kamus Koreksi</Link>
          </span>
        </div>
        {batches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada Standarisasi.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Bulan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Berhasil</th>
                  <th className="px-4 py-3 text-right">Perlu Review</th>
                  <th className="px-4 py-3">Diunggah oleh</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{b.bulan && b.tahun ? `${namaBulan(b.bulan)} ${b.tahun}` : "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LENCANA[b.status] ?? ""}`}>{LABEL[b.status] ?? b.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{b.jumlahBerhasil.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 text-right">{b.jumlahPerluReview.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {b.diunggahOlehNama}
                      <div className="text-xs">{waktuWib(b.diunggahPada)} WIB</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/standarisasi/${b.id}`} className="text-blue-700 underline">Buka</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
