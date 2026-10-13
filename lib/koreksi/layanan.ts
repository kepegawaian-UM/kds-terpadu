/**
 * Koreksi Rekap: menerapkan koreksi manual (tabel koreksi_rekap) ke rekap_kehadiran_detail. Port dari
 * App\Services\KoreksiRekapService + KoreksiRekapController (KDS2). Paritas: tests/paritas/koreksi-rekap.test.ts.
 *
 * Jenis "periode": bulan yang SELURUHNYA masuk periode -> seluruh nilai komponen asal dipindah ke komponen tujuan
 * (atau dihapus bila tujuan kosong). Bulan yang hanya SEBAGIAN masuk tidak disentuh (dilaporkan "sebagian").
 * Idempotent karena yang dipindah selalu "semua yang masih ada".
 * Jenis "angka": pindahkan N hari pada SATU bulan. Tidak idempotent dengan sendirinya, jadi hanya diterapkan bila bulan
 * itu belum pernah diterapkan atau sudah ditimpa upload baru (diterapkanBatchId != uploadBatchId header). Untuk bulan yang
 * punya koreksi angka aktif, koreksi periode TIDAK diterapkan (angka manual menang).
 * Setiap perubahan tercatat di audit_log: baris pembuatan koreksi per kolom, dan perubahan nilai detail per komponen.
 */
import type { KoreksiRekap, Prisma, PrismaClient } from "@prisma/client";

import { cakupanKoreksi } from "@/lib/domain/koreksi";
import { CONFIG_REKAP } from "@/lib/impor/rekapKehadiran";

export type Db = PrismaClient | Prisma.TransactionClient;

export const PENUH = "penuh";
export const SEBAGIAN = "sebagian";
export const DI_LUAR = "di_luar";
export const DIGANTIKAN = "digantikan";
export const ANGKA = "angka";

export type DataKoreksi = {
  nip: string;
  jenis: "periode" | "angka";
  dariKomponen: string;
  keKomponen: string | null;
  tanggalMulai: Date;
  tanggalSelesai: Date | null;
  bulan: number | null;
  tahun: number | null;
  jumlahHari: number | null;
  alasan: string;
  sumber: string | null;
};

/** Masukan yang sudah tervalidasi dari formulir (tanggal "YYYY-MM-DD"). */
export type InputKoreksi = {
  jenis: "periode" | "angka";
  nip: string;
  dariKomponen: string;
  keKomponen?: string | null;
  tanggalMulai?: string | null;
  tanggalSelesai?: string | null;
  bulan?: number | null;
  tahun?: number | null;
  jumlahHari?: number | null;
  alasan: string;
  sumber?: string | null;
};

export type HasilTerapan = {
  barisDiubah: number;
  hariDipindah: number;
  sebagian: { nip: string; bulan: number; tahun: number }[];
  kurang: { nip: string; bulan: number; tahun: number; diminta: number; tersedia: number }[];
};

export type BarisPratinjau = {
  bulan: number;
  tahun: number;
  cakupan: string;
  dariSekarang: number;
  keSekarang: number | null;
  dipindah: number;
  dariHasil: number;
  keHasil: number | null;
  kurang: boolean;
};

type HeaderRingkas = { id: number; nip: string; bulan: number; tahun: number; uploadBatchId: number };

const hasilKosong = (): HasilTerapan => ({ barisDiubah: 0, hariDipindah: 0, sebagian: [], kurang: [] });

/** (int) PHP atas string angka: bilangan bulat di awal, selain itu 0. */
const phpInt = (s: string | null | undefined): number => {
  const m = /^\s*([+-]?\d+)/.exec(s ?? "");
  return m ? Number(m[1]) : 0;
};

const tanggalDariTeks = (s: string) => new Date(`${s}T00:00:00.000Z`);
const akhirBulan = (tahun: number, bulan: number) => new Date(Date.UTC(tahun, bulan, 0));

const dua = (n: number) => String(n).padStart(2, "0");
const teksTanggal = (d: Date) => `${String(d.getUTCFullYear()).padStart(4, "0")}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}`;

/** Waktu dinding WIB "YYYY-MM-DD HH:mm:ss", seperti `now()` KDS2 yang di-stringify. */
function waktuWib(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

async function dalamTransaksi<T>(db: Db, f: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return (db as PrismaClient).$transaction(f, { timeout: 120_000, maxWait: 20_000 });
  return f(db as Prisma.TransactionClient);
}

/** kode => nama untuk komponen angka non-"Rekap", urut menurut kolom rekap. */
export async function komponenTersedia(db: Db): Promise<{ kode: string; nama: string }[]> {
  const semua = await db.komponenKehadiran.findMany({ where: { kategori: { not: "Rekap" }, tipeNilai: "integer" } });
  const peta = new Map(semua.map((k) => [k.kode, k.nama]));
  return CONFIG_REKAP.kolomKomponen.filter(([, kode]) => peta.has(kode)).map(([, kode]) => ({ kode, nama: peta.get(kode)! }));
}

/** Padanan KoreksiRekapController::buatDariRequest: koreksi angka tidak punya rentang sendiri, diisi batas bulannya. */
export function buatDataKoreksi(i: InputKoreksi): DataKoreksi {
  const angka = i.jenis === "angka";
  const awal = angka ? new Date(Date.UTC(i.tahun!, i.bulan! - 1, 1)) : null;
  return {
    nip: i.nip,
    jenis: i.jenis,
    dariKomponen: i.dariKomponen,
    keKomponen: i.keKomponen || null,
    tanggalMulai: angka ? awal! : tanggalDariTeks(i.tanggalMulai!),
    tanggalSelesai: angka ? akhirBulan(i.tahun!, i.bulan!) : i.tanggalSelesai ? tanggalDariTeks(i.tanggalSelesai) : null,
    bulan: angka ? i.bulan! : null,
    tahun: angka ? i.tahun! : null,
    jumlahHari: angka ? i.jumlahHari! : null,
    alasan: i.alasan,
    sumber: i.sumber ? i.sumber : null,
  };
}

const kunci = (nip: string, bulan: number | string, tahun: number | string) => `${nip}|${bulan}|${tahun}`;

const KONDISI_AKTIF = { dibatalkanPada: null } as const;

async function kunciAngkaAktif(db: Db, nips: string[]): Promise<Set<string>> {
  const k = await db.koreksiRekap.findMany({ where: { ...KONDISI_AKTIF, jenis: "angka", nip: { in: nips } }, select: { nip: true, bulan: true, tahun: true } });
  return new Set(k.map((x) => kunci(x.nip, x.bulan!, x.tahun!)));
}

async function catat(db: Db, idDetail: number, field: string, lama: string | null, baru: string | null, aksi: "UPDATE" | "INSERT", koreksiId: number, pengguna: string) {
  await db.auditLog.create({
    data: {
      namaTabel: "rekap_kehadiran_detail", idRecord: String(idDetail), fieldDiubah: field, nilaiLama: lama, nilaiBaru: baru,
      diubahOleh: `${pengguna} (koreksi #${koreksiId})`, diubahPada: new Date(), aksi,
    },
  });
}

async function pindahkan(db: Db, k: KoreksiRekap, headerId: number, pengguna: string, maks: number | null = null): Promise<number> {
  const kode = [k.dariKomponen, k.keKomponen].filter((x): x is string => !!x);
  const baris = new Map((await db.rekapKehadiranDetail.findMany({ where: { rekapKehadiranBulananId: headerId, komponenKode: { in: kode } }, orderBy: { id: "asc" } })).map((d) => [d.komponenKode, d]));

  const dari = baris.get(k.dariKomponen);
  const tersedia = phpInt(dari?.nilai);
  const jumlah = maks === null ? tersedia : Math.min(tersedia, maks);
  if (!dari || jumlah <= 0) return 0;

  const sisa = String(tersedia - jumlah);
  await db.rekapKehadiranDetail.update({ where: { id: dari.id }, data: { nilai: sisa } });
  await catat(db, dari.id, `nilai:${k.dariKomponen}`, dari.nilai, sisa, "UPDATE", k.id, pengguna);

  if (k.keKomponen) {
    const ke = baris.get(k.keKomponen);
    if (ke) {
      const baru = String(phpInt(ke.nilai) + jumlah);
      await db.rekapKehadiranDetail.update({ where: { id: ke.id }, data: { nilai: baru } });
      await catat(db, ke.id, `nilai:${k.keKomponen}`, ke.nilai, baru, "UPDATE", k.id, pengguna);
    } else {
      const dibuat = await db.rekapKehadiranDetail.create({ data: { rekapKehadiranBulananId: headerId, komponenKode: k.keKomponen, nilai: String(jumlah) } });
      await catat(db, dibuat.id, `nilai:${k.keKomponen}`, null, String(jumlah), "INSERT", k.id, pengguna);
    }
  }
  return jumlah;
}

async function terapkanAngka(db: Db, k: KoreksiRekap, h: HeaderRingkas, hasil: HasilTerapan, pengguna: string): Promise<void> {
  if (h.bulan !== k.bulan || h.tahun !== k.tahun) return;
  if (k.diterapkanBatchId !== null && k.diterapkanBatchId === h.uploadBatchId) return;

  const maks = k.jumlahHari ?? 0;
  const dipindah = await pindahkan(db, k, h.id, pengguna, maks);
  if (dipindah > 0) {
    hasil.barisDiubah++;
    hasil.hariDipindah += dipindah;
  }
  if (dipindah < maks) hasil.kurang.push({ nip: k.nip, bulan: h.bulan, tahun: h.tahun, diminta: maks, tersedia: dipindah });

  await db.koreksiRekap.update({ where: { id: k.id }, data: { diterapkanBatchId: h.uploadBatchId } });
  k.diterapkanBatchId = h.uploadBatchId;
}

async function terapkanKeHeaders(db: Db, pasangan: [KoreksiRekap, HeaderRingkas[]][], pengguna: string): Promise<HasilTerapan> {
  const hasil = hasilKosong();
  const kunciAngka = await kunciAngkaAktif(db, [...new Set(pasangan.map(([k]) => k.nip))]);

  await dalamTransaksi(db, async (tx) => {
    for (const [k, headers] of pasangan) {
      for (const h of headers) {
        if (k.jenis === "angka") {
          await terapkanAngka(tx, k, h, hasil, pengguna);
          continue;
        }
        if (kunciAngka.has(kunci(k.nip, h.bulan, h.tahun))) continue;

        const cakupan = cakupanKoreksi(k, h.bulan, h.tahun);
        if (cakupan === SEBAGIAN) {
          hasil.sebagian.push({ nip: k.nip, bulan: h.bulan, tahun: h.tahun });
          continue;
        }
        if (cakupan !== PENUH) continue;

        const dipindah = await pindahkan(tx, k, h.id, pengguna);
        if (dipindah > 0) {
          hasil.barisDiubah++;
          hasil.hariDipindah += dipindah;
        }
      }
    }
  });
  return hasil;
}

const pilihHeader = { id: true, nip: true, bulan: true, tahun: true, uploadBatchId: true } as const;

/** Terapkan satu koreksi ke semua bulan rekap yang sudah ada. */
export async function terapkanKoreksi(db: Db, k: KoreksiRekap, pengguna: string): Promise<HasilTerapan> {
  const headers = await db.rekapKehadiranBulanan.findMany({
    where: { nip: k.nip, ...(k.jenis === "angka" ? { bulan: k.bulan!, tahun: k.tahun! } : {}) },
    select: pilihHeader,
    orderBy: { id: "asc" },
  });
  return terapkanKeHeaders(db, [[k, headers]], pengguna);
}

/** Terapkan semua koreksi aktif ke satu bulan (dipanggil setelah upload Rekap). */
export async function terapkanUntukBulan(db: Db, bulan: number, tahun: number, pengguna: string): Promise<HasilTerapan> {
  const koreksi = await db.koreksiRekap.findMany({
    where: { ...KONDISI_AKTIF, OR: [{ jenis: "periode" }, { jenis: "angka", bulan, tahun }] },
    orderBy: { id: "asc" },
  });
  if (koreksi.length === 0) return hasilKosong();

  const headers = await db.rekapKehadiranBulanan.findMany({
    where: { bulan, tahun, nip: { in: [...new Set(koreksi.map((k) => k.nip))] } },
    select: pilihHeader,
    orderBy: { id: "asc" },
  });
  const perNip = new Map<string, HeaderRingkas[]>();
  for (const h of headers) perNip.set(h.nip, [...(perNip.get(h.nip) ?? []), h]);

  return terapkanKeHeaders(db, koreksi.map((k): [KoreksiRekap, HeaderRingkas[]] => [k, perNip.get(k.nip) ?? []]), pengguna);
}

/** Menyimpan koreksi baru (dengan jejak audit pembuatan per kolom) lalu langsung menerapkannya, dalam satu transaksi. */
export async function simpanDanTerapkanKoreksi(db: Db, data: DataKoreksi, pengguna: string): Promise<{ koreksi: KoreksiRekap; hasil: HasilTerapan }> {
  return dalamTransaksi(db, async (tx) => {
    const sekarang = new Date();
    const koreksi = await tx.koreksiRekap.create({
      data: {
        nip: data.nip, jenis: data.jenis, dariKomponen: data.dariKomponen, keKomponen: data.keKomponen,
        tanggalMulai: data.tanggalMulai, tanggalSelesai: data.tanggalSelesai, bulan: data.bulan, tahun: data.tahun,
        jumlahHari: data.jumlahHari, alasan: data.alasan, sumber: data.sumber, dibuatOleh: pengguna, dibuatPada: sekarang,
      },
    });
    // Satu baris audit per kolom berisi, urutan kolom sama dengan atribut model KDS2; tanggal berformat "Y-m-d H:i:s".
    const kolom: [string, string | null][] = [
      ["nip", data.nip], ["jenis", data.jenis], ["dari_komponen", data.dariKomponen], ["ke_komponen", data.keKomponen],
      ["tanggal_mulai", `${teksTanggal(data.tanggalMulai)} 00:00:00`],
      ["tanggal_selesai", data.tanggalSelesai ? `${teksTanggal(data.tanggalSelesai)} 00:00:00` : null],
      ["bulan", data.bulan === null ? null : String(data.bulan)], ["tahun", data.tahun === null ? null : String(data.tahun)],
      ["jumlah_hari", data.jumlahHari === null ? null : String(data.jumlahHari)],
      ["alasan", data.alasan], ["sumber", data.sumber], ["dibuat_oleh", pengguna], ["dibuat_pada", waktuWib(sekarang)],
    ];
    for (const [field, nilai] of kolom) {
      if (nilai === null) continue;
      await tx.auditLog.create({
        data: { namaTabel: "koreksi_rekap", idRecord: String(koreksi.id), fieldDiubah: field, nilaiLama: null, nilaiBaru: nilai, diubahOleh: pengguna, diubahPada: sekarang, aksi: "INSERT" },
      });
    }
    return { koreksi, hasil: await terapkanKoreksi(tx, koreksi, pengguna) };
  });
}

/** Membatalkan koreksi. Angka yang sudah terlanjur dikoreksi TIDAK dikembalikan (hanya saat bulan itu di-upload ulang). */
export async function batalkanKoreksi(db: Db, id: number, pengguna: string): Promise<void> {
  await dalamTransaksi(db, async (tx) => {
    const sekarang = new Date();
    const k = await tx.koreksiRekap.findUniqueOrThrow({ where: { id } });
    if (k.dibatalkanPada !== null) return; // sudah batal: tidak ada perubahan, tidak ada jejak baru
    await tx.koreksiRekap.update({ where: { id }, data: { dibatalkanPada: sekarang } });
    await tx.auditLog.create({
      data: { namaTabel: "koreksi_rekap", idRecord: String(id), fieldDiubah: "dibatalkan_pada", nilaiLama: null, nilaiBaru: waktuWib(sekarang), diubahOleh: pengguna, diubahPada: sekarang, aksi: "UPDATE" },
    });
  });
}

/** Pratinjau dampak koreksi (belum disimpan). Periode: semua bulan rekap NIP itu yang tersentuh; angka: hanya bulan terpilih. */
export async function pratinjauKoreksi(db: Db, d: DataKoreksi): Promise<BarisPratinjau[]> {
  const headers = await db.rekapKehadiranBulanan.findMany({
    where: { nip: d.nip, ...(d.jenis === "angka" ? { bulan: d.bulan!, tahun: d.tahun! } : {}) },
    select: { id: true, bulan: true, tahun: true },
    orderBy: [{ tahun: "asc" }, { bulan: "asc" }],
  });
  if (headers.length === 0) return [];

  const kode = [d.dariKomponen, d.keKomponen].filter((x): x is string => !!x);
  const detail = await db.rekapKehadiranDetail.findMany({ where: { rekapKehadiranBulananId: { in: headers.map((h) => h.id) }, komponenKode: { in: kode } } });
  const kunciAngka = await kunciAngkaAktif(db, [d.nip]);

  const hasil: BarisPratinjau[] = [];
  for (const h of headers) {
    const nilai = new Map(detail.filter((x) => x.rekapKehadiranBulananId === h.id).map((x) => [x.komponenKode, x.nilai]));
    const dari = phpInt(nilai.get(d.dariKomponen));
    const ke = d.keKomponen ? phpInt(nilai.get(d.keKomponen)) : null;

    let cakupan: string;
    let dipindah: number;
    if (d.jenis === "angka") {
      cakupan = ANGKA;
      dipindah = Math.min(dari, d.jumlahHari ?? 0);
    } else {
      cakupan = cakupanKoreksi(d, h.bulan, h.tahun);
      if (cakupan !== DI_LUAR && kunciAngka.has(kunci(d.nip, h.bulan, h.tahun))) cakupan = DIGANTIKAN;
      dipindah = cakupan === PENUH ? dari : 0;
    }
    if (cakupan === DI_LUAR) continue;
    hasil.push({
      bulan: h.bulan, tahun: h.tahun, cakupan, dariSekarang: dari, keSekarang: ke, dipindah, dariHasil: dari - dipindah,
      keHasil: ke === null ? null : ke + dipindah, kurang: d.jenis === "angka" && dari < (d.jumlahHari ?? 0),
    });
  }
  return hasil;
}

/** Koreksi aktif yang berlaku untuk satu NIP selama setahun, per bulan (aturan sama dengan koreksiBerlaku: lihat KDS2). */
export async function koreksiBerlakuUntukNip(db: Db, nip: string, tahun: number): Promise<Record<number, KoreksiRekap[]>> {
  const koreksi = await db.koreksiRekap.findMany({ where: { ...KONDISI_AKTIF, nip }, orderBy: { id: "asc" } });
  const hasil: Record<number, KoreksiRekap[]> = {};
  for (let bulan = 1; bulan <= 12; bulan++) {
    const adaAngka = koreksi.some((k) => k.jenis === "angka" && k.tahun === tahun && k.bulan === bulan);
    for (const k of koreksi) {
      if (k.jenis === "angka") {
        if (k.tahun !== tahun || k.bulan !== bulan) continue;
      } else if (adaAngka || cakupanKoreksi(k, bulan, tahun) !== PENUH) {
        continue;
      }
      (hasil[bulan] ??= []).push(k);
    }
  }
  return hasil;
}
