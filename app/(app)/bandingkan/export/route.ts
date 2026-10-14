import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateBandingkanExport } from "@/lib/excel/exportBandingkan";
import { hitungPerbandinganBatch } from "@/lib/standarisasi/bandingkan";

// Route Handler tidak ikut dilindungi layout: wajib cek login sendiri.
export async function GET(req: Request) {
  const sesi = await auth();
  if (!sesi?.user) return NextResponse.json({ error: "Belum login." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const a = searchParams.get("a") ?? "";
  const b = searchParams.get("b") ?? "";
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return NextResponse.json({ error: "Batch A dan B wajib diisi." }, { status: 400 });

  const hasil = await hitungPerbandinganBatch(prisma, Number(a), Number(b));
  if (!hasil) return NextResponse.json({ error: "Batch tidak ditemukan." }, { status: 404 });

  const buffer = await generateBandingkanExport(hasil);
  const namaBerkas = `Bandingkan_${hasil.labelA}_ke_${hasil.labelB}.xlsx`.replace(/\s+/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaBerkas}"`,
    },
  });
}
