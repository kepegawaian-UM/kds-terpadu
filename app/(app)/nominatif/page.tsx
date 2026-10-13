import { TabelNominatif } from "@/components/laporan/TabelNominatif";
import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { prisma } from "@/lib/db";
import { daftarNominatif, namaFileNominatif, tahunNominatif } from "@/lib/laporan/nominatif";
import { resolveBulanTahun } from "@/lib/laporan/periode";

export const metadata = { title: "Nominatif — KDS Terpadu" };

export default async function NominatifPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [bulan, tahun] = await resolveBulanTahun(prisma, sp);
  const [baris, daftarTahun] = await Promise.all([daftarNominatif(prisma, bulan, tahun), tahunNominatif(prisma)]);

  const tombolNonaktif =
    "cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400";

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
          <span className={tombolNonaktif} title="Tersedia di tahap F4">
            Upload Nominatif Bulanan
          </span>
          <span className={tombolNonaktif} title="Tersedia di tahap F4">
            + Tambah Pegawai
          </span>
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
