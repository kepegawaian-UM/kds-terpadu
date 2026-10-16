import { KepalaHalaman } from "@/components/laporan/KepalaHalaman";
import { BidangFilterRekap, BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelRekapBulanan } from "@/components/laporan/TabelRekapBulanan";
import { prisma } from "@/lib/db";
import { daftarStatusKepegawaian, jenisStatusDari, keaktifanDari } from "@/lib/laporan/filter";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { laporanRekapBulanan, periodeBulanBerjalan } from "@/lib/laporan/rekapBulanan";


export default async function RekapBulananPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [bulan, tahun] = periodeBulanBerjalan(sp);
  const daftarStatus = await daftarStatusKepegawaian(prisma);
  const { jenis, status } = jenisStatusDari(sp, daftarStatus.map((s) => s.kode));
  const keaktifan = keaktifanDari(sp.keaktifan);

  const [lap, daftarTahun] = await Promise.all([
    laporanRekapBulanan(prisma, bulan, tahun, { jenis, status, keaktifan }),
    tahunNominatif(prisma),
  ]);

  const q = new URLSearchParams({ bulan: String(bulan), tahun: String(tahun), keaktifan });
  jenis.forEach((j) => q.append("jenis", j));
  status.forEach((s) => q.append("status", s));

  return (
    <div className="space-y-5">
      <KepalaHalaman judul="Absensi Bulanan">
        <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
        <BidangFilterRekap jenis={jenis} status={status} keaktifan={keaktifan} daftarStatus={daftarStatus} />
      </FormLaporan>
      </KepalaHalaman>

      <TabelRekapBulanan
        baris={lap.baris}
        komponen={lap.komponen}
        namaFile={lap.namaFile}
        urlExcel={`/rekap-kehadiran/bulanan/export?${q.toString()}`}
      />
    </div>
  );
}
