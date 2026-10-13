import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { eksporNominatif, namaFileNominatif } from "@/lib/laporan/nominatif";
import { resolveBulanTahun } from "@/lib/laporan/periode";
import { responXlsx } from "@/lib/laporan/xlsx";

export const dynamic = "force-dynamic";

/** Ekspor Excel Nominatif sebulan; filter jenis_pegawai_kode / unit_asal_kode opsional (seperti KDS2). */
export async function GET(request: Request) {
  if (!(await auth())?.user) return new Response("Tidak diizinkan", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const [bulan, tahun] = await resolveBulanTahun(prisma, { bulan: sp.get("bulan"), tahun: sp.get("tahun") });
  const { headings, rows } = await eksporNominatif(prisma, bulan, tahun, {
    jenisPegawaiKode: sp.get("jenis_pegawai_kode"),
    unitAsalKode: sp.get("unit_asal_kode"),
  });
  return responXlsx(namaFileNominatif(bulan, tahun), headings, rows);
}
