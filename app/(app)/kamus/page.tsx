import { TombolHapus } from "@/components/standarisasi/TombolTindakan";
import { prisma } from "@/lib/db";

import { hapusKamusAksi } from "../standarisasi/actions";


export default async function KamusPage() {
  const entri = await prisma.kamusKoreksi.findMany({
    orderBy: [{ jenisField: "asc" }, { dibuatPada: "desc" }],
    include: { dibuatOleh: { select: { nama: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Kamus Koreksi</h1>
        <p className="text-sm text-slate-500">
          Nilai mentah yang sudah pernah diselesaikan admin secara manual dipakai lagi otomatis untuk nilai mentah yang sama pada Standarisasi bulan berikutnya. Menghapus entri tidak mengubah snapshot yang sudah tersimpan.
        </p>
      </div>

      {entri.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Belum ada koreksi yang tersimpan.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Jenis Field</th>
                <th className="px-4 py-3">Nilai Mentah</th>
                <th className="px-4 py-3">Hasil Resolusi</th>
                <th className="px-4 py-3">Dibuat oleh</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entri.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-slate-600">{e.jenisField}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.kunciMentah.replace(/‖/g, " | ")}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{e.nilaiResolusi}</td>
                  <td className="px-4 py-3 text-slate-500">{e.dibuatOleh.nama}</td>
                  <td className="px-4 py-3 text-right">
                    <TombolHapus aksi={hapusKamusAksi.bind(null, e.id)} tanya="Hapus entri kamus ini? Nilai mentah ini akan masuk antrean Review lagi pada Standarisasi berikutnya." />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
