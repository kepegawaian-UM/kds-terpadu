import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveBulanTahun } from "@/lib/laporan/periode";
import { eksporStatistikDosen } from "@/lib/laporan/statistikEkspor";
import { responXlsx } from "@/lib/laporan/xlsx";

export const dynamic = "force-dynamic";

/** Ekspor Excel Statistik Dosen untuk bulan/tahun terpilih (isi sama dengan tabel di halaman). */
export async function GET(request: Request) {
  if (!(await auth())?.user) return new Response("Tidak diizinkan", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const [bulan, tahun] = await resolveBulanTahun(prisma, { bulan: sp.get("bulan"), tahun: sp.get("tahun") });
  const { namaFile, headings, rows } = await eksporStatistikDosen(prisma, bulan, tahun);
  return responXlsx(namaFile, headings, rows);
}
