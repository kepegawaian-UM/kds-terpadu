import Link from "next/link";

import { DokumenRekapIndividual, GayaDokumenIndividual } from "@/components/rekap/DokumenRekapIndividual";
import { TombolCetak } from "@/components/rekap/TombolCetak";
import { prisma } from "@/lib/db";
import { buatNamaFile } from "@/lib/laporan/namaFile";
import { bulanTahunSekarang, keInt } from "@/lib/laporan/periode";
import { bangunRekapIndividual, cariPegawaiIndividual, type KandidatCari, type LaporanIndividual, tanggalCetakWib } from "@/lib/laporan/rekapIndividual";


const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RekapIndividualPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [, tahunIni] = bulanTahunSekarang(new Date());
  const tahunMentah = satu(sp.tahun) === undefined ? tahunIni : keInt(satu(sp.tahun));
  const tahun = tahunMentah >= 2020 && tahunMentah <= 2100 ? tahunMentah : tahunIni;
  const nipMentah = satu(sp.nip) ?? "";
  const nip = /^\d{1,20}$/.test(nipMentah) ? nipMentah : null;
  const cari = (satu(sp.cari) ?? "").trim();

  let laporan: LaporanIndividual | null = null;
  let kandidat: KandidatCari[] | null = null;
  let pesan: string | null = null;

  if (nip) {
    laporan = await bangunRekapIndividual(prisma, nip, tahun);
    pesan = laporan ? null : "NIP tidak ditemukan di data Nominatif.";
  } else if (cari !== "") {
    kandidat = await cariPegawaiIndividual(prisma, cari, tahun);
    if (kandidat.length === 1) {
      laporan = await bangunRekapIndividual(prisma, kandidat[0].nip, tahun);
      kandidat = null;
    } else if (kandidat.length === 0) {
      pesan = `Tidak ada Dosen/Tendik dengan NIP atau nama tersebut pada Nominatif tahun ${tahun}.`;
    }
  }
  const namaFile = laporan ? buatNamaFile("Rekap Individual", [], [], `${laporan.identitas.nama} ${laporan.tahun}`, []) : null;

  return (
    <div className="space-y-5">
      <div className="tanpa-cetak">
        <h1 className="text-xl font-semibold text-slate-900">Rekap Individual</h1>
        <p className="text-sm text-slate-500">Rekap kehadiran satu pegawai selama setahun (satu baris per bulan), siap dicetak atau disimpan sebagai PDF.</p>
      </div>

      <div className="tanpa-cetak flex justify-end">
        <Link href={`/rekap-kehadiran/individual/massal?tahun=${tahun}`} className="text-sm text-blue-700 underline">
          Cetak / unduh massal &rarr;
        </Link>
      </div>

      <form method="get" className="tanpa-cetak grid grid-cols-1 items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="ri-cari" className="block text-sm font-medium">NIP atau Nama (Dosen/Tendik)</label>
          <input id="ri-cari" name="cari" defaultValue={cari} placeholder="Ketik NIP atau nama" className={kotak} />
        </div>
        <div>
          <label htmlFor="ri-tahun" className="block text-sm font-medium">Tahun</label>
          <input id="ri-tahun" name="tahun" type="number" defaultValue={tahun} className={kotak} />
        </div>
        <button type="submit" className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter">Cari</button>
      </form>

      {pesan && <div role="alert" className="tanpa-cetak rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">{pesan}</div>}

      {kandidat && kandidat.length > 1 && (
        <section className="tanpa-cetak rounded-lg border border-slate-200 bg-white p-4" aria-label="Pegawai yang cocok">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">{kandidat.length} pegawai cocok, pilih salah satu</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500"><th className="py-2 pr-3">Nama</th><th className="py-2 pr-3">NIP</th><th className="py-2 pr-3">Jenis</th><th className="py-2 pr-3">Unit Kerja</th><th className="py-2" /></tr>
            </thead>
            <tbody>
              {kandidat.map((k) => (
                <tr key={k.nip} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{k.nama}</td><td className="py-2 pr-3">{k.nip}</td><td className="py-2 pr-3">{k.jenis}</td><td className="py-2 pr-3">{k.unit}</td>
                  <td className="py-2 text-right"><Link className="text-blue-700 underline" href={`/rekap-kehadiran/individual?nip=${k.nip}&tahun=${tahun}`}>Buka</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Daftar dibatasi 30 pegawai pertama; persempit kata kunci bila perlu.</p>
        </section>
      )}

      {laporan && namaFile && (
        <>
          <div className="tanpa-cetak flex flex-wrap items-center gap-3">
            <TombolCetak namaFile={namaFile} />
            <a href={`/rekap-kehadiran/individual/export?nip=${laporan.nip}&tahun=${laporan.tahun}`} download className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Export Excel
            </a>
            <span className="text-xs text-slate-500">Pada dialog cetak, pilih tujuan &quot;Simpan sebagai PDF&quot; dan matikan opsi &quot;Header dan footer&quot; agar tampilan bersih.</span>
          </div>
          <GayaDokumenIndividual />
          <DokumenRekapIndividual laporan={laporan} tanggalCetak={tanggalCetakWib()} />
        </>
      )}
    </div>
  );
}
