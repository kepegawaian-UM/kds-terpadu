import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { daftarStatusKepegawaian, jenisStatusDari, keaktifanDari } from "@/lib/laporan/filter";
import { kategoriDari } from "@/lib/laporan/kategoriTk";
import { eksporRekapTahunan, namaFileRekapTahunan, periodeTahunBerjalan } from "@/lib/laporan/rekapTahunan";
import { responXlsx } from "@/lib/laporan/xlsx";

export const dynamic = "force-dynamic";

/** Nilai ?jenis=A&jenis=B maupun ?jenis[]=A&jenis[]=B (bentuk yang dipakai KDS2). */
const semuaNilai = (sp: URLSearchParams, kunci: string) => [...sp.getAll(kunci), ...sp.getAll(`${kunci}[]`)];

/** Ekspor Excel Rekap Kehadiran Tahunan mengikuti filter yang sama dengan halaman (tanpa pencarian tabel). */
export async function GET(request: Request) {
  if (!(await auth())?.user) return new Response("Tidak diizinkan", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const tahun = periodeTahunBerjalan({ tahun: sp.get("tahun") });
  const daftarStatus = await daftarStatusKepegawaian(prisma);
  const { jenis, status } = jenisStatusDari(
    { jenis: semuaNilai(sp, "jenis"), status: semuaNilai(sp, "status") },
    daftarStatus.map((s) => s.kode)
  );
  const filter = { jenis, status, keaktifan: keaktifanDari(sp.get("keaktifan")) };

  const tambahan = { kategori: kategoriDari(sp.get("kategori")), unitIndukKode: sp.get("unit_induk") };
  const { headings, rows } = await eksporRekapTahunan(prisma, tahun, filter, {
    jenisPegawaiKode: sp.get("jenis_pegawai_kode"),
    unitAsalKode: sp.get("unit_asal_kode"),
  }, tambahan);
  return responXlsx(await namaFileRekapTahunan(prisma, tahun, filter, tambahan), headings, rows);
}
