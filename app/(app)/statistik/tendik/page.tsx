import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelStatistikTendik } from "@/components/laporan/TabelStatistik";
import { prisma } from "@/lib/db";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { namaBulan, resolveBulanTahun } from "@/lib/laporan/periode";
import { statistikTendik } from "@/lib/laporan/statistik";


export default async function StatistikTendikPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [bulan, tahun] = await resolveBulanTahun(prisma, sp);
  const [s, daftarTahun] = await Promise.all([statistikTendik(prisma, bulan, tahun), tahunNominatif(prisma)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Statistik Tendik</h1>
        <p className="text-sm text-slate-500">
          Ringkasan Unit Kerja x Status Kepegawaian x Golongan x Pendidikan Terakhir, dari snapshot Nominatif{" "}
          {namaBulan(bulan)} {tahun}.
        </p>
      </div>

      <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
      </FormLaporan>

      <TabelStatistikTendik statistik={s.statistik} total={s.total} />

      <p className="tanpa-cetak text-xs text-slate-500">
        Dihitung on-the-fly dari snapshot Nominatif bulan/tahun terpilih (jenis pegawai Tendik saja), dikelompokkan per
        Unit Induk (Fakultas/Direktorat/dst). Kolom &quot;-&quot; pada Golongan/Pendidikan Terakhir berarti data itu kosong pada
        snapshot tersebut.
      </p>
    </div>
  );
}
