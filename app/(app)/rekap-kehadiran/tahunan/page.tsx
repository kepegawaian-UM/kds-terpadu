import { BidangFilterRekap, BidangPeriode, FormLaporan } from "@/components/laporan/FormLaporan";
import { TabelRekapTahunan } from "@/components/laporan/TabelRekapTahunan";
import { prisma } from "@/lib/db";
import { daftarStatusKepegawaian, jenisStatusDari, keaktifanDari } from "@/lib/laporan/filter";
import { tahunNominatif } from "@/lib/laporan/nominatif";
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

  const [lap, daftarTahun] = await Promise.all([
    laporanRekapTahunan(prisma, tahun, { jenis, status, keaktifan }),
    tahunNominatif(prisma),
  ]);

  const q = new URLSearchParams({ tahun: String(tahun), keaktifan });
  jenis.forEach((j) => q.append("jenis", j));
  status.forEach((s) => q.append("status", s));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Absensi Tahunan</h1>
        <p className="text-sm text-slate-500">Agregat (SUM) kehadiran setahun, dihitung langsung dari absensi bulanan.</p>
      </div>

      <FormLaporan>
        <BidangPeriode tahun={tahun} tahunTersedia={daftarTahun} />
        <BidangFilterRekap jenis={jenis} status={status} keaktifan={keaktifan} daftarStatus={daftarStatus} />
      </FormLaporan>

      <form
        method="get"
        action="/rekap-kehadiran/tahunan/tk"
        className="tanpa-cetak flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        {[...q.entries()].map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}
        <div className="min-w-60 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Laporan TK untuk Tindak Lanjut</h2>
          <p className="text-xs text-slate-500">
            Excel berisi ringkasan per unit, daftar pegawai ber-TK per bulan (Jan-Des), dan satu sheet per unit induk. Memakai tahun dan filter di atas.
          </p>
        </div>
        <label className="text-xs font-medium text-slate-600">
          Minimal hari TK setahun
          <input
            type="number"
            name="min_tk"
            min={1}
            max={400}
            defaultValue={3}
            className="mt-1 block w-28 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
        <button type="submit" className="rounded-md bg-sidebar px-4 py-1.5 text-sm font-medium text-white hover:bg-sidebar-lighter">
          Unduh Excel TK
        </button>
      </form>

      <TabelRekapTahunan
        baris={lap.baris.map((b) => ({ id: b.id, nip: b.nip, nama: b.nama, badge: b.badge, sel: b.sel }))}
        komponen={lap.komponen}
        namaFile={lap.namaFile}
        urlExcel={`/rekap-kehadiran/tahunan/export?${q.toString()}`}
      />

      <p className="tanpa-cetak text-xs text-slate-500">
        Angka adalah total (SUM) selama setahun, dihitung langsung dari absensi bulanan yang sudah diupload - bukan tabel
        tersendiri. Diurutkan dari TK (Tanpa Keterangan) terbanyak sebagai default (bisa diurut ulang, klik judul kolom
        mana saja). Pegawai yang ditampilkan adalah yang punya minimal 1 snapshot Nominatif di tahun terpilih. Filter
        Keaktifan: <strong>Aktif saja</strong> (default) menyembunyikan pegawai yang sudah tidak ada di Nominatif bulan
        terakhir tahun itu atau sudah tercatat pensiun/resign/meninggal/habis kontrak; datanya tidak dihapus, pilih{" "}
        <strong>Semua</strong> atau <strong>Non-aktif saja</strong> untuk melihatnya.
      </p>
    </div>
  );
}
