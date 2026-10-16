import { KepalaHalaman, tombolSekunder } from "@/components/laporan/KepalaHalaman";
import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelStatistikDosen } from "@/components/laporan/TabelStatistik";
import { prisma } from "@/lib/db";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { resolveBulanTahun } from "@/lib/laporan/periode";
import { statistikDosen } from "@/lib/laporan/statistik";


export default async function StatistikDosenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [bulan, tahun] = await resolveBulanTahun(prisma, sp);
  const [s, daftarTahun] = await Promise.all([statistikDosen(prisma, bulan, tahun), tahunNominatif(prisma)]);

  return (
    <div className="space-y-5">
      <KepalaHalaman judul="Statistik Dosen">
        <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
      </FormLaporan>
        <a href={`/statistik/dosen/export?bulan=${bulan}&tahun=${tahun}`} className={tombolSekunder} download>
          Excel
        </a>
      </KepalaHalaman>

      <TabelStatistikDosen laporan={s.laporan} total={s.total} kolom={s.kolom} jabatanGroups={s.jabatanGroups} />
    </div>
  );
}
