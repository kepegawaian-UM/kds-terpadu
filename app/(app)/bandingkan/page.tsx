import { BandingkanTabs } from "@/components/standarisasi/BandingkanTabs";
import { prisma } from "@/lib/db";
import { namaBulan } from "@/lib/laporan/periode";
import { hitungPerbandinganBatch } from "@/lib/standarisasi/bandingkan";
import { JENIS_BATCH_SNAPSHOT } from "@/lib/standarisasi/proses";

export const metadata = { title: "Bandingkan Batch — KDS Terpadu" };

const pilihan = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);

export default async function BandingkanPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a: aMentah, b: bMentah } = await searchParams;
  const a = pilihan(aMentah);
  const b = pilihan(bMentah);

  // Batch "Dibatalkan" (sudah ditimpa unggahan ulang bulan yang sama) disembunyikan: datanya sudah tidak ada.
  const daftar = await prisma.uploadBatch.findMany({
    where: { status: { not: "Dibatalkan" }, jenis: { in: JENIS_BATCH_SNAPSHOT }, bulan: { not: null } },
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }, { diunggahPada: "desc" }],
    select: { id: true, bulan: true, tahun: true, jumlahBarisTotal: true, jenis: true },
  });
  const hasil = a !== null && b !== null ? await hitungPerbandinganBatch(prisma, a, b) : null;

  const kotakPilih = (nama: string, label: string, nilai: number | null) => (
    <div>
      <label htmlFor={`bd-${nama}`} className="block text-xs font-medium text-slate-700">{label}</label>
      <select id={`bd-${nama}`} name={nama} defaultValue={nilai === null ? "" : String(nilai)} required className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="" disabled>Pilih batch…</option>
        {daftar.map((bt) => (
          <option key={bt.id} value={bt.id}>
            {namaBulan(bt.bulan!)} {bt.tahun} — {bt.jumlahBarisTotal.toLocaleString("id-ID")} baris (#{bt.id})
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Bandingkan Batch</h1>
        <p className="text-sm text-slate-500">Cek penambahan, pengurangan, dan anomali NIP (ganda atau berubah) antara dua snapshot Nominatif, lalu catat alasannya.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        {kotakPilih("a", "Batch A (dibandingkan DARI)", a)}
        {kotakPilih("b", "Batch B (dibandingkan KE)", b)}
        <button type="submit" className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter">Bandingkan</button>
        {hasil && (
          <a href={`/bandingkan/export?a=${a}&b=${b}`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Unduh .xlsx
          </a>
        )}
      </form>
      {a !== null && b !== null && !hasil && <p role="alert" className="text-sm text-red-700">Batch tidak ditemukan.</p>}

      {hasil && a !== null && b !== null && (
        <BandingkanTabs batchAId={a} batchBId={b} orangBaru={hasil.orangBaru} orangHilang={hasil.orangHilang} nipAnomali={hasil.nipAnomali} catatanTersimpan={hasil.catatanTersimpan} />
      )}
    </div>
  );
}
