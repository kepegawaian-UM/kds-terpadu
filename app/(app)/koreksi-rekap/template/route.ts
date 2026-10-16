import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buatTemplateKoreksi } from "@/lib/koreksi/templateKoreksi";

export async function GET(): Promise<Response> {
  const sesi = await auth();
  if (!sesi?.user) return new Response("Sesi login sudah habis.", { status: 401 });
  const berkas = await buatTemplateKoreksi(prisma);
  return new Response(new Uint8Array(berkas), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Template_Impor_Koreksi_Absensi.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
