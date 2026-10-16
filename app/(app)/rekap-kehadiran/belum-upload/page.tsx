import { BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelBelumUpload } from "@/components/laporan/TabelBelumUpload";
import { prisma } from "@/lib/db";
import { laporanBelumUpload, urutkanUntukTampilan } from "@/lib/laporan/belumUpload";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { namaBulan, resolveBulanTahun } from "@/lib/laporan/periode";


function Kartu({ judul, nilai, kelas = "text-slate-900", children }: { judul: string; nilai: number; kelas?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="text-sm text-slate-500">{judul}</div>
      <div className={`mt-1 text-3xl font-bold ${kelas}`}>{nilai.toLocaleString("id-ID")}</div>
      {children}
    </div>
  );
}

export default async function BelumUploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [bulan, tahun] = await resolveBulanTahun(prisma, sp);
  const [lap, daftarTahun] = await Promise.all([laporanBelumUpload(prisma, bulan, tahun), tahunNominatif(prisma)]);
  const namaFile = `Pegawai Belum Ada Absensi ${namaBulan(bulan)} ${tahun}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pegawai Belum Ada Absensi</h1>
        <p className="text-sm text-slate-500">
          Selisih antara snapshot Nominatif dan Absensi Bulanan yang sudah diupload, bulan{" "}
          {namaBulan(bulan)} {tahun}.
        </p>
      </div>

      <FormLaporan>
        <BidangPeriode bulan={bulan} tahun={tahun} tahunTersedia={daftarTahun} />
      </FormLaporan>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kartu judul="Total Dosen + Tendik (Nominatif)" nilai={lap.totalNominatif} />
        <Kartu judul="Sudah Ada Absensi" nilai={lap.totalSudahRekap} kelas="text-accent-green" />
        <div className="rounded-xl border border-t-4 border-slate-200 border-t-red-400 bg-white p-6">
          <div className="text-sm text-slate-500">Perlu Ditindaklanjuti</div>
          <div className="mt-1 text-3xl font-bold text-red-600">{lap.jumlahPerluTindakLanjut.toLocaleString("id-ID")}</div>
          <div className="mt-1 text-xs text-slate-400">
            + {lap.jumlahBelumTmt.toLocaleString("id-ID")} belum mulai kerja,{" "}
            {lap.jumlahSudahTidakAktif.toLocaleString("id-ID")} sudah tidak aktif (wajar)
          </div>
        </div>
      </div>

      {lap.ringkasanPerUnit.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase text-slate-500">
            Ringkasan per Unit Kerja (yang perlu ditindaklanjuti)
          </h3>
          <div className="space-y-2">
            {lap.ringkasanPerUnit.map(([unit, jumlah]) => (
              <div key={unit} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                <span className="text-slate-700">{unit}</span>
                <span className="font-semibold text-red-600">{jumlah.toLocaleString("id-ID")} orang</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Kalau jumlahnya terkonsentrasi di 1-2 unit tertentu, kemungkinan besar presensi unit itu belum diupload
            sama sekali - tinggal tanyakan ke unit tersebut, bukan cek satu-satu per orang.
          </p>
        </section>
      )}

      <TabelBelumUpload baris={urutkanUntukTampilan(lap.belum)} namaFile={namaFile} />
    </div>
  );
}
