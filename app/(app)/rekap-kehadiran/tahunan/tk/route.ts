import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MIME_XLSX, headerUnduhan } from "@/lib/laporan/ekspor";
import { daftarStatusKepegawaian, jenisStatusDari, keaktifanDari } from "@/lib/laporan/filter";
import { periodeTahunBerjalan } from "@/lib/laporan/rekapTahunan";
import { ambangDari, buatBerkasTk, laporanTkTindakLanjut } from "@/lib/laporan/rekapTkTindakLanjut";

export const dynamic = "force-dynamic";

const semuaNilai = (sp: URLSearchParams, kunci: string) => [...sp.getAll(kunci), ...sp.getAll(`${kunci}[]`)];

/** Laporan TK untuk tindak lanjut (Excel): ringkasan per unit induk, matriks pegawai x 12 bulan, dan satu sheet per unit induk. Filter sama dengan Rekap Tahunan + `min_tk`. */
export async function GET(request: Request) {
  if (!(await auth())?.user) return new Response("Tidak diizinkan", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const tahun = periodeTahunBerjalan({ tahun: sp.get("tahun") });
  const daftarStatus = await daftarStatusKepegawaian(prisma);
  const { jenis, status } = jenisStatusDari({ jenis: semuaNilai(sp, "jenis"), status: semuaNilai(sp, "status") }, daftarStatus.map((s) => s.kode));
  const filter = { jenis, status, keaktifan: keaktifanDari(sp.get("keaktifan")) };

  const lap = await laporanTkTindakLanjut(prisma, tahun, filter, ambangDari(sp.get("min_tk")));
  const isi = await buatBerkasTk(lap);
  return new Response(new Uint8Array(isi), {
    headers: { "Content-Type": MIME_XLSX, "Content-Disposition": headerUnduhan(lap.namaFile, "xlsx"), "Cache-Control": "no-store" },
  });
}
