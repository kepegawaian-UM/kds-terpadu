import { BidangFilterRekap, BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { KepalaHalaman, tombolSekunder } from "@/components/laporan/KepalaHalaman";
import { TabelRekapTahunan } from "@/components/laporan/TabelRekapTahunan";
import { prisma } from "@/lib/db";
import { daftarStatusKepegawaian, jenisStatusDari, keaktifanDari } from "@/lib/laporan/filter";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { KATEGORI_TK, kategoriDari } from "@/lib/laporan/kategoriTk";
import { laporanRekapTahunan, periodeTahunBerjalan } from "@/lib/laporan/rekapTahunan";


export default async function RekapTahunanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tahun = periodeTahunBerjalan({ tahun: sp.tahun });
  const daftarStatus = await daftarStatusKepegawaian(prisma);
  const { jenis, status } = jenisStatusDari(sp, daftarStatus.map((s) => s.kode));
  const keaktifan = keaktifanDari(sp.keaktifan);
  const kategori = kategoriDari(typeof sp.kategori === "string" ? sp.kategori : null) ?? "semua";
  const unitIndukKode = typeof sp.unit_induk === "string" ? sp.unit_induk.trim() : "";

  const [lap, daftarTahun, daftarUnitInduk] = await Promise.all([
    laporanRekapTahunan(prisma, tahun, { jenis, status, keaktifan }, { kategori, unitIndukKode }),
    tahunNominatif(prisma),
    prisma.unitInduk.findMany({ orderBy: { nama: "asc" }, select: { kode: true, nama: true } }),
  ]);

  const q = new URLSearchParams({ tahun: String(tahun), keaktifan, kategori });
  if (unitIndukKode) q.set("unit_induk", unitIndukKode);
  jenis.forEach((j) => q.append("jenis", j));
  status.forEach((s) => q.append("status", s));

  return (
    <div className="space-y-5">
      <KepalaHalaman judul="Absensi Tahunan">
        <FormLaporan>
          <BidangPeriode tahun={tahun} tahunTersedia={daftarTahun} />
          <BidangFilterRekap jenis={jenis} status={status} keaktifan={keaktifan} daftarStatus={daftarStatus} />
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            Kategori TK
            <select name="kategori" defaultValue={kategori} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800">
              {Object.entries(KATEGORI_TK).map(([kode, k]) => (
                <option key={kode} value={kode}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            Unit Induk
            <select name="unit_induk" defaultValue={unitIndukKode} className="max-w-56 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800">
              <option value="">Semua unit induk</option>
              {daftarUnitInduk.map((u) => (
                <option key={u.kode} value={u.kode}>
                  {u.nama}
                </option>
              ))}
            </select>
          </label>
        </FormLaporan>
        <form method="get" action="/rekap-kehadiran/tahunan/tk" className="flex items-center gap-2">
          {[...q.entries()].map(([k, v], i) => (
            <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
          ))}
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input type="checkbox" name="shift" value="1" />
            Sertakan Satpam/bershift
          </label>
          <button type="submit" className={tombolSekunder}>
            Excel TK
          </button>
        </form>
      </KepalaHalaman>

      <TabelRekapTahunan
        baris={lap.baris.map((b) => ({ id: b.id, nip: b.nip, nama: b.nama, badge: b.badge, sel: b.sel }))}
        komponen={lap.komponen}
        namaFile={lap.namaFile}
        urlExcel={`/rekap-kehadiran/tahunan/export?${q.toString()}`}
      />
    </div>
  );
}
