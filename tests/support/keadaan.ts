/** Pemuat keadaan awal sintetis ke kds_test, padanan muatKeadaan() di scripts/oracle/sqlite-umum.php (urutan sama). */
import type { PrismaClient } from "@prisma/client";

import type { KeadaanImpor } from "./oracleImpor";

export type KoreksiLama = {
  nip: string;
  jenis?: string;
  dari_komponen: string;
  ke_komponen?: string | null;
  tanggal_mulai: string;
  tanggal_selesai?: string | null;
  bulan?: number | null;
  tahun?: number | null;
  jumlah_hari?: number | null;
  diterapkan_batch_id?: number | null;
  dibatalkan_pada?: string | null;
  alasan?: string;
  sumber?: string | null;
};

export type KeadaanLengkap = KeadaanImpor & { koreksi?: KoreksiLama[] };

export async function muatKeadaan(prisma: PrismaClient, k: KeadaanLengkap): Promise<void> {
  const [s, u] = await Promise.all([prisma.statusKepegawaian.findFirstOrThrow({ where: { kode: "PNS" } }), prisma.unitAsal.findFirstOrThrow({ orderBy: { kode: "asc" } })]);
  const batchNominatif = await prisma.uploadBatch.create({ data: { jenis: "nominatif_bulanan", namaFileAsli: "n.xlsx", diunggahOlehNama: "t" } });
  const nips = new Set<string>([...(k.pegawai ?? []), ...(k.nominatif ?? []).map((x) => x.nip), ...(k.rekap ?? []).map((x) => x.nip), ...(k.koreksi ?? []).map((x) => x.nip)]);
  await prisma.pegawai.createMany({ data: [...nips].map((nip) => ({ nip })) });
  for (const x of k.nominatif ?? []) {
    await prisma.nominatifBulanan.create({
      data: {
        pegawaiNip: x.nip, bulan: x.bulan, tahun: x.tahun, nama: `Pegawai ${x.nip}`, jenisKelamin: "L", jenisPegawaiKode: x.jenis,
        statusKepegawaianKode: s.kode, unitAsalKode: u.kode, tanggalMulaiKerja: new Date(`${x.tmt}T00:00:00.000Z`), uploadBatchId: batchNominatif.id,
      },
    });
  }
  if ((k.rekap ?? []).length > 0) {
    const lama = await prisma.uploadBatch.create({ data: { jenis: "kehadiran_bulanan", namaFileAsli: "lama.xlsx", diunggahOlehNama: "t" } });
    for (const r of k.rekap!) {
      const h = await prisma.rekapKehadiranBulanan.create({ data: { nip: r.nip, bulan: r.bulan, tahun: r.tahun, uploadBatchId: lama.id } });
      await prisma.rekapKehadiranDetail.createMany({ data: Object.entries(r.komponen).map(([komponenKode, nilai]) => ({ rekapKehadiranBulananId: h.id, komponenKode, nilai })) });
    }
  }
  const tgl = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
  for (const kr of k.koreksi ?? []) {
    await prisma.koreksiRekap.create({
      data: {
        nip: kr.nip, jenis: kr.jenis ?? "periode", dariKomponen: kr.dari_komponen, keKomponen: kr.ke_komponen ?? null,
        tanggalMulai: tgl(kr.tanggal_mulai)!, tanggalSelesai: tgl(kr.tanggal_selesai), bulan: kr.bulan ?? null, tahun: kr.tahun ?? null,
        jumlahHari: kr.jumlah_hari ?? null, diterapkanBatchId: kr.diterapkan_batch_id ?? null, alasan: kr.alasan ?? "lama", sumber: kr.sumber ?? null,
        dibuatOleh: "lama", dibuatPada: new Date("2026-01-01T00:00:00+07:00"), dibatalkanPada: kr.dibatalkan_pada ? new Date(kr.dibatalkan_pada) : null,
      },
    });
  }
}
