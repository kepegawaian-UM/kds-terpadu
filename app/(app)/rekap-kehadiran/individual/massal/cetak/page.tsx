import Link from "next/link";

import { DokumenRekapIndividual, GayaDokumenIndividual } from "@/components/rekap/DokumenRekapIndividual";
import { TombolCetak } from "@/components/rekap/TombolCetak";
import { prisma } from "@/lib/db";
import { bacaParamMassal, dariRecord, laporanTerpilih, namaFileMassal, tanggalCetakWib } from "@/lib/laporan/rekapIndividual";

export const maxDuration = 120;

export default async function CetakMassalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = await bacaParamMassal(prisma, dariRecord(sp));
  const terpilih = await laporanTerpilih(prisma, p.nip, p.tahun);
  const namaFile = await namaFileMassal(prisma, p);

  if ("galat" in terpilih) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{terpilih.galat}</div>
        <Link href={`/rekap-kehadiran/individual/massal?tahun=${p.tahun}`} className="text-sm text-blue-700 underline">Kembali</Link>
      </div>
    );
  }
  const tanggalCetak = tanggalCetakWib();

  return (
    <div className="space-y-5">
      <div className="tanpa-cetak">
        <h1 className="text-xl font-semibold text-slate-900">Cetak Massal Absensi Pegawai</h1>
        <p className="text-sm text-slate-500">{terpilih.daftar.length} dokumen, satu dokumen per halaman. Nama file PDF yang disarankan: {namaFile}</p>
      </div>

      <div className="tanpa-cetak flex flex-wrap items-center gap-3">
        <TombolCetak namaFile={namaFile} />
        <Link href={`/rekap-kehadiran/individual/massal?tahun=${p.tahun}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Kembali</Link>
        <span className="text-xs text-slate-500">Pada dialog cetak, pilih tujuan &quot;Simpan sebagai PDF&quot;, matikan &quot;Header dan footer&quot;, dan beri nama file sesuai saran di atas.</span>
      </div>

      {terpilih.daftar.length === 0 ? (
        <div className="tanpa-cetak rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">Tidak ada data pegawai yang bisa dicetak.</div>
      ) : (
        <>
          <GayaDokumenIndividual />
          {terpilih.daftar.map((l) => (
            <DokumenRekapIndividual key={l.nip} laporan={l} tanggalCetak={tanggalCetak} />
          ))}
        </>
      )}
    </div>
  );
}
