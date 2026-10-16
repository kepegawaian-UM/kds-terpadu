/**
 * Dashboard: kartu jumlah pegawai (snapshot terbaru), status upload bulan berjalan, tiga dashboard pegawai
 * (Dosen, Tendik, Akademisi Luar; tidak pernah dicampur) dan Dashboard Kinerja (Dosen + Tendik yang masih aktif).
 * Port dari DashboardController (KDS2); paritas di tests/paritas/dashboard.test.ts.
 *
 * Kebiasaan KDS2 yang dipertahankan:
 *  - kartu jumlah pegawai memakai SEMUA baris snapshot terbaru; dashboard pegawai mengecualikan unit UA-179;
 *  - "Punya jabatan tambahan" dihitung dengan kueri terpisah (semua dosen snapshot itu, tanpa pengecualian UA-179);
 *  - Dashboard Kinerja hanya menghitung pegawai yang ada di snapshot bulan TERBARU tahun itu (yang pensiun/resign
 *    di tengah tahun tidak ikut), dan unit induk diambil dari snapshot itu;
 *  - seri pada urutan grafik mengikuti urutan kemunculan.
 */
import type { PrismaClient } from "@prisma/client";

import { kueriRencanaKustom } from "./kueri";
import { bandingkanNama } from "./urutNama";
import { bulanTahunSekarang, keInt, type Param, parameterTerisi } from "./periode";
import { NAMA_BULAN } from "./periode";

const UNIT_PLACEHOLDER = "UA-179";
const JENIS_KEHADIRAN = ["DSN", "TDK"];

const GOLONGAN_URUT = [
  "IV/e", "IV/d", "IV/c", "IV/b", "IV/a",
  "III/d", "III/c", "III/b", "III/a",
  "II/d", "II/c", "II/b", "II/a",
  "I/d", "I/c", "I/b", "I/a",
];
const PENDIDIKAN_URUT = ["S3", "S2", "Sp1", "Profesi", "S1", "D4", "D3", "D1", "SLTA", "SLTP", "SD"];
const STATUS_TENDIK_URUT = ["PNS", "CPNS", "PPPK", "PTNA", "CPTNA", "PTT"];

export type Kpi = { label: string; value: number | string; icon: string; suffix?: string; teks?: boolean };
export type Grafik = { labels: string[]; data: number[] };

/** Baris snapshot yang dipakai grafik pegawai (satu jenis pegawai, satu bulan, tanpa UA-179). */
export type RowUmum = {
  unitIndukNama: string;
  golonganKode: string | null;
  pendidikan: string | null;
  jabatanDosenKode: string | null;
  statusKode: string;
  kategoriKode: string | null;
};

/** round($bagian / $total * 100, 1) PHP (setengah menjauhi nol, dengan pra-pembulatan presisi); 0 bila total 0. */
export function persen(bagian: number, total: number): number {
  if (total <= 0) return 0;
  const x = (bagian / total) * 100;
  return Math.round(Number((x * 10).toPrecision(15))) / 10;
}

const phpTrim = (s: string | null | undefined) => (s ?? "").replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");

/** groupBy(...)->count() dengan urutan kemunculan pertama (kunci null menjadi ""), seperti Collection PHP. */
function hitungKelompok<T>(rows: readonly T[], kunci: (x: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of rows) {
    const k = kunci(x) ?? "";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** sortDesc() stabil pada nilai: seri mengikuti urutan kemunculan. */
const urutMenurun = (m: Map<string, number>) => [...m.entries()].map(([k, v], i) => ({ k, v, i })).sort((a, b) => b.v - a.v || a.i - b.i);

export function chartJabatanDosen(rows: readonly RowUmum[], urutan: { kode: string; nama: string }[]): Grafik {
  const perKode = hitungKelompok(rows, (r) => r.jabatanDosenKode);
  const labels: string[] = [];
  const data: number[] = [];
  for (const { kode, nama } of urutan) {
    if (perKode.has(kode)) {
      labels.push(nama);
      data.push(perKode.get(kode)!);
    }
  }
  return { labels, data };
}

export function chartStatusKepegawaian(rows: readonly RowUmum[], namaByKode: ReadonlyMap<string, string>): Grafik {
  const perKode = hitungKelompok(rows, (r) => r.statusKode);
  const labels: string[] = [];
  const data: number[] = [];
  for (const kode of STATUS_TENDIK_URUT) {
    if (perKode.has(kode)) {
      labels.push(namaByKode.get(kode) ?? kode);
      data.push(perKode.get(kode)!);
    }
  }
  for (const [kode, jumlah] of perKode) {
    if (!STATUS_TENDIK_URUT.includes(kode)) {
      labels.push(namaByKode.get(kode) ?? kode);
      data.push(jumlah);
    }
  }
  return { labels, data };
}

export function chartKategoriAkademisiLuar(rows: readonly RowUmum[], namaByKode: ReadonlyMap<string, string>): Grafik {
  const urut = urutMenurun(hitungKelompok(rows, (r) => r.kategoriKode));
  const top = urut.slice(0, 6);
  const sisa = urut.slice(6).reduce((n, x) => n + x.v, 0);
  const labels = top.map((x) => namaByKode.get(x.k) ?? (x.k || "-"));
  const data = top.map((x) => x.v);
  if (sisa > 0) {
    labels.push("Lainnya");
    data.push(sisa);
  }
  return { labels, data };
}

export function chartSebaranUnitInduk(rows: readonly RowUmum[]): Grafik {
  const top = urutMenurun(hitungKelompok(rows, (r) => r.unitIndukNama)).slice(0, 6);
  return { labels: top.map((x) => x.k), data: top.map((x) => x.v) };
}

export function chartGolongan(rows: readonly RowUmum[]): Grafik {
  const per = hitungKelompok(rows.filter((r) => r.golonganKode !== null), (r) => r.golonganKode);
  const labels: string[] = [];
  const data: number[] = [];
  for (const g of GOLONGAN_URUT) {
    if (per.has(g)) {
      labels.push(g);
      data.push(per.get(g)!);
    }
  }
  for (const [g, n] of per) {
    if (!GOLONGAN_URUT.includes(g)) {
      labels.push(g);
      data.push(n);
    }
  }
  return { labels, data };
}

export function chartPendidikan(rows: readonly RowUmum[]): Grafik {
  const labels: string[] = [];
  const data: number[] = [];
  for (const p of PENDIDIKAN_URUT) {
    const n = rows.filter((r) => phpTrim(r.pendidikan) === p).length;
    if (n > 0) {
      labels.push(p);
      data.push(n);
    }
  }
  return { labels, data };
}

/**
 * Periode dashboard: bulan/tahun dashboard pegawai (parameter harus terisi keduanya, kalau tidak snapshot terbaru
 * atau null) dan tahun dashboard kinerja (parameter tahun_kinerja; bawaan tahun snapshot terbaru, atau tahun ini).
 */
export function periodeDashboard(
  params: { bulan_pegawai?: Param; tahun_pegawai?: Param; tahun_kinerja?: Param },
  terbaru: { bulan: number; tahun: number } | null,
  sekarang: Date = new Date()
): { bulanPegawai: number | null; tahunPegawai: number | null; tahunKinerja: number } {
  const [, tahunIni] = bulanTahunSekarang(sekarang);
  const pegawaiDiParam = parameterTerisi(params.bulan_pegawai) && parameterTerisi(params.tahun_pegawai);
  const ada = params.tahun_kinerja !== undefined && params.tahun_kinerja !== null;
  return {
    bulanPegawai: pegawaiDiParam ? keInt(params.bulan_pegawai) : (terbaru?.bulan ?? null),
    tahunPegawai: pegawaiDiParam ? keInt(params.tahun_pegawai) : (terbaru?.tahun ?? null),
    tahunKinerja: ada ? keInt(params.tahun_kinerja) : (terbaru?.tahun ?? tahunIni),
  };
}

/** "dd-mm-yyyy HH:mm" menurut WIB dari instan waktu. */
export function formatWaktuWib(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.day}-${p.month}-${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

type Db = Pick<
  PrismaClient,
  | "nominatifBulanan"
  | "rekapKehadiranBulanan"
  | "nominatifBulananJabatanTambahan"
  | "jabatanFungsionalDosen"
  | "statusKepegawaian"
  | "kategoriAkademisiLuar"
  | "komponenKehadiran"
  | "$transaction"
>;

async function barisUntukJenis(db: Db, jenis: string, bulan: number, tahun: number): Promise<RowUmum[]> {
  const rows = await db.nominatifBulanan.findMany({
    where: { jenisPegawaiKode: jenis, unitAsalKode: { not: UNIT_PLACEHOLDER }, bulan, tahun },
    orderBy: { id: "asc" },
    select: {
      golonganKode: true,
      pendidikanTerakhir: true,
      jabatanFungsionalDosenKode: true,
      statusKepegawaianKode: true,
      kategoriAkademisiLuarKode: true,
      unitAsal: { select: { unitInduk: { select: { nama: true } } } },
    },
  });
  return rows.map((r) => ({
    unitIndukNama: r.unitAsal.unitInduk.nama,
    golonganKode: r.golonganKode,
    pendidikan: r.pendidikanTerakhir,
    jabatanDosenKode: r.jabatanFungsionalDosenKode,
    statusKode: r.statusKepegawaianKode,
    kategoriKode: r.kategoriAkademisiLuarKode,
  }));
}

async function dashboardPegawai(db: Db, bulan: number, tahun: number) {
  const [dsn, tdk, akl] = await Promise.all(["DSN", "TDK", "AKL"].map((j) => barisUntukJenis(db, j, bulan, tahun)));

  // ---- Dosen
  const jabatanDosen = await db.jabatanFungsionalDosen.findMany({ orderBy: { urutanJenjang: "desc" } });
  const kodeAtas = new Set(
    jabatanDosen.filter((j) => /guru besar|lektor kepala/i.test(j.nama)).map((j) => j.kode)
  );
  const jumlahJabatanTambahan =
    dsn.length > 0
      ? (
          await db.nominatifBulananJabatanTambahan.findMany({
            where: { nominatifBulanan: { jenisPegawaiKode: "DSN", bulan, tahun } },
            distinct: ["nominatifBulananId"],
            select: { nominatifBulananId: true },
          })
        ).length
      : 0;
  const kpiDosen: Kpi[] = [
    { label: "Total dosen", value: dsn.length, icon: "users" },
    { label: "Guru besar + lektor kepala", value: persen(dsn.filter((r) => r.jabatanDosenKode !== null && kodeAtas.has(r.jabatanDosenKode)).length, dsn.length), suffix: "%", icon: "star" },
    { label: "Bergelar S3", value: persen(dsn.filter((r) => r.pendidikan === "S3").length, dsn.length), suffix: "%", icon: "school" },
    { label: "Punya jabatan tambahan", value: jumlahJabatanTambahan, icon: "briefcase" },
  ];

  // ---- Tendik
  const statusNama = new Map((await db.statusKepegawaian.findMany()).map((s) => [s.kode, s.nama]));
  const kpiTendik: Kpi[] = [
    { label: "Total tendik", value: tdk.length, icon: "users" },
    { label: "PNS + CPNS", value: persen(tdk.filter((r) => ["PNS", "CPNS"].includes(r.statusKode)).length, tdk.length), suffix: "%", icon: "certificate" },
    { label: "PPPK", value: tdk.filter((r) => r.statusKode === "PPPK").length, icon: "certificate" },
    { label: "PTT", value: tdk.filter((r) => r.statusKode === "PTT").length, icon: "clock" },
  ];

  // ---- Akademisi Luar
  const kategori = await db.kategoriAkademisiLuar.findMany();
  const kategoriNama = new Map(kategori.map((k) => [k.kode, k.nama]));
  const kategoriMasukRekap = new Set(kategori.filter((k) => k.masukRekapKehadiran).map((k) => k.kode));
  const terbanyak = urutMenurun(hitungKelompok(akl, (r) => r.kategoriKode))[0]?.k;
  const kpiAkl: Kpi[] = [
    { label: "Total akademisi luar", value: akl.length, icon: "users" },
    { label: "Kategori terbanyak", value: terbanyak ? (kategoriNama.get(terbanyak) ?? "") : "-", icon: "star", teks: true },
    {
      label: "Tercover absensi",
      value: persen(akl.filter((r) => r.kategoriKode !== null && kategoriMasukRekap.has(r.kategoriKode)).length, akl.length),
      suffix: "%",
      icon: "calendar",
    },
  ];

  const umum = (rows: RowUmum[], utama: Grafik) => ({
    chartDistribusiUtama: utama,
    chartSebaranUnit: chartSebaranUnitInduk(rows),
    chartGolongan: chartGolongan(rows),
    chartPendidikan: chartPendidikan(rows),
  });
  return {
    DSN: { total: dsn.length, kpi: kpiDosen, ...umum(dsn, chartJabatanDosen(dsn, jabatanDosen)) },
    TDK: { total: tdk.length, kpi: kpiTendik, ...umum(tdk, chartStatusKepegawaian(tdk, statusNama)) },
    AKL: { total: akl.length, kpi: kpiAkl, ...umum(akl, chartKategoriAkademisiLuar(akl, kategoriNama)) },
  };
}

async function dashboardKinerja(db: Db, tahun: number, jenisDihitung: string[] = JENIS_KEHADIRAN) {
  const bulanAcuan = (await db.nominatifBulanan.aggregate({ where: { tahun }, _max: { bulan: true } }))._max.bulan;
  const snapshot =
    bulanAcuan === null
      ? []
      : await db.nominatifBulanan.findMany({
          where: { tahun, bulan: bulanAcuan, jenisPegawaiKode: { in: jenisDihitung } },
          select: { pegawaiNip: true, unitAsal: { select: { unitInduk: { select: { nama: true } } } } },
        });
  const unitPerNip = new Map(snapshot.map((s) => [s.pegawaiNip, s.unitAsal.unitInduk.nama]));
  const nips = [...unitPerNip.keys()];

  const angka = (alias: string) => `COALESCE(NULLIF(substring(${alias} from '^[ ]*[-+]?[0-9]+'), '')::bigint, 0)`;
  const [ringkasan] = await kueriRencanaKustom<{ tercover: bigint; bulan_upload: bigint; sigma: bigint | null; masuk: bigint | null; tk: bigint | null }[]>(
    db,
    `SELECT COUNT(DISTINCT r."nip") AS tercover, COUNT(DISTINCT r."bulan") AS bulan_upload,
            SUM(CASE WHEN d."komponenKode" = 'SIGMA_HARI' THEN ${angka('d."nilai"')} ELSE 0 END) AS sigma,
            SUM(CASE WHEN d."komponenKode" = 'JUMLAH_MASUK_NYATA' THEN ${angka('d."nilai"')} ELSE 0 END) AS masuk,
            SUM(CASE WHEN d."komponenKode" = 'TK' THEN ${angka('d."nilai"')} ELSE 0 END) AS tk
       FROM "rekap_kehadiran_detail" d JOIN "rekap_kehadiran_bulanan" r ON r."id" = d."rekapKehadiranBulananId"
      WHERE r."tahun" = $1 AND r."nip" = ANY($2::text[])`,
    tahun,
    nips
  );
  const sigmaHari = Number(ringkasan.sigma ?? 0);
  const masukNyata = Number(ringkasan.masuk ?? 0);

  // komponen "izin": bukan Rekap dan bertipe angka; urutan = urutan kode (kunci utama tabel di MySQL)
  const komponen = (await db.komponenKehadiran.findMany({ where: { kategori: { not: "Rekap" }, tipeNilai: "integer" } })).sort((a, b) =>
    bandingkanNama(a.kode, b.kode)
  );
  const kodeIzin = komponen.map((k) => k.kode);
  const namaIzin = new Map(komponen.map((k) => [k.kode, k.nama]));

  const perNipKomponen = await kueriRencanaKustom<{ nip: string; kode: string; total: bigint }[]>(
    db,
    `SELECT r."nip" AS nip, d."komponenKode" AS kode, SUM(${angka('d."nilai"')}) AS total
       FROM "rekap_kehadiran_detail" d JOIN "rekap_kehadiran_bulanan" r ON r."id" = d."rekapKehadiranBulananId"
      WHERE r."tahun" = $1 AND r."nip" = ANY($2::text[]) AND d."komponenKode" = ANY($3::text[])
      GROUP BY r."nip", d."komponenKode" ORDER BY r."nip" COLLATE "C", d."komponenKode" COLLATE "C"`,
    tahun,
    nips,
    kodeIzin
  );

  const totalPerKomponen = new Map<string, number>();
  const tkPerNip = new Map<string, number>();
  for (const r of perNipKomponen) {
    totalPerKomponen.set(r.kode, (totalPerKomponen.get(r.kode) ?? 0) + Number(r.total));
    if (r.kode === "TK") tkPerNip.set(r.nip, Number(r.total));
  }
  const kategoriIzin = urutMenurun(totalPerKomponen);

  const perUnit = new Map<string, number>();
  for (const [nip, total] of tkPerNip) {
    const unit = unitPerNip.get(nip) ?? "-";
    perUnit.set(unit, (perUnit.get(unit) ?? 0) + total);
  }
  const unitTk = urutMenurun(perUnit).slice(0, 6);

  const tren = await kueriRencanaKustom<{ bulan: number; kode: string; total: bigint }[]>(
    db,
    `SELECT r."bulan" AS bulan, d."komponenKode" AS kode, SUM(${angka('d."nilai"')}) AS total
       FROM "rekap_kehadiran_detail" d JOIN "rekap_kehadiran_bulanan" r ON r."id" = d."rekapKehadiranBulananId"
      WHERE r."tahun" = $1 AND r."nip" = ANY($2::text[]) AND d."komponenKode" = ANY($3::text[])
      GROUP BY r."bulan", d."komponenKode"`,
    tahun,
    nips,
    kodeIzin
  );
  const perKodeBulan = new Map<string, number>(tren.map((t) => [`${t.kode}|${t.bulan}`, Number(t.total)]));

  return {
    kpi: [
      { label: "Pegawai tercover absensi", value: Number(ringkasan.tercover), icon: "users" },
      { label: "Rata-rata kehadiran", value: sigmaHari > 0 ? persen(masukNyata, sigmaHari) : 0, suffix: "%", icon: "check" },
      { label: "Total TK setahun", value: Number(ringkasan.tk ?? 0), icon: "alert-triangle" },
      { label: "Kelengkapan upload", value: `${Number(ringkasan.bulan_upload)}/12 bulan`, icon: "upload", teks: true },
    ] as Kpi[],
    chartKategoriIzin: { labels: kategoriIzin.map((x) => namaIzin.get(x.k) ?? x.k), data: kategoriIzin.map((x) => x.v) },
    chartUnitTk: { labels: unitTk.map((x) => x.k), data: unitTk.map((x) => x.v) },
    chartTren: {
      bulanLabel: NAMA_BULAN.slice(1) as string[],
      series: kodeIzin.map((kode) => ({
        kode,
        label: namaIzin.get(kode)!,
        data: Array.from({ length: 12 }, (_, i) => perKodeBulan.get(`${kode}|${i + 1}`) ?? 0),
        default: kode === "TK" || kode === "S",
      })),
    },
  };
}

export type DataDashboard = Awaited<ReturnType<typeof dataDashboard>>;

export async function dataDashboard(
  db: Db,
  params: { bulan_pegawai?: Param; tahun_pegawai?: Param; tahun_kinerja?: Param },
  sekarang: Date = new Date()
) {
  const terbaru = await db.nominatifBulanan.findFirst({
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
    select: { bulan: true, tahun: true },
  });

  const jumlahPerJenis: Record<string, number> = { DSN: 0, TDK: 0, AKL: 0 };
  if (terbaru) {
    const g = await db.nominatifBulanan.groupBy({ by: ["jenisPegawaiKode"], where: { bulan: terbaru.bulan, tahun: terbaru.tahun }, _count: { _all: true } });
    for (const x of g) jumlahPerJenis[x.jenisPegawaiKode] = x._count._all;
  }

  const [bulanIni, tahunIni] = bulanTahunSekarang(sekarang);
  const nominatifIni = await db.nominatifBulanan.findFirst({
    where: { bulan: bulanIni, tahun: tahunIni },
    orderBy: { id: "desc" },
    select: { uploadBatch: { select: { diunggahPada: true } } },
  });
  const rekapIni = await db.rekapKehadiranBulanan.findFirst({
    where: { bulan: bulanIni, tahun: tahunIni },
    orderBy: { id: "desc" },
    select: { uploadBatch: { select: { diunggahPada: true } } },
  });

  const { bulanPegawai, tahunPegawai, tahunKinerja } = periodeDashboard(params, terbaru, sekarang);

  return {
    jumlahPerJenis,
    bulanTerbaru: terbaru?.bulan ?? null,
    tahunTerbaru: terbaru?.tahun ?? null,
    nominatifSudahUpload: nominatifIni !== null,
    nominatifTerakhirDiupload: formatWaktuWib(nominatifIni?.uploadBatch.diunggahPada),
    rekapSudahUpload: rekapIni !== null,
    rekapTerakhirDiupload: formatWaktuWib(rekapIni?.uploadBatch.diunggahPada),
    bulanPegawai,
    tahunPegawai,
    dashboardPegawai: bulanPegawai !== null && tahunPegawai !== null ? await dashboardPegawai(db, bulanPegawai, tahunPegawai) : null,
    tahunKinerja,
    dashboardKinerja: await dashboardKinerja(db, tahunKinerja),
    /** Dashboard Kinerja yang sama, dipisah per jenis (hanya Dosen / hanya Tendik): tambahan Terpadu, tidak ada di KDS2. */
    kinerjaPerJenis: { DSN: await dashboardKinerja(db, tahunKinerja, ["DSN"]), TDK: await dashboardKinerja(db, tahunKinerja, ["TDK"]) },
  };
}
