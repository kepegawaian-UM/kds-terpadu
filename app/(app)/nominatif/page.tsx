import Link from "next/link";

import { TabelNominatif } from "@/components/laporan/TabelNominatif";
import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
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

  const tombol = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50";
  const tombolUtama = "rounded-md bg-sidebar px-3 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Detail Pegawai</h1>
          <p className="text-sm text-slate-500">
            Snapshot data pegawai per bulan/tahun, diarsipkan dari upload Nominatif Bulanan.
          </p>
        </div>
        <div className="tanpa-cetak flex gap-2">
          <Link href="/nominatif/upload" className={tombol}>
            Upload Nominatif Bulanan
          </Link>
          <Link href="/nominatif/baru" className={tombolUtama}>
            + Tambah Pegawai
          </Link>
        </div>
      </div>

      <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
      </FormLaporan>

      <TabelNominatif
        baris={baris}
        namaFile={namaFileNominatif(bulan, tahun)}
        urlExcel={`/nominatif/export?bulan=${bulan}&tahun=${tahun}`}
      />
    </div>
  );
}
