import { BidangFilterRekap, BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelRekapBulanan } from "@/components/laporan/TabelRekapBulanan";
import { prisma } from "@/lib/db";
import { daftarStatusKepegawaian, jenisStatusDari, keaktifanDari } from "@/lib/laporan/filter";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { namaBulan } from "@/lib/laporan/periode";
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
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Rekap Kehadiran Bulanan</h1>
        <p className="text-sm text-slate-500">
          Kehadiran per pegawai per bulan, dibaca dinamis dari komponen kehadiran.
        </p>
      </div>

      <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
        <BidangFilterRekap jenis={jenis} status={status} keaktifan={keaktifan} daftarStatus={daftarStatus} />
      </FormLaporan>

      <TabelRekapBulanan
        baris={lap.baris}
        komponen={lap.komponen}
        namaFile={lap.namaFile}
        urlExcel={`/rekap-kehadiran/bulanan/export?${q.toString()}`}
      />

      <p className="tanpa-cetak text-xs text-slate-500">
        Daftar ini adalah pegawai yang aktif menurut snapshot Nominatif {namaBulan(bulan)} {tahun}, diurutkan dari TK
        (Tanpa Keterangan) terbanyak sebagai default (bisa diurut ulang, klik judul kolom mana saja). Baris tanpa data
        (&quot;-&quot;) berarti pegawai tersebut belum ada rekap kehadiran yang di-upload untuk bulan/tahun ini. Sel
        berlatar <span className="sel-koreksi px-1">kuning</span> adalah angka hasil koreksi manual (arahkan kursor untuk
        melihat alasannya).
      </p>
    </div>
  );
}
