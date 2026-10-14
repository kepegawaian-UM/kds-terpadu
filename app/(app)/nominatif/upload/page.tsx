import { FormUploadNominatif } from "@/components/upload/FormUploadNominatif";
import { bulanTahunSekarang } from "@/lib/laporan/periode";

// Pemeriksaan dan penyimpanan (aksi server halaman ini) berjalan sinkron; batas Vercel Hobby 300 dtk.
export const maxDuration = 300;

export default function UploadNominatifPage() {
  const [bulan, tahun] = bulanTahunSekarang(new Date());
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Upload Nominatif Bulanan</h1>
        <p className="text-sm text-slate-500">
          Snapshot Nominatif satu bulan. Baris yang kolomnya tidak cocok dengan data master dilewati dan dilaporkan; mengunggah ulang bulan yang sama mengganti datanya.
        </p>
      </div>
      <FormUploadNominatif bulanAwal={bulan} tahunAwal={tahun} />
    </div>
  );
}
