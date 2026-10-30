import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { angkaDalamRentang, buatBerkasKoreksi, laporanKoreksi } from "@/lib/koreksi/laporan";
import { headerUnduhan, MIME_XLSX } from "@/lib/laporan/ekspor";

export const dynamic = "force-dynamic";

/** Excel Koreksi Absensi (hanya yang aktif), mengikuti filter halaman: f_tahun, f_bulan (butuh tahun), f_unit (kode unit induk), f_q (NIP/nama). */
export async function GET(request: Request) {
  if (!(await auth())?.user) return new Response("Tidak diizinkan", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const tahun = angkaDalamRentang(sp.get("f_tahun"), 2000, 2100);
  const lap = await laporanKoreksi(prisma, {
    tahun,
    bulan: tahun ? angkaDalamRentang(sp.get("f_bulan"), 1, 12) : null,
    unitIndukKode: sp.get("f_unit")?.trim() || null,
    cari: sp.get("f_q"),
  });
  const isi = await buatBerkasKoreksi(lap);
  return new Response(new Uint8Array(isi), {
    headers: { "Content-Type": MIME_XLSX, "Content-Disposition": headerUnduhan(lap.namaFile, "xlsx"), "Cache-Control": "no-store" },
  });
}
