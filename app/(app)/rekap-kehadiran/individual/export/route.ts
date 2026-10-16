import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buatNamaFile } from "@/lib/laporan/namaFile";
import { bulanTahunSekarang, keInt } from "@/lib/laporan/periode";
import { barisEksporIndividual, bangunRekapIndividual } from "@/lib/laporan/rekapIndividual";
import { responXlsxBanyakSheet } from "@/lib/laporan/xlsx";

export const dynamic = "force-dynamic";

/** Ekspor Excel satu pegawai: isinya sama dengan dokumen cetak (RekapIndividualExport KDS2). */
export async function GET(request: Request) {
  if (!(await auth())?.user) return new Response("Tidak diizinkan", { status: 401 });
  const sp = new URL(request.url).searchParams;
  const [, tahunIni] = bulanTahunSekarang(new Date());
  const t = sp.get("tahun") === null ? tahunIni : keInt(sp.get("tahun"));
  const tahun = t >= 2020 && t <= 2100 ? t : tahunIni;
  const nip = sp.get("nip") ?? "";
  const laporan = /^\d{1,20}$/.test(nip) ? await bangunRekapIndividual(prisma, nip, tahun) : null;
  if (!laporan) return new Response("Data tidak ditemukan", { status: 404 });
  return responXlsxBanyakSheet(buatNamaFile("Absensi Pegawai", [], [], `${laporan.identitas.nama} ${laporan.tahun}`, []), [{ judul: "Absensi Pegawai", baris: barisEksporIndividual(laporan) }]);
}
