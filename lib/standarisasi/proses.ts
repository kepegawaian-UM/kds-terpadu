/**
 * Standarisasi file mentah SIMPEGA (alur KDS1) di dalam KDS Terpadu. Port dari lib/services/importBatch.ts (KDS1):
 *   berkas mentah (85+ kolom) -> parse -> klasifikasi deterministik per baris (lib/domain/classify.ts, salinan KDS1) ->
 *   baris yang pasti masuk snapshot Nominatif bulan itu; sisanya masuk antrean Review (baris_bermasalah).
 * Beda dari KDS1: keluarannya LANGSUNG menjadi snapshot Nominatif (tanpa unduh-unggah ke KDS2), tahap Periksa (tanpa menulis)
 * mendahului Simpan, id batch berupa angka, dan NIP ganda dalam satu berkas ditolak dengan pesan jelas (KDS1 gagal dengan
 * galat basis data). Seperti KDS1: upload bulanan MENGGANTI seluruh snapshot bulan itu (hapus lalu isi ulang).
 * Paritas: tests/paritas/standarisasi.test.ts (importBatch KDS1 asli lewat scripts/oracle/kds1-oracle.ts).
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { classifyRow, pilihAlasanUtama } from "@/lib/domain/classify";
import type { ResolvedNominatif } from "@/lib/domain/classify";
import { isNipPlaceholderTidakStabil, JENIS_FIELD_IDENTITAS_EKSTERNAL, kunciIdentitasEksternal } from "@/lib/domain/identitasEksternal";
import { loadKamusMap, loadMasterCache, loadNipDikecualikanPermanen, loadNipTerdaftar } from "@/lib/domain/masterCache";
import { parseRawNominatif } from "@/lib/excel/parseRawNominatif";
import { ColumnMappingError, type RawNominatifRow } from "@/lib/excel/types";
import { KesalahanUpload } from "@/lib/upload/konstanta";
import { periksaBerkas } from "@/lib/upload/penjagaBerkas";

type Db = PrismaClient | Prisma.TransactionClient;

/** Jenis batch yang menjadi dasar snapshot Nominatif sebuah bulan; berkas baru menandainya "Dibatalkan" (tidak dihapus: jejak audit). */
export const JENIS_BATCH_SNAPSHOT = ["standarisasi_nominatif", "nominatif_bulanan", "tambah_pegawai_manual"];

type BarisNominatif = Omit<ResolvedNominatif, "jabatanTambahan"> & { pegawaiNip: string };
type SlotJabatan = ResolvedNominatif["jabatanTambahan"][number] & { indeksNominatif: number };
export type BarisMasalah = { nip: string; dataMentah: Prisma.InputJsonValue; alasanUtama: string; detailAlasan: string };

export type HasilKlasifikasi = {
  jumlahTotal: number;
  /** baris yang di-skip total karena NIP ditandai "jangan tampilkan lagi" (kamus PegawaiDikecualikanPermanen) */
  jumlahDikecualikan: number;
  nominatif: BarisNominatif[];
  jabatan: SlotJabatan[];
  bermasalah: BarisMasalah[];
  petaKolom: Record<string, number | null>;
};

/** Hanya field mentah yang relevan ke skema Nominatif disimpan sebagai dataMentah (NIK/KK/rekening/alamat tidak pernah masuk RawNominatifRow). */
function keDataMentah(row: RawNominatifRow): Prisma.InputJsonValue {
  return { ...row, tanggalLahir: row.tanggalLahir?.toISOString() ?? null, tanggalMasuk: row.tanggalMasuk?.toISOString() ?? null } as unknown as Prisma.InputJsonValue;
}

/** Membaca dan mengklasifikasi seluruh berkas di memori (tanpa menulis). */
export async function klasifikasiBerkas(db: Db, berkas: Buffer, bulan: number, tahun: number): Promise<HasilKlasifikasi> {
  let parsed;
  try {
    parsed = await parseRawNominatif(berkas);
  } catch (e) {
    if (e instanceof ColumnMappingError) throw new KesalahanUpload(e.message);
    throw e;
  }
  const [master, kamus, nipTerdaftar, nipDikecualikan] = await Promise.all([
    loadMasterCache(db), loadKamusMap(db), loadNipTerdaftar(db), loadNipDikecualikanPermanen(db),
  ]);

  const rows = parsed.rows.filter((r) => !nipDikecualikan.has(r.nip));
  const hasil: HasilKlasifikasi = {
    jumlahTotal: rows.length, jumlahDikecualikan: parsed.rows.length - rows.length, nominatif: [], jabatan: [], bermasalah: [], petaKolom: parsed.petaKolomTerdeteksi,
  };

  function proses(rowAsli: RawNominatifRow, pegawaiNip: string, hasilKlasifikasi: ReturnType<typeof classifyRow>) {
    if (hasilKlasifikasi.ok) {
      const { jabatanTambahan, ...data } = hasilKlasifikasi.data;
      const indeks = hasil.nominatif.length;
      hasil.nominatif.push({ pegawaiNip, ...data });
      for (const slot of jabatanTambahan) hasil.jabatan.push({ indeksNominatif: indeks, ...slot });
    } else {
      hasil.bermasalah.push({
        nip: pegawaiNip, dataMentah: keDataMentah(rowAsli), alasanUtama: pilihAlasanUtama(hasilKlasifikasi.issues), detailAlasan: hasilKlasifikasi.issues.map((i) => i.detail).join(" | "),
      });
    }
  }

  for (const row of rows) {
    // NIP placeholder SIMPEGA (Akademisi Luar tanpa NIP asli) berubah tiap ekstraksi: identitas dipecahkan SEBELUM classifyRow
    // (beberapa kunci kamus berbasis NIP); nama yang belum pernah dikenali tidak diklasifikasi otomatis, selalu ke Review.
    if (isNipPlaceholderTidakStabil(row.nip, bulan, tahun)) {
      const nama = row.namaDenganGelar || row.namaTanpaGelar;
      const nipKanonik = kamus.get(`${JENIS_FIELD_IDENTITAS_EKSTERNAL}::${kunciIdentitasEksternal(nama)}`);
      if (nipKanonik) proses(row, nipKanonik, classifyRow({ ...row, nip: nipKanonik }, master, kamus, nipTerdaftar));
      else {
        hasil.bermasalah.push({
          nip: row.nip, dataMentah: keDataMentah(row), alasanUtama: "IdentitasEksternalPerluVerifikasi",
          detailAlasan: `NIP placeholder tidak stabil (dibuat SIMPEGA sendiri, bukan NIP asli) untuk "${nama}" - nama ini belum pernah dikenali sebelumnya, perlu verifikasi manual.`,
        });
      }
      continue;
    }
    proses(row, row.nip, classifyRow(row, master, kamus, nipTerdaftar));
  }

  // KDS1 gagal dengan galat basis data (pelanggaran unik) bila satu NIP muncul dua kali di baris yang berhasil: tolak dengan pesan jelas.
  const lihat = new Set<string>();
  const ganda = new Set<string>();
  for (const n of hasil.nominatif) (lihat.has(n.pegawaiNip) ? ganda : lihat).add(n.pegawaiNip);
  if (ganda.size > 0) {
    throw new KesalahanUpload(`NIP muncul lebih dari satu kali di berkas: ${[...ganda].slice(0, 5).join(", ")}${ganda.size > 5 ? ", ..." : ""}. Perbaiki berkasnya (satu baris per NIP) lalu unggah ulang.`);
  }
  return hasil;
}

export type RingkasanStandarisasi = {
  totalBaris: number;
  berhasil: number;
  perluReview: number;
  dikecualikan: number;
  /** jumlah per alasan review, urut terbanyak */
  perAlasan: { alasan: string; jumlah: number }[];
  /** baris Nominatif yang sudah ada pada bulan itu dan akan DIHAPUS lalu digantikan */
  akanMenimpa: number;
  /** pegawai pada snapshot sebelumnya yang tidak ada di hasil (akan tampil non-aktif) */
  tidakAdaDiBerkas: number;
  pembanding: { bulan: number; tahun: number; jumlah: number } | null;
  contohBermasalah: { nip: string; alasanUtama: string; detailAlasan: string }[];
};

async function ringkas(db: Db, h: HasilKlasifikasi, bulan: number, tahun: number): Promise<RingkasanStandarisasi> {
  const hitung = new Map<string, number>();
  for (const b of h.bermasalah) hitung.set(b.alasanUtama, (hitung.get(b.alasanUtama) ?? 0) + 1);
  const sebelumnya = await db.nominatifBulanan.findFirst({
    where: { OR: [{ tahun: { lt: tahun } }, { tahun, bulan: { lt: bulan } }] }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }], select: { bulan: true, tahun: true },
  });
  let pembanding: RingkasanStandarisasi["pembanding"] = null;
  let hilang = 0;
  if (sebelumnya) {
    const nipSebelumnya = (await db.nominatifBulanan.findMany({ where: { bulan: sebelumnya.bulan, tahun: sebelumnya.tahun }, select: { pegawaiNip: true } })).map((x) => x.pegawaiNip);
    const adaSekarang = new Set([...h.nominatif.map((n) => n.pegawaiNip), ...h.bermasalah.map((b) => b.nip)]);
    hilang = nipSebelumnya.filter((n) => !adaSekarang.has(n)).length;
    pembanding = { bulan: sebelumnya.bulan, tahun: sebelumnya.tahun, jumlah: nipSebelumnya.length };
  }
  return {
    totalBaris: h.jumlahTotal, berhasil: h.nominatif.length, perluReview: h.bermasalah.length, dikecualikan: h.jumlahDikecualikan,
    perAlasan: [...hitung.entries()].map(([alasan, jumlah]) => ({ alasan, jumlah })).sort((a, b) => b.jumlah - a.jumlah),
    akanMenimpa: await db.nominatifBulanan.count({ where: { bulan, tahun } }), tidakAdaDiBerkas: hilang, pembanding,
    contohBermasalah: h.bermasalah.slice(0, 20).map((b) => ({ nip: b.nip, alasanUtama: b.alasanUtama, detailAlasan: b.detailAlasan })),
  };
}

export type OpsiStandarisasi = { bulan: number; tahun: number };

/** Tahap PERIKSA: membaca dan mengklasifikasi tanpa menulis apa pun. */
export async function periksaStandarisasi(prisma: PrismaClient, berkas: Buffer, opsi: OpsiStandarisasi): Promise<RingkasanStandarisasi> {
  await periksaBerkas(berkas, null);
  return ringkas(prisma, await klasifikasiBerkas(prisma, berkas, opsi.bulan, opsi.tahun), opsi.bulan, opsi.tahun);
}

const potong = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/** Tahap SIMPAN: klasifikasi ulang di dalam transaksi lalu mengganti snapshot Nominatif bulan itu (semua atau tidak sama sekali). */
export async function simpanStandarisasi(
  prisma: PrismaClient,
  berkas: Buffer,
  namaFileAsli: string,
  opsi: OpsiStandarisasi,
  pengguna: { id: string | null; nama: string },
): Promise<{ batchId: number; ringkasan: RingkasanStandarisasi }> {
  await periksaBerkas(berkas, null);
  const { bulan, tahun } = opsi;

  return prisma.$transaction(
    async (tx) => {
      const h = await klasifikasiBerkas(tx, berkas, bulan, tahun);
      const ringkasan = await ringkas(tx, h, bulan, tahun);
      const status = h.bermasalah.length === 0 ? "Selesai" : "MenungguReview";

      const batch = await tx.uploadBatch.create({
        data: {
          jenis: "standarisasi_nominatif", bulan, tahun, namaFileAsli, status, jumlahBarisTotal: h.jumlahTotal, jumlahBerhasil: h.nominatif.length,
          jumlahPerluReview: h.bermasalah.length, jumlahGagal: 0, petaKolomTerdeteksi: h.petaKolom as Prisma.InputJsonValue, diunggahOlehNama: pengguna.nama, diunggahOlehId: pengguna.id,
        },
      });

      // Upload bulanan mencerminkan SELURUH pegawai aktif bulan itu: snapshot lama bulan itu diganti total (jabatan tambahan ikut terhapus).
      await tx.nominatifBulanan.deleteMany({ where: { bulan, tahun } });
      // Batch lama untuk bulan yang sama kehilangan datanya: tandai "Dibatalkan" (baris batch dibiarkan sebagai jejak audit).
      await tx.uploadBatch.updateMany({ where: { bulan, tahun, id: { not: batch.id }, jenis: { in: JENIS_BATCH_SNAPSHOT } }, data: { status: "Dibatalkan" } });

      if (h.nominatif.length > 0) {
        await tx.pegawai.createMany({ data: [...new Set(h.nominatif.map((n) => n.pegawaiNip))].map((nip) => ({ nip })), skipDuplicates: true });
        const idPerIndeks: number[] = [];
        for (const bagian of potong(h.nominatif, 1000)) {
          const dibuat = await tx.nominatifBulanan.createManyAndReturn({
            data: bagian.map((r) => ({ ...r, bulan, tahun, uploadBatchId: batch.id })), select: { id: true, pegawaiNip: true },
          });
          const idPerNip = new Map(dibuat.map((d) => [d.pegawaiNip, d.id]));
          for (const r of bagian) idPerIndeks.push(idPerNip.get(r.pegawaiNip)!);
        }
        for (const bagian of potong(h.jabatan, 1000)) {
          await tx.nominatifBulananJabatanTambahan.createMany({
            data: bagian.map(({ indeksNominatif, ...slot }) => ({ nominatifBulananId: idPerIndeks[indeksNominatif], ...slot })),
          });
        }
      }
      for (const bagian of potong(h.bermasalah, 1000)) await tx.barisBermasalah.createMany({ data: bagian.map((r) => ({ ...r, uploadBatchId: batch.id })) });
      return { batchId: batch.id, ringkasan };
    },
    { timeout: 5 * 60 * 1000, maxWait: 20_000 },
  );
}
