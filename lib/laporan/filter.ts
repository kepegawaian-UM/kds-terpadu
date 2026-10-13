import type { PrismaClient } from "@prisma/client";

import type { Param } from "./periode";
import { bandingkanNama } from "./urutNama";

// ---- Jenis + Status -------------------------------------------------------------------------

const JENIS_SAH = ["DSN", "TDK"]; // Akademisi Luar tidak masuk Rekap Kehadiran

const bungkus = (v: Param): string[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Filter dropdown multi pilih "Jenis Pegawai" (hanya Dosen/Tendik) dan "Status Kepegawaian".
 * Nilai di luar pilihan dibuang; hasil kosong = "Semua". Nilai tunggal (tautan lama
 * `?jenis=DSN`) tetap dikenali. Urutan dan duplikat masukan dipertahankan (array_intersect).
 */
export function jenisStatusDari(
  params: { jenis?: Param; status?: Param },
  statusSah: string[]
): { jenis: string[]; status: string[] } {
  return {
    jenis: bungkus(params.jenis).filter((j) => JENIS_SAH.includes(j)),
    status: bungkus(params.status).filter((s) => statusSah.includes(s)),
  };
}

/** Kode status sesuai urutan dropdown KDS2 (urut nama status). */
export async function urutanKodeStatus(db: Pick<PrismaClient, "statusKepegawaian">): Promise<string[]> {
  const semua = await db.statusKepegawaian.findMany({ select: { kode: true, nama: true } });
  return semua.sort((a, b) => bandingkanNama(a.nama, b.nama)).map((s) => s.kode);
}

// ---- Keaktifan ------------------------------------------------------------------------------

export const KEAKTIFAN = { AKTIF: "aktif", NONAKTIF: "nonaktif", SEMUA: "semua" } as const;
export type Keaktifan = (typeof KEAKTIFAN)[keyof typeof KEAKTIFAN];

export const PILIHAN_KEAKTIFAN: Record<Keaktifan, string> = {
  aktif: "Aktif saja",
  nonaktif: "Non-aktif saja",
  semua: "Semua",
};

/** Bawaan "aktif"; nilai tak dikenal (atau daftar) kembali ke "aktif". */
export function keaktifanDari(nilai: Param): Keaktifan {
  return typeof nilai === "string" && nilai in PILIHAN_KEAKTIFAN ? (nilai as Keaktifan) : KEAKTIFAN.AKTIF;
}

/** Label untuk nama file; "Semua" tidak diberi label. */
export function labelFileKeaktifan(mode: Keaktifan): string | null {
  return mode === KEAKTIFAN.AKTIF ? "Aktif" : mode === KEAKTIFAN.NONAKTIF ? "Non-aktif" : null;
}

/**
 * NIP non-aktif pada suatu tahun: punya snapshot nominatif di tahun itu tetapi
 *  (a) TIDAK ada lagi di snapshot bulan terakhir tahun itu (sudah keluar), atau
 *  (b) tercatat di catatan_status_pegawai - hanya untuk tahun terbaru, karena catatan itu tidak
 *      bertanggal. Data tidak dihapus, hanya disaring dari tampilan/ekspor.
 * Port dari App\Support\FilterKeaktifan::nipNonaktif (KDS2).
 */
export async function nipNonaktif(
  db: Pick<PrismaClient, "nominatifBulanan" | "catatanStatusPegawai">,
  tahun: number
): Promise<string[]> {
  const bulanAcuan = (await db.nominatifBulanan.aggregate({ where: { tahun }, _max: { bulan: true } }))._max.bulan;
  if (bulanAcuan === null) return [];

  const semuaNip = new Set(
    (
      await db.nominatifBulanan.findMany({ where: { tahun }, distinct: ["pegawaiNip"], select: { pegawaiNip: true } })
    ).map((r) => r.pegawaiNip)
  );
  const nipAda = new Set(
    (await db.nominatifBulanan.findMany({ where: { tahun, bulan: bulanAcuan }, select: { pegawaiNip: true } })).map(
      (r) => r.pegawaiNip
    )
  );

  const nonaktif = new Set([...semuaNip].filter((n) => !nipAda.has(n)));

  const tahunTerbaru = (await db.nominatifBulanan.aggregate({ _max: { tahun: true } }))._max.tahun ?? 0;
  if (tahun >= tahunTerbaru) {
    for (const c of await db.catatanStatusPegawai.findMany({ select: { nip: true } })) {
      if (semuaNip.has(c.nip)) nonaktif.add(c.nip);
    }
  }
  return [...nonaktif];
}
