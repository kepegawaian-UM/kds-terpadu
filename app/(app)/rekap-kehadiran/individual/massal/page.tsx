import Link from "next/link";

import { KepalaHalaman } from "@/components/laporan/KepalaHalaman";
import { BidangFilterRekap, BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { PilihanMassal } from "@/components/rekap/PilihanMassal";
import { prisma } from "@/lib/db";
import { daftarStatusKepegawaian } from "@/lib/laporan/filter";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { bacaParamMassal, dariRecord, kandidatMassal, MAKS_PEGAWAI_MASSAL } from "@/lib/laporan/rekapIndividual";

export const maxDuration = 120;

export default async function RekapIndividualMassalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = await bacaParamMassal(prisma, dariRecord(sp));
  const [daftarStatus, daftarTahun, kandidat, daftarUnitInduk] = await Promise.all([
    daftarStatusKepegawaian(prisma),
    tahunNominatif(prisma),
    kandidatMassal(prisma, p.tahun, { jenis: p.jenis, status: p.status, keaktifan: p.keaktifan }, p.minTk, p.unitInduk),
    prisma.unitInduk.findMany({ orderBy: { nama: "asc" }, select: { kode: true, nama: true } }),
  ]);

  return (
    <div className="space-y-5">
      <KepalaHalaman judul="Absensi Pegawai Massal">
        <FormLaporan>
        <BidangPeriode tahun={p.tahun} tahunTersedia={daftarTahun} />
        <BidangFilterRekap jenis={p.jenis} status={p.status} keaktifan={p.keaktifan} daftarStatus={daftarStatus} />
        <div>
          <label htmlFor="unit_induk" className="block text-xs font-medium text-slate-600">Unit Induk</label>
          <select id="unit_induk" name="unit_induk" defaultValue={p.unitInduk} className="max-w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Semua unit induk</option>
            {daftarUnitInduk.map((u) => (
              <option key={u.kode} value={u.kode}>
                {u.nama}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="min_tk" className="block text-xs font-medium text-slate-600">TK setahun minimal (hari)</label>
          <input id="min_tk" name="min_tk" type="number" min={0} max={366} defaultValue={p.minTk} className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
        </div>
      </FormLaporan>
      </KepalaHalaman>

      <PilihanMassal key={`${p.tahun}-${p.minTk}-${p.keaktifan}-${p.jenis.join()}-${p.status.join()}-${p.unitInduk}`} kandidat={kandidat} maks={MAKS_PEGAWAI_MASSAL} tahun={p.tahun} minTk={p.minTk} keaktifan={p.keaktifan} jenis={p.jenis} status={p.status} unitInduk={p.unitInduk} />

      <p className="text-sm">
        <Link href={`/rekap-kehadiran/individual?tahun=${p.tahun}`} className="text-blue-700 underline">&larr; Absensi satu pegawai</Link>
      </p>
    </div>
  );
}
