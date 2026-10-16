import { KepalaHalaman } from "@/components/laporan/KepalaHalaman";
import { prisma } from "@/lib/db";
import { formatWaktuWib } from "@/lib/laporan/dashboard";
import { namaBulan } from "@/lib/laporan/periode";
import { BATAS_MB, dataStatusSistem, PERINGATAN_MB } from "@/lib/laporan/statusSistem";

export const dynamic = "force-dynamic";

const WARNA = { aman: "bg-emerald-500", peringatan: "bg-amber-500", bahaya: "bg-red-600" } as const;
const TEKS = { aman: "Aman", peringatan: "Perlu diperhatikan", bahaya: "Hampir penuh" } as const;
const mb = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

export default async function StatusSistemPage() {
  const d = await dataStatusSistem(prisma);
  return (
    <div className="space-y-5">
      <KepalaHalaman judul="Status Sistem" />

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <div className="text-sm text-slate-500">Ukuran database</div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${WARNA[d.tingkat]}`}>{TEKS[d.tingkat]}</span>
        </div>
        <div className="mt-1 text-3xl font-bold text-sidebar">
          {mb(d.ukuranMb)} MB <span className="text-base font-normal text-slate-500">dari {BATAS_MB} MB</span>
        </div>
        <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${WARNA[d.tingkat]}`} style={{ width: `${Math.min(100, d.persen)}%` }} />
          <div className="absolute inset-y-0 w-px bg-slate-400" style={{ left: `${(PERINGATAN_MB / BATAS_MB) * 100}%` }} title={`Batas peringatan ${PERINGATAN_MB} MB`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Pertumbuhan rata-rata</div>
            <div className="font-medium">{d.pertumbuhanMbPerBulan === null ? "-" : `${mb(d.pertumbuhanMbPerBulan)} MB / bulan`}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Perkiraan sisa</div>
            <div className="font-medium">{d.sisaBulan === null ? "-" : d.sisaBulan >= 12 ? `${mb(d.sisaBulan / 12)} tahun` : `${d.sisaBulan} bulan`}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Bulan</th>
                <th className="px-3 py-2 text-right">Nominatif</th>
                <th className="px-3 py-2 text-right">Absensi</th>
                <th className="px-3 py-2">Terakhir diunggah (WIB)</th>
              </tr>
            </thead>
            <tbody>
              {d.perBulan.map((b) => (
                <tr key={`${b.tahun}-${b.bulan}`} className="border-t">
                  <td className="px-3 py-1.5">
                    {namaBulan(b.bulan)} {b.tahun}
                  </td>
                  <td className="px-3 py-1.5 text-right">{b.nominatif.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-1.5 text-right">{b.absensi === 0 ? <span className="text-slate-400">-</span> : b.absensi.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-1.5 text-slate-600">{b.terakhirDiunggah ? formatWaktuWib(b.terakhirDiunggah) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="self-start overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Tabel terbesar</th>
                <th className="px-3 py-2 text-right">MB</th>
              </tr>
            </thead>
            <tbody>
              {d.tabelTerbesar.map((t) => (
                <tr key={t.nama} className="border-t">
                  <td className="px-3 py-1.5 font-mono text-xs">{t.nama}</td>
                  <td className="px-3 py-1.5 text-right">{mb(t.mb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
