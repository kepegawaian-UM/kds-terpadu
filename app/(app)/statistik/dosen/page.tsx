import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelStatistikDosen } from "@/components/laporan/TabelStatistik";
import { prisma } from "@/lib/db";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { namaBulan, resolveBulanTahun } from "@/lib/laporan/periode";
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
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Statistik Dosen</h1>
        <p className="text-sm text-slate-500">
          Ringkasan Fakultas/Jurusan x Jabatan Fungsional x Golongan x Jenis Kelamin x Pendidikan, dari snapshot Nominatif{" "}
          {namaBulan(bulan)} {tahun}.
        </p>
      </div>

      <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
      </FormLaporan>

      <TabelStatistikDosen laporan={s.laporan} total={s.total} kolom={s.kolom} jabatanGroups={s.jabatanGroups} />

      <p className="tanpa-cetak text-xs text-slate-500">
        Dihitung on-the-fly dari snapshot Nominatif bulan/tahun terpilih (jenis pegawai Dosen saja, yang punya jabatan
        fungsional; unit &quot;belum diketahui&quot; dikecualikan). Kolom Golongan di tiap Jabatan Fungsional bersifat dinamis -
        cuma menampilkan golongan yang benar-benar dipakai pada snapshot ini (termasuk skala golongan PPPK bila ada).
        Pendidikan Terakhir belum dipisah Luar Negeri/Dalam Negeri karena datanya belum tersedia di skema.
      </p>
    </div>
  );
}
