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
        <h1 className="text-xl font-semibold text-slate-900">Rekap Kehadiran Tahunan</h1>
        <p className="text-sm text-slate-500">Agregat (SUM) kehadiran setahun, dihitung langsung dari rekap bulanan.</p>
      </div>

      <FormLaporan>
        <BidangPeriode tahun={tahun} tahunTersedia={daftarTahun} />
        <BidangFilterRekap jenis={jenis} status={status} keaktifan={keaktifan} daftarStatus={daftarStatus} />
      </FormLaporan>

      <TabelRekapTahunan
        baris={lap.baris.map((b) => ({ id: b.id, nip: b.nip, nama: b.nama, badge: b.badge, sel: b.sel }))}
        komponen={lap.komponen}
        namaFile={lap.namaFile}
        urlExcel={`/rekap-kehadiran/tahunan/export?${q.toString()}`}
      />

      <p className="tanpa-cetak text-xs text-slate-500">
        Angka adalah total (SUM) selama setahun, dihitung langsung dari rekap bulanan yang sudah diupload - bukan tabel
        tersendiri. Diurutkan dari TK (Tanpa Keterangan) terbanyak sebagai default (bisa diurut ulang, klik judul kolom
        mana saja). Pegawai yang ditampilkan adalah yang punya minimal 1 snapshot Nominatif di tahun terpilih. Filter
        Keaktifan: <strong>Aktif saja</strong> (default) menyembunyikan pegawai yang sudah tidak ada di Nominatif bulan
        terakhir tahun itu atau sudah tercatat pensiun/resign/meninggal/habis kontrak; datanya tidak dihapus, pilih{" "}
        <strong>Semua</strong> atau <strong>Non-aktif saja</strong> untuk melihatnya.
      </p>
    </div>
  );
}
