import { auth } from "@/lib/auth";
import { buatTemplateNominatif } from "@/lib/upload/templateNominatif";

export async function GET(): Promise<Response> {
  const sesi = await auth();
  if (!sesi?.user) return new Response("Sesi login sudah habis.", { status: 401 });
  const berkas = await buatTemplateNominatif();
  return new Response(new Uint8Array(berkas), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Template_Upload_Nominatif_Bulanan.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
