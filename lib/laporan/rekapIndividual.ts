/**
 * Rekap Individual: rekap kehadiran SATU pegawai selama setahun (satu baris per bulan), plus pencarian pegawai dan kandidat
 * cetak/unduh massal. Port dari RekapIndividualService + RekapIndividualController + RekapIndividualMassalController
 * + RekapIndividualExport/MassalExport (KDS2). Paritas terhadap kode KDS2 asli dan data asli lokal:
 * tests/paritas/rekap-individual.test.ts.
 */
import type { PrismaClient } from "@prisma/client";

import { koreksiBerlakuUntukNip } from "@/lib/koreksi/layanan";
import { phpTrim } from "@/lib/impor/phpString";

import { daftarStatusKepegawaian, jenisStatusDari, type Keaktifan, keaktifanDari, labelFileKeaktifan, nipNonaktif, urutanKodeStatus } from "./filter";
import { buatNamaFile } from "./namaFile";
import { KATEGORI_TK, kategoriDari, type KategoriTk } from "./kategoriTk";
import { totalPerNip } from "./rekapTahunan";
import { kondisiNominatif, urutkanTkTerbanyak } from "./rekapBulanan";
import { bulanTahunSekarang, keInt, namaBulan } from "./periode";
import { urutkanMenurutNama } from "./urutNama";

type Db = PrismaClient;

/** Kolom komponen yang ditampilkan (urutan tetap), selain Σ Hari dan Masuk Nyata. */
export const KOLOM_INDIVIDUAL = ["I", "S", "SD", "TD", "TB", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN"] as const;
const SEMUA_KODE = ["SIGMA_HARI", "JUMLAH_MASUK_NYATA", ...KOLOM_INDIVIDUAL];

export type BulanIndividual =
  | { ada: false; nama: string }
  | { ada: true; nama: string; sigma: number; masuk: number; persen: string; nilai: Record<string, number>; tanda: Record<string, true> };

export type LaporanIndividual = {
  nip: string;
  tahun: number;
  identitas: { nama: string; nip: string; jenis: string; status: string; golongan: string; jabatan: string; unit: string; unitInduk: string };
  statusKeluar: string | null;
  bulan: Record<number, BulanIndividual>;
  total: Record<string, number>;
  persenTotal: string;
  bulanTerekam: number;
  keteranganKoreksi: string[];
};

/** (int) PHP atas string: awalan numerik (termasuk desimal/eksponen) dipotong ke bilangan bulat, selain itu 0. */
function phpInt(s: string): number {
  const m = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(s);
  return m ? Math.trunc(Number(m[0])) : 0;
}

/**
 * number_format($masuk / $sigma * 100, 1, ',', '') . '%' atau '-' bila sigma <= 0. Pembulatan setengah menjauhi nol
 * dihitung dengan bilangan bulat (hasil sama dengan round() PHP karena pecahannya rasional).
 */
export function persen(masuk: number, sigma: number): string {
  if (sigma <= 0) return "-";
  const tanda = masuk < 0 ? "-" : "";
  const persepuluh = Math.floor((2 * Math.abs(masuk) * 1000 + sigma) / (2 * sigma));
  return `${persepuluh === 0 ? "" : tanda}${Math.floor(persepuluh / 10)},${persepuluh % 10}%`;
}

function rentang(bulan: number[]): string {
  const urut = [...bulan].sort((a, b) => a - b);
  const kelompok: [number, number][] = [];
  for (const b of urut) {
    const akhir = kelompok[kelompok.length - 1];
    if (akhir && b === akhir[1] + 1) akhir[1] = b;
    else kelompok.push([b, b]);
  }
  return kelompok.map(([a, z]) => (a === z ? namaBulan(a) : `${namaBulan(a)} s.d. ${namaBulan(z)}`)).join(", ");
}

export async function bangunRekapIndividual(db: Db, nip: string, tahun: number): Promise<LaporanIndividual | null> {
  const snapshot = await db.nominatifBulanan.findFirst({
    where: { pegawaiNip: nip, tahun: { lte: tahun } },
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
    include: { jenisPegawai: true, statusKepegawaian: true, unitAsal: { include: { unitInduk: true } }, jabatanFungsionalDosen: true, jabatanFungsionalTendik: true, jabatanFungsiUmum: true },
  });
  if (!snapshot) return null;

  const perBulan = new Map<number, Record<string, number>>();
  const baris = await db.rekapKehadiranDetail.findMany({
    where: { komponenKode: { in: SEMUA_KODE }, rekap: { nip, tahun } },
    orderBy: { id: "asc" },
    select: { komponenKode: true, nilai: true, rekap: { select: { bulan: true } } },
  });
  for (const r of baris) {
    const b = perBulan.get(r.rekap.bulan) ?? {};
    b[r.komponenKode] = phpInt(r.nilai);
    perBulan.set(r.rekap.bulan, b);
  }

  const koreksiPerBulan = await koreksiBerlakuUntukNip(db, nip, tahun);

  const bulan: Record<number, BulanIndividual> = {};
  const total: Record<string, number> = Object.fromEntries(SEMUA_KODE.map((k) => [k, 0]));
  let bulanTerekam = 0;

  for (let b = 1; b <= 12; b++) {
    const nilai = perBulan.get(b);
    if (!nilai) {
      bulan[b] = { ada: false, nama: namaBulan(b) };
      continue;
    }
    bulanTerekam++;
    for (const k of Object.keys(total)) total[k] += nilai[k] ?? 0;

    // sel hasil koreksi: tujuan bila > 0; asal bila masih > 0 atau koreksi "dihapus"
    const tanda: Record<string, true> = {};
    for (const k of koreksiPerBulan[b] ?? []) {
      if (k.keKomponen !== null && (nilai[k.keKomponen] ?? 0) > 0) tanda[k.keKomponen] = true;
      if (k.keKomponen === null || (nilai[k.dariKomponen] ?? 0) > 0) tanda[k.dariKomponen] = true;
    }
    const sigma = nilai.SIGMA_HARI ?? 0;
    const masuk = nilai.JUMLAH_MASUK_NYATA ?? 0;
    bulan[b] = { ada: true, nama: namaBulan(b), sigma, masuk, persen: persen(masuk, sigma), nilai, tanda };
  }

  const jabatan =
    snapshot.jenisPegawaiKode === "DSN"
      ? (snapshot.jabatanFungsionalDosen?.nama ?? null)
      : snapshot.jenisPegawaiKode === "TDK"
        ? snapshot.jabatanFungsionalTendik
          ? phpTrim(`${snapshot.jabatanFungsionalTendik.jabatanPokok} ${snapshot.jabatanFungsionalTendik.jenjang}`)
          : (snapshot.jabatanFungsiUmum?.nama ?? null)
        : null;
  const atauStrip = (v: string | null | undefined) => (v === null || v === undefined || v === "" || v === "0" ? "-" : v); // `?: '-'` PHP

  // keterangan koreksi: satu kalimat per koreksi, bulan berdekatan digabung
  const bulanPerKoreksi = new Map<number, number[]>();
  const koreksiPerId = new Map<number, NonNullable<(typeof koreksiPerBulan)[number]>[number]>();
  for (let b = 1; b <= 12; b++) {
    for (const k of koreksiPerBulan[b] ?? []) {
      if (!perBulan.has(b)) continue;
      bulanPerKoreksi.set(k.id, [...(bulanPerKoreksi.get(k.id) ?? []), b]);
      koreksiPerId.set(k.id, k);
    }
  }
  const keteranganKoreksi = [...bulanPerKoreksi.entries()].map(([id, bln]) => {
    const k = koreksiPerId.get(id)!;
    const tujuan = k.keKomponen ?? "tidak dihitung";
    const r = `${rentang(bln)} ${tahun}`;
    return k.jenis === "angka" ? `${r}: ${k.jumlahHari} hari ${k.dariKomponen} dipindahkan ke ${tujuan} (${k.alasan}).` : `${r}: seluruh ${k.dariKomponen} dipindahkan ke ${tujuan} (${k.alasan}).`;
  });

  return {
    nip,
    tahun,
    identitas: {
      nama: snapshot.nama, nip: snapshot.pegawaiNip, jenis: snapshot.jenisPegawai?.nama ?? snapshot.jenisPegawaiKode, status: snapshot.statusKepegawaian?.nama ?? snapshot.statusKepegawaianKode,
      golongan: atauStrip(snapshot.golonganKode), jabatan: atauStrip(jabatan), unit: snapshot.unitAsal?.nama ?? "-", unitInduk: snapshot.unitAsal?.unitInduk?.nama ?? "",
    },
    statusKeluar: (await db.catatanStatusPegawai.findUnique({ where: { nip } }))?.alasan ?? null,
    bulan,
    total,
    persenTotal: persen(total.JUMLAH_MASUK_NYATA, total.SIGMA_HARI),
    bulanTerekam,
    keteranganKoreksi,
  };
}

// ---------- pencarian ----------
/** LIKE MySQL dengan kolasi *_ci: tanpa huruf besar/kecil dan aksen; `%` dan `_` adalah pola, `\` meloloskan. */
function bentukLike(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
export function cocokLike(teks: string, cari: string): boolean {
  const pola = bentukLike(`%${cari}%`);
  let re = "";
  for (let i = 0; i < pola.length; i++) {
    const c = pola[i];
    if (c === "\\" && i + 1 < pola.length) re += pola[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") re += "[\\s\\S]*";
    else if (c === "_") re += "[\\s\\S]";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "u").test(bentukLike(teks));
}

export type KandidatCari = { id: number; nip: string; nama: string; jenis: string | null; unit: string | null };

/** Dosen/Tendik pada Nominatif tahun itu yang cocok NIP atau nama; satu baris per NIP (snapshot ber-id terbesar di antara yang cocok); maks 30. */
export async function cariPegawaiIndividual(db: Db, cari: string, tahun: number): Promise<KandidatCari[]> {
  const semua = await db.nominatifBulanan.findMany({ where: { tahun, jenisPegawaiKode: { in: ["DSN", "TDK"] } }, select: { id: true, pegawaiNip: true, nama: true } });
  const idTerbaru = new Map<string, number>();
  for (const r of semua) if ((cocokLike(r.pegawaiNip, cari) || cocokLike(r.nama, cari)) && r.id > (idTerbaru.get(r.pegawaiNip) ?? 0)) idTerbaru.set(r.pegawaiNip, r.id);
  if (idTerbaru.size === 0) return [];
  const baris = await db.nominatifBulanan.findMany({ where: { id: { in: [...idTerbaru.values()] } }, include: { jenisPegawai: { select: { nama: true } }, unitAsal: { select: { nama: true } } } });
  return urutkanMenurutNama(baris).slice(0, 30).map((b) => ({ id: b.id, nip: b.pegawaiNip, nama: b.nama, jenis: b.jenisPegawai?.nama ?? null, unit: b.unitAsal?.nama ?? null }));
}

// ---------- massal ----------
export const MAKS_PEGAWAI_MASSAL = 200;

export type KandidatMassal = { nip: string; nama: string; jenis: string | null; status: string | null; unit: string | null; tk: number; sigma: number; persen: string };

/** Dosen/Tendik pada snapshot terakhir (MAX(id)) tahun itu dengan total TK setahun >= minTk, urut TK terbanyak. */
export async function kandidatMassal(db: Db, tahun: number, filter: { jenis: string[]; status: string[]; keaktifan: Keaktifan }, minTk: number, unitIndukKode = "", maksTk: number | null = null): Promise<KandidatMassal[]> {
  const nonaktif = await nipNonaktif(db, tahun);
  const g = await db.nominatifBulanan.groupBy({ by: ["pegawaiNip"], where: { tahun }, _max: { id: true } });
  const ids = g.map((x) => x._max.id!).sort((a, b) => a - b);

  const diurutId = await db.nominatifBulanan.findMany({
    where: { id: { in: ids }, ...kondisiNominatif({ ...filter }, nonaktif), ...(unitIndukKode ? { unitAsal: { unitIndukKode } } : {}) },
    orderBy: { id: "asc" },
    include: { jenisPegawai: { select: { nama: true } }, statusKepegawaian: { select: { nama: true } }, unitAsal: { select: { nama: true } } },
  });
  // seri sebelum diurut TK: Non-aktif membaca lewat indeks NIP (kebiasaan KDS2 yang dipertahankan), lainnya menurut id
  const pegawai = filter.keaktifan === "nonaktif" ? [...diurutId].sort((a, b) => (a.pegawaiNip < b.pegawaiNip ? -1 : a.pegawaiNip > b.pegawaiNip ? 1 : a.id - b.id)) : diurutId;
  if (pegawai.length === 0) return [];

  const jumlah = await totalPerNip(db, tahun, pegawai.map((p) => p.pegawaiNip), ["TK", "SIGMA_HARI"]);
  const peta = pegawai
    .map((p) => {
      const j = jumlah.get(p.pegawaiNip) ?? {};
      const tk = Number(j.TK ?? 0);
      const sigma = Number(j.SIGMA_HARI ?? 0);
      return { nip: p.pegawaiNip, nama: p.nama, jenis: p.jenisPegawai?.nama ?? null, status: p.statusKepegawaian?.nama ?? null, unit: p.unitAsal?.nama ?? null, tk, sigma, persen: persen(tk, sigma) };
    })
    .filter((p) => p.tk >= minTk && (maksTk === null || p.tk <= maksTk) && p.sigma > 0);
  return urutkanTkTerbanyak(peta, (p) => p.tk);
}

// ---------- ekspor ----------
export type SelEkspor = string | number | null;

/** Isi sheet ekspor Rekap Individual (persis RekapIndividualExport::array). */
export function barisEksporIndividual(l: LaporanIndividual): SelEkspor[][] {
  const id = l.identitas;
  const baris: SelEkspor[][] = [
    [`ABSENSI PEGAWAI TAHUN ${l.tahun}`], [""], ["Nama", id.nama], ["NIP", id.nip], ["Jenis / Status", `${id.jenis} / ${id.status}`], ["Gol. / Jabatan", `${id.golongan} / ${id.jabatan}`],
    ["Unit Kerja", phpTrim(id.unit + (id.unitInduk ? `, ${id.unitInduk}` : ""))],
  ];
  if (l.statusKeluar) baris.push(["Keterangan", l.statusKeluar]);
  baris.push([""], ["Bulan", "Σ Hari", "Masuk Nyata", "Hadir", ...KOLOM_INDIVIDUAL]);
  for (let b = 1; b <= 12; b++) {
    const x = l.bulan[b];
    if (!x.ada) baris.push([x.nama, "Belum ada absensi"]);
    else baris.push([x.nama, x.sigma, x.masuk, x.persen, ...KOLOM_INDIVIDUAL.map((k) => x.nilai[k] ?? 0)]);
  }
  baris.push([`Jumlah (${l.bulanTerekam} bulan)`, l.total.SIGMA_HARI, l.total.JUMLAH_MASUK_NYATA, l.persenTotal, ...KOLOM_INDIVIDUAL.map((k) => l.total[k])]);
  baris.push([""], ["Keterangan"], ["TK = Tanpa Keterangan: tidak ada rekam presensi pada data sumber, tidak selalu berarti tidak hadir; verifikasi ke unit kerja."]);
  return baris;
}

/** Str::limit($nilai, $n, '') : potong menurut jumlah karakter lalu rtrim (cukup untuk nama; lebar tampilan ganda tidak dipakai). */
function batasi(s: string, n: number): string {
  const a = Array.from(s);
  return a.length <= n ? s : a.slice(0, n).join("").replace(/[ \t\n\r\0\x0B]+$/, "");
}

/** Judul sheet unik per pegawai pada ekspor massal (RekapIndividualMassalExport::sheets). */
export function judulSheetMassal(daftar: LaporanIndividual[]): string[] {
  const dipakai = new Set<string>();
  return daftar.map((l) => {
    const nama = phpTrim(l.identitas.nama.replace(/[[\]:*?/\\]/g, " "));
    let judul = `${batasi(nama, 20)} ${l.nip.slice(-6)}`;
    for (let i = 2; dipakai.has(judul.toLowerCase()); i++) judul = `${batasi(nama, 18)} ${l.nip.slice(-6)}-${i}`;
    dipakai.add(judul.toLowerCase());
    return judul;
  });
}

/** "13 Oktober 2026" menurut tanggal WIB, untuk kaki dokumen cetak. */
export function tanggalCetakWib(sekarang = new Date()): string {
  const [bulan, tahun] = bulanTahunSekarang(sekarang);
  const hari = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric" }).format(sekarang));
  return `${hari} ${namaBulan(bulan)} ${tahun}`;
}

// ---------- parameter massal (halaman, cetak, Excel memakai aturan yang sama) ----------
export type ParamMassal = { tahun: number; minTk: number; jenis: string[]; status: string[]; keaktifan: Keaktifan; nip: string[]; /** kode unit induk; "" = semua */ unitInduk: string; /** kategori TK (ringan/sedang/berat); bila ada, menggantikan minTk; null = pakai minTk */ kategori: Exclude<KategoriTk, "semua"> | null };

/** Rentang TK yang berlaku: kategori (bila dipilih) atau batas minimal biasa. */
export function rentangTkMassal(p: Pick<ParamMassal, "minTk" | "kategori">): { min: number; maks: number | null } {
  return p.kategori ? { min: KATEGORI_TK[p.kategori].min, maks: KATEGORI_TK[p.kategori].maks } : { min: p.minTk, maks: null };
}

/** Nilai berulang ?x=a&x=b dan ?x[]=a (bentuk KDS2). */
export type AmbilSemua = (kunci: string) => string[];
export const dariUrlSearchParams = (sp: URLSearchParams): AmbilSemua => (k) => [...sp.getAll(k), ...sp.getAll(`${k}[]`)];
export const dariRecord = (sp: Record<string, string | string[] | undefined>): AmbilSemua => (k) => {
  const v = sp[k] ?? sp[`${k}[]`];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
};

export async function bacaParamMassal(db: Db, ambil: AmbilSemua, sekarang = new Date()): Promise<ParamMassal> {
  const [, tahunIni] = bulanTahunSekarang(sekarang);
  const t = ambil("tahun")[0];
  const tahunMentah = t === undefined ? tahunIni : keInt(t);
  const m = ambil("min_tk")[0];
  const daftarStatus = await daftarStatusKepegawaian(db);
  const { jenis, status } = jenisStatusDari({ jenis: ambil("jenis"), status: ambil("status") }, daftarStatus.map((s) => s.kode));
  const kat = kategoriDari(ambil("kategori")[0]);
  const kategori = kat && kat !== "semua" ? kat : null;
  const unitMentah = (ambil("unit_induk")[0] ?? "").trim();
  const unitInduk = unitMentah && (await db.unitInduk.findUnique({ where: { kode: unitMentah }, select: { kode: true } })) ? unitMentah : ""; // kode tak dikenal diabaikan
  return {
    tahun: tahunMentah >= 2020 && tahunMentah <= 2100 ? tahunMentah : tahunIni,
    minTk: Math.max(0, Math.min(366, m === undefined ? 20 : keInt(m))),
    jenis, status, keaktifan: keaktifanDari(ambil("keaktifan")[0]), nip: ambil("nip"), unitInduk, kategori,
  };
}

export async function namaFileMassal(db: Db, p: ParamMassal): Promise<string> {
  const unit = p.unitInduk ? await db.unitInduk.findUnique({ where: { kode: p.unitInduk }, select: { nama: true } }) : null;
  return buatNamaFile("Absensi Pegawai", p.jenis, p.status, `${p.kategori ? KATEGORI_TK[p.kategori].nama : `TK min ${p.minTk}`} ${p.tahun}${unit ? ` - ${unit.nama}` : ""}`, await urutanKodeStatus(db), labelFileKeaktifan(p.keaktifan));
}

/** Pegawai terpilih untuk cetak/unduh massal (1 sampai 200 NIP digit; duplikat dibuang; NIP tanpa data dilewati). */
export async function laporanTerpilih(db: Db, nips: string[], tahun: number): Promise<{ galat: string } | { daftar: LaporanIndividual[] }> {
  if (nips.length < 1) return { galat: "Pilih minimal satu pegawai." };
  if (nips.length > MAKS_PEGAWAI_MASSAL) return { galat: `Maksimal ${MAKS_PEGAWAI_MASSAL} pegawai per cetak/unduh; kurangi pilihan.` };
  if (nips.some((n) => !/^\d{1,20}$/.test(n))) return { galat: "NIP tidak valid." };
  const daftar: LaporanIndividual[] = [];
  for (const nip of [...new Set(nips)]) {
    const l = await bangunRekapIndividual(db, nip, tahun);
    if (l) daftar.push(l);
  }
  return { daftar };
}
