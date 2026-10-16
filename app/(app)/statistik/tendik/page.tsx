import { KepalaHalaman, tombolSekunder } from "@/components/laporan/KepalaHalaman";
import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelStatistikTendik } from "@/components/laporan/TabelStatistik";
import { prisma } from "@/lib/db";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { resolveBulanTahun } from "@/lib/laporan/periode";
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
      <KepalaHalaman judul="Statistik Tendik">
        <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
      </FormLaporan>
        <a href={`/statistik/tendik/export?bulan=${bulan}&tahun=${tahun}`} className={tombolSekunder} download>
          Excel
        </a>
      </KepalaHalaman>

      <TabelStatistikTendik statistik={s.statistik} total={s.total} />
    </div>
  );
}
