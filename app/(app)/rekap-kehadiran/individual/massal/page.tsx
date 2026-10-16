import Link from "next/link";

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
  const [daftarStatus, daftarTahun, kandidat] = await Promise.all([
    daftarStatusKepegawaian(prisma),
    tahunNominatif(prisma),
    kandidatMassal(prisma, p.tahun, { jenis: p.jenis, status: p.status, keaktifan: p.keaktifan }, p.minTk),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Absensi Pegawai Massal</h1>
        <p className="text-sm text-slate-500">
          Pilih Dosen/Tendik berdasarkan kriteria (mis. TK setahun minimal 20 hari), lalu cetak semuanya sekaligus (satu dokumen per halaman) atau unduh Excel (satu sheet per pegawai).
        </p>
      </div>

      <FormLaporan>
        <BidangPeriode tahun={p.tahun} tahunTersedia={daftarTahun} />
        <BidangFilterRekap jenis={p.jenis} status={p.status} keaktifan={p.keaktifan} daftarStatus={daftarStatus} />
        <div>
          <label htmlFor="min_tk" className="block text-xs font-medium text-slate-600">TK setahun minimal (hari)</label>
          <input id="min_tk" name="min_tk" type="number" min={0} max={366} defaultValue={p.minTk} className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
        </div>
      </FormLaporan>

      <PilihanMassal key={`${p.tahun}-${p.minTk}-${p.keaktifan}-${p.jenis.join()}-${p.status.join()}`} kandidat={kandidat} maks={MAKS_PEGAWAI_MASSAL} tahun={p.tahun} minTk={p.minTk} keaktifan={p.keaktifan} jenis={p.jenis} status={p.status} />

      <p className="text-sm">
        <Link href={`/rekap-kehadiran/individual?tahun=${p.tahun}`} className="text-blue-700 underline">&larr; Absensi satu pegawai</Link>
      </p>
    </div>
  );
}
