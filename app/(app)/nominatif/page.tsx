import Link from "next/link";

import { TabelNominatif } from "@/components/laporan/TabelNominatif";
import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { KepalaHalaman, tombolSekunder, tombolUtama } from "@/components/laporan/KepalaHalaman";
import { prisma } from "@/lib/db";
import { daftarNominatif, namaFileNominatif, tahunNominatif } from "@/lib/laporan/nominatif";
import { resolveBulanTahun } from "@/lib/laporan/periode";


export default async function NominatifPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [bulan, tahun] = await resolveBulanTahun(prisma, sp);
  const [baris, daftarTahun] = await Promise.all([daftarNominatif(prisma, bulan, tahun), tahunNominatif(prisma)]);


  return (
    <div className="space-y-5">
      <KepalaHalaman judul="Detail Pegawai">
        <FormLaporan>
          <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
        </FormLaporan>
        <a href={`/nominatif/export?format=lengkap&bulan=${bulan}&tahun=${tahun}`} className={tombolSekunder} download>
          Excel Lengkap
        </a>
        <Link href="/nominatif/baru" className={tombolUtama}>
          + Tambah Pegawai
        </Link>
      </KepalaHalaman>

      <TabelNominatif
        baris={baris}
        namaFile={namaFileNominatif(bulan, tahun)}
        urlExcel={`/nominatif/export?bulan=${bulan}&tahun=${tahun}`}
      />
    </div>
  );
}
