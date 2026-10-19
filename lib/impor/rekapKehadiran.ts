/**
 * Importer Rekap Kehadiran Bulanan. Port dari App\Services\RekapKehadiranImporter (KDS2); aturannya:
 *  - baris ber-NIP digit murni saja yang diproses (NIP boleh berawalan petik "'" dari Google Sheets);
 *  - NIP tak dikenal / belum punya Nominatif / Akademisi Luar / bulan rekap sebelum TMT = baris GAGAL
 *    (dilewati dan dicatat), sisanya tetap masuk; bulan TMT sendiri diterima;
 *  - peringatan (BULAN di berkas tak cocok, TOTAL != JUMLAH_MASUK_NYATA, NIP ganda) tidak menggagalkan baris;
 *  - NIP ganda dalam satu berkas: baris TERAKHIR dipakai;
 *  - re-upload (nip, bulan, tahun) yang sama MENGGANTI (header lama dipakai ulang, detailnya diganti).
 * Tiga lapis agar mudah dites (docs/08-rancangan-upload-f4.md §2.8):
 *   bacaBarisRekap (xlsx -> baris) -> validasiRekap (murni) -> simpanRekap (menulis, satu transaksi).
 * Paritas: tests/paritas/impor-rekap.test.ts (importer KDS2 asli lewat scripts/oracle/kds2-impor.php).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { type BarisSheet, bacaSheet, type NilaiSel } from "@/lib/upload/bacaSheet";
import { periksaBerkas } from "@/lib/upload/penjagaBerkas";

import { terapkanUntukBulan, type HasilTerapan } from "@/lib/koreksi/layanan";

import { type Anomali, deteksiAnomali, muatKonteksAnomali } from "./anomaliAbsensi";
import { phpLtrim, phpSamaTanpaHuruf, phpTrim, strLimit } from "./phpString";

import { CONFIG_REKAP } from "./konfigRekap";

export { CONFIG_REKAP };
export const JUMLAH_KOLOM_REKAP = Math.max(...CONFIG_REKAP.kolomKomponen.map(([p]) => p));
const JENIS_PEGAWAI_DIIZINKAN = ["DSN", "TDK"];
const AWALAN_PERINGATAN = "[PERINGATAN] ";

export type Catatan = { nomorBaris: number; nipDimaksud: string; alasan: string };

export type SnapshotNominatif = { jenisPegawaiKode: string; tanggalMulaiKerja: Date };

/** Keadaan database yang dibutuhkan validasi (hasil pramuat). */
export type KonteksRekap = {
  komponenAda: ReadonlySet<string>;
  pegawaiAda: ReadonlySet<string>;
  /** snapshot Nominatif terakhir SAMPAI bulan/tahun rekap, per NIP */
  snapshotTerakhir: ReadonlyMap<string, SnapshotNominatif>;
  /** NIP -> id header rekap yang sudah ada untuk bulan/tahun itu */
  headerAda: ReadonlyMap<string, number>;
};

export type HasilValidasiRekap = {
  totalBaris: number;
  berhasil: number;
  gagal: number;
  /** NIP -> komponen -> nilai; urutan sisipan = urutan kemunculan pertama NIP (sama dengan array PHP) */
  valid: Map<string, Record<string, string>>;
  catatan: Catatan[];
  /** NIP -> nomor baris berkas yang dipakai (baris terakhir bila NIP ganda); untuk peringatan anomali */
  nomorBaris: Map<string, number>;
};

/** Selisih nilai sel menjadi string seperti `(string) $nilai` PHP untuk jenis sel yang mungkin muncul. */
function keTeks(v: NilaiSel): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "1" : "";
  if (v instanceof Date) return String(v.getTime() / 86_400_000 + 25569); // PHP membaca tanggal sebagai nomor seri Excel
  return String(v);
}

/** NIP dari sel: angka bulat besar kehilangan presisi di Excel/PHP, jadi bukan digit murni (ditolak). */
function nipDariSel(v: NilaiSel): string {
  if (typeof v === "number" && !Number.isSafeInteger(v)) return "";
  return phpLtrim(phpTrim(keTeks(v)), "'");
}

function formatNilai(v: NilaiSel): string | null {
  if (v === null || v === "") return null;
  return phpTrim(keTeks(v));
}

export function validasiRekap(baris: BarisSheet[], bulan: number, tahun: number, ctx: KonteksRekap): HasilValidasiRekap {
  const { kolomHeaderRows, kolomBulan, kolomNip, kolomKomponen, namaBulan } = CONFIG_REKAP;
  const hasil: HasilValidasiRekap = { totalBaris: 0, berhasil: 0, gagal: 0, valid: new Map(), catatan: [], nomorBaris: new Map() };
  const nomorBarisValid = new Map<string, number>();

  const catat = (nomorBaris: number, nip: string, alasan: string) =>
    hasil.catatan.push({ nomorBaris, nipDimaksud: strLimit(nip, 18), alasan: strLimit(alasan, 255) });

  for (let i = kolomHeaderRows; i < baris.length; i++) {
    const row = baris[i];
    const nomor = i + 1;
    const nip = nipDariSel(row[kolomNip - 1] ?? null);
    if (nip === "" || !/^[0-9]+$/.test(nip)) continue;

    hasil.totalBaris++;
    const peringatan: string[] = [];

    if (!ctx.pegawaiAda.has(nip)) {
      hasil.gagal++;
      catat(nomor, nip, "NIP tidak ditemukan di Nominatif");
      continue;
    }
    const snapshot = ctx.snapshotTerakhir.get(nip);
    if (!snapshot) {
      hasil.gagal++;
      catat(nomor, nip, "Pegawai belum punya data Nominatif sama sekali - TMT tidak bisa divalidasi");
      continue;
    }
    if (!JENIS_PEGAWAI_DIIZINKAN.includes(snapshot.jenisPegawaiKode)) {
      hasil.gagal++;
      catat(nomor, nip, "Akademisi Luar UM tidak masuk Absensi (aturan bisnis)");
      continue;
    }
    const tmtTahun = snapshot.tanggalMulaiKerja.getUTCFullYear();
    const tmtBulan = snapshot.tanggalMulaiKerja.getUTCMonth() + 1;
    if (tahun < tmtTahun || (tahun === tmtTahun && bulan < tmtBulan)) {
      hasil.gagal++;
      catat(nomor, nip, `Bulan/tahun absensi (${bulan}/${tahun}) lebih awal dari TMT pegawai (${String(tmtBulan).padStart(2, "0")}/${String(tmtTahun).padStart(4, "0")})`);
      continue;
    }

    const bulanTeksFile = phpTrim(keTeks(row[kolomBulan - 1] ?? null));
    const bulanTeksSeharusnya = namaBulan[bulan] ?? "";
    if (bulanTeksFile !== "" && !phpSamaTanpaHuruf(bulanTeksFile, bulanTeksSeharusnya)) {
      peringatan.push(`Kolom BULAN di file ('${bulanTeksFile}') tidak cocok dengan pilihan admin ('${bulanTeksSeharusnya}')`);
    }

    const nilai: Record<string, string> = {};
    for (const [posisi, kode] of kolomKomponen) {
      if (!ctx.komponenAda.has(kode)) continue;
      const v = formatNilai(row[posisi - 1] ?? null);
      if (v !== null) nilai[kode] = v;
    }

    if (nilai.TOTAL !== undefined && nilai.JUMLAH_MASUK_NYATA !== undefined && nilai.TOTAL !== nilai.JUMLAH_MASUK_NYATA) {
      peringatan.push(`TOTAL (${nilai.TOTAL}) tidak sama dengan JUMLAH MASUK NYATA (${nilai.JUMLAH_MASUK_NYATA})`);
    }

    if (hasil.valid.has(nip)) {
      peringatan.push(`NIP muncul lebih dari satu kali di file; baris ${nomorBarisValid.get(nip)} diganti oleh baris ini`);
    }
    hasil.valid.set(nip, nilai);
    nomorBarisValid.set(nip, nomor);
    hasil.nomorBaris.set(nip, nomor);

    for (const p of peringatan) catat(nomor, nip, AWALAN_PERINGATAN + p);
    hasil.berhasil++;
  }
  return hasil;
}

type Db = PrismaClient | Prisma.TransactionClient;

const potong = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/** Baca baris sheet rekap dari berkas (sheet pertama, atau sheet bernama yang sudah dinormalkan penjaga). */
export function bacaBarisRekap(berkas: Buffer, namaSheet: string | null): Promise<BarisSheet[]> {
  return bacaSheet(berkas, namaSheet, JUMLAH_KOLOM_REKAP);
}

/** Pramuat keadaan database untuk semua NIP kandidat (sama dengan "Tahap 2" importer KDS2). */
export async function muatKonteksRekap(db: Db, baris: BarisSheet[], bulan: number, tahun: number): Promise<KonteksRekap> {
  const nips = new Set<string>();
  for (let i = CONFIG_REKAP.kolomHeaderRows; i < baris.length; i++) {
    const nip = nipDariSel(baris[i][CONFIG_REKAP.kolomNip - 1] ?? null);
    if (nip !== "" && /^[0-9]+$/.test(nip)) nips.add(nip);
  }
  const daftar = [...nips];

  const komponenAda = new Set((await db.komponenKehadiran.findMany({ select: { kode: true } })).map((k) => k.kode));
  const pegawaiAda = new Set<string>();
  const snapshotTerakhir = new Map<string, SnapshotNominatif>();
  const headerAda = new Map<string, number>();

  for (const bagian of potong(daftar, 1000)) {
    for (const p of await db.pegawai.findMany({ where: { nip: { in: bagian } }, select: { nip: true } })) pegawaiAda.add(p.nip);

    // snapshot Nominatif terakhir SAMPAI bulan/tahun rekap (urutan terbaru dulu; yang pertama per NIP dipakai)
    const snapshot = await db.$queryRaw<{ nip: string; jenisPegawaiKode: string; tanggalMulaiKerja: Date }[]>`
      select distinct on ("pegawaiNip") "pegawaiNip" as nip, "jenisPegawaiKode", "tanggalMulaiKerja"
      from nominatif_bulanan
      where "pegawaiNip" = any(${bagian}::text[]) and (tahun < ${tahun} or (tahun = ${tahun} and bulan <= ${bulan}))
      order by "pegawaiNip", tahun desc, bulan desc`;
    for (const s of snapshot) snapshotTerakhir.set(s.nip, { jenisPegawaiKode: s.jenisPegawaiKode, tanggalMulaiKerja: s.tanggalMulaiKerja });

    for (const h of await db.rekapKehadiranBulanan.findMany({ where: { bulan, tahun, nip: { in: bagian } }, select: { id: true, nip: true } })) {
      headerAda.set(h.nip, h.id);
    }
  }
  return { komponenAda, pegawaiAda, snapshotTerakhir, headerAda };
}

export type OpsiRekap = { bulan: number; tahun: number; namaSheet?: string | null };

export type RingkasanRekap = {
  totalBaris: number;
  berhasil: number;
  gagal: number;
  peringatan: number;
  catatan: Catatan[];
  /** NIP yang datanya bulan itu sudah ada dan akan DIGANTI */
  akanDiganti: number;
  /** NIP yang akan ditambahkan baru */
  akanBaru: number;
  /** teks BULAN yang paling sering muncul di berkas (untuk membantu admin menangkap salah bulan), null bila kosong */
  bulanDiBerkas: string | null;
  /** peringatan anomali bertingkat (tambahan Terpadu; hanya diisi pada tahap Periksa) */
  anomali: Anomali[];
};

function ringkas(h: HasilValidasiRekap, ctx: KonteksRekap, baris: BarisSheet[]): RingkasanRekap {
  let akanDiganti = 0;
  for (const nip of h.valid.keys()) if (ctx.headerAda.has(nip)) akanDiganti++;
  const hitung = new Map<string, number>();
  for (let i = CONFIG_REKAP.kolomHeaderRows; i < baris.length; i++) {
    const t = phpTrim(keTeks(baris[i][CONFIG_REKAP.kolomBulan - 1] ?? null));
    if (t !== "") hitung.set(t, (hitung.get(t) ?? 0) + 1);
  }
  const bulanDiBerkas = [...hitung.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    totalBaris: h.totalBaris,
    berhasil: h.berhasil,
    gagal: h.gagal,
    peringatan: h.catatan.filter((c) => c.alasan.startsWith(AWALAN_PERINGATAN)).length,
    catatan: h.catatan,
    akanDiganti,
    akanBaru: h.valid.size - akanDiganti,
    bulanDiBerkas,
    anomali: [],
  };
}

/** Tahap PERIKSA: membaca dan memvalidasi seluruh berkas tanpa menulis apa pun. */
export async function periksaRekap(prisma: PrismaClient, berkas: Buffer, opsi: OpsiRekap): Promise<RingkasanRekap> {
  const namaSheet = await periksaBerkas(berkas, opsi.namaSheet);
  const baris = await bacaBarisRekap(berkas, namaSheet);
  const ctx = await muatKonteksRekap(prisma, baris, opsi.bulan, opsi.tahun);
  const h = validasiRekap(baris, opsi.bulan, opsi.tahun, ctx);
  const ringkasan = ringkas(h, ctx, baris);
  ringkasan.anomali = deteksiAnomali(h.valid, h.nomorBaris, await muatKonteksAnomali(prisma, [...h.valid.keys()], opsi.bulan, opsi.tahun));
  return ringkasan;
}

export type PenggunaUpload = { id: string | null; nama: string };

/**
 * Tahap SIMPAN: membaca ulang dan memvalidasi di dalam transaksi (agar sama dengan keadaan saat menulis),
 * lalu menulis massal. Semua atau tidak sama sekali. Koreksi Rekap aktif untuk bulan itu diterapkan ulang di
 * transaksi yang SAMA (upload menimpa angka mentah; koreksi manual tidak boleh hilang), seperti controller KDS2.
 * `sesudahTulis` (opsional) dipanggil di transaksi yang sama sebelum selesai (dipakai tes untuk membuktikan atomisitas).
 */
export async function simpanRekap(
  prisma: PrismaClient,
  berkas: Buffer,
  namaFileAsli: string,
  opsi: OpsiRekap,
  pengguna: PenggunaUpload,
  sesudahTulis?: (tx: Prisma.TransactionClient, batchId: number) => Promise<void>,
): Promise<{ batchId: number; ringkasan: RingkasanRekap; koreksi: HasilTerapan }> {
  const namaSheet = await periksaBerkas(berkas, opsi.namaSheet);
  const baris = await bacaBarisRekap(berkas, namaSheet);
  const { bulan, tahun } = opsi;

  return prisma.$transaction(
    async (tx) => {
      const ctx = await muatKonteksRekap(tx, baris, bulan, tahun);
      const h = validasiRekap(baris, bulan, tahun, ctx);

      const batch = await tx.uploadBatch.create({
        data: {
          jenis: "kehadiran_bulanan",
          bulan,
          tahun,
          namaFileAsli,
          status: "Selesai",
          jumlahBarisTotal: h.totalBaris,
          jumlahBerhasil: h.berhasil,
          jumlahGagal: h.gagal,
          diunggahOlehNama: pengguna.nama,
          diunggahOlehId: pengguna.id,
        },
      });

      // Header lama dipakai ulang (detailnya dihapus), yang baru disisipkan sekaligus.
      const idLama: number[] = [];
      const nipBaru: string[] = [];
      for (const nip of h.valid.keys()) {
        const id = ctx.headerAda.get(nip);
        if (id !== undefined) idLama.push(id);
        else nipBaru.push(nip);
      }
      for (const bagian of potong(idLama, 1000)) {
        await tx.rekapKehadiranDetail.deleteMany({ where: { rekapKehadiranBulananId: { in: bagian } } });
        await tx.rekapKehadiranBulanan.updateMany({ where: { id: { in: bagian } }, data: { uploadBatchId: batch.id } });
      }

      const idPerNip = new Map(ctx.headerAda);
      for (const bagian of potong(nipBaru, 500)) {
        const dibuat = await tx.rekapKehadiranBulanan.createManyAndReturn({
          data: bagian.map((nip) => ({ nip, bulan, tahun, uploadBatchId: batch.id })),
          select: { id: true, nip: true },
        });
        for (const d of dibuat) idPerNip.set(d.nip, d.id);
      }

      const detail: { rekapKehadiranBulananId: number; komponenKode: string; nilai: string }[] = [];
      for (const [nip, nilai] of h.valid) {
        const id = idPerNip.get(nip)!;
        for (const [komponenKode, v] of Object.entries(nilai)) detail.push({ rekapKehadiranBulananId: id, komponenKode, nilai: v });
      }
      for (const bagian of potong(detail, 2000)) await tx.rekapKehadiranDetail.createMany({ data: bagian });
      for (const bagian of potong(h.catatan, 1000)) {
        await tx.barisGagalUpload.createMany({
          data: bagian.map((c) => ({ uploadBatchId: batch.id, nomorBaris: c.nomorBaris, nipDimaksud: c.nipDimaksud, alasan: c.alasan })),
        });
      }

      const koreksi = await terapkanUntukBulan(tx, bulan, tahun, pengguna.nama);
      await sesudahTulis?.(tx, batch.id);
      return { batchId: batch.id, ringkasan: ringkas(h, ctx, baris), koreksi };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}
