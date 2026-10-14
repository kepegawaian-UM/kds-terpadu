import { FormUploadRekap } from "@/components/upload/FormUploadRekap";
import { bulanTahunSekarang } from "@/lib/laporan/periode";

// Pemeriksaan dan penyimpanan (aksi server halaman ini) berjalan sinkron; batas Vercel Hobby 300 dtk.
export const maxDuration = 300;

export default function UploadRekapPage() {
  const [bulan, tahun] = bulanTahunSekarang(new Date());
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Upload Rekap Kehadiran Bulanan</h1>
        <p className="text-sm text-slate-500">
          Baris dengan NIP tidak dikenal dilewati otomatis dan dilaporkan; tidak menggagalkan seluruh berkas. Mengunggah ulang bulan yang sama mengganti datanya.
        </p>
      </div>
      <FormUploadRekap bulanAwal={bulan} tahunAwal={tahun} />
    </div>
  );
}
