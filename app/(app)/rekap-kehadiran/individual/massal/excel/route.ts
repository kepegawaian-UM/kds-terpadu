import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bacaParamMassal, barisEksporIndividual, dariUrlSearchParams, judulSheetMassal, laporanTerpilih, namaFileMassal } from "@/lib/laporan/rekapIndividual";
import { responXlsxBanyakSheet } from "@/lib/laporan/xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Ekspor Excel massal: satu workbook, satu sheet per pegawai (RekapIndividualMassalExport KDS2). */
export async function GET(request: Request) {
  if (!(await auth())?.user) return new Response("Tidak diizinkan", { status: 401 });
  const p = await bacaParamMassal(prisma, dariUrlSearchParams(new URL(request.url).searchParams));
  const terpilih = await laporanTerpilih(prisma, p.nip, p.tahun);
  if ("galat" in terpilih) return new Response(terpilih.galat, { status: 422 });
  const judul = judulSheetMassal(terpilih.daftar);
  return responXlsxBanyakSheet(await namaFileMassal(prisma, p), terpilih.daftar.map((l, i) => ({ judul: judul[i], baris: barisEksporIndividual(l) })));
}
