/**
 * Importer Nominatif Bulanan. Port dari App\Services\NominatifBulananImporter + App\Support\KontrakNominatif (KDS2).
 *  - kolom dibaca menurut POSISI; header baris 1 diperiksa dulu (kolom bergeser = berkas DITOLAK seluruhnya);
 *  - kolom master dicocokkan menurut NAMA *atau* KODE (tanpa huruf besar/kecil dan koma); semua ketidakcocokan membuat
 *    baris itu GAGAL (dilewati dan dicatat); NIP baru otomatis menjadi pegawai baru;
 *  - NIP ganda dalam berkas: baris TERAKHIR dipakai; Jabatan Tambahan maksimal 3 slot, slot bermasalah hanya PERINGATAN;
 *  - upload ulang (nip, bulan, tahun) yang sama MENGGANTI (id baris dipertahankan, jabatan tambahan lama dihapus);
 *  - Nominatif adalah snapshot: NIP yang tidak muncul dianggap tidak aktif bulan itu (hanya diberi tahu saat Periksa).
 * Lapis: bacaBarisNominatif -> validasiNominatif (murni) -> simpanNominatif (satu transaksi).
 * Paritas: tests/paritas/impor-nominatif.test.ts (importer KDS2 asli lewat scripts/oracle/kds2-nominatif.php).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { type BarisSheet, bacaSheet, type NilaiSel } from "@/lib/upload/bacaSheet";
import { KesalahanUpload } from "@/lib/upload/konstanta";
import { periksaBerkas } from "@/lib/upload/penjagaBerkas";

import { phpLtrim, phpTrim, strLimit } from "./phpString";
import { parseTanggalNominatif } from "./tanggal";

// ---------- kontrak kolom ----------
const K = { NIP: 0, NAMA: 1, JK: 2, LAHIR: 3, PENDIDIKAN: 4, AGAMA: 5, JENIS: 6, STATUS: 7, GOLONGAN: 8, JABFUNG: 9, KATAKL: 10, UNIT: 11, TMT: 12 } as const;
const SLOT: readonly [number, number, number][] = [
  [13, 14, 15],
  [16, 17, 18],
  [19, 20, 21],
];
export const JUMLAH_KOLOM_NOMINATIF = 22;

/** posisi (indeks 0) -> kata kunci yang harus ada di teks header (KontrakNominatif::KOLOM_WAJIB). */
const KOLOM_WAJIB: [number, string][] = [
  [0, "nip"], [1, "nama"], [2, "jenis kelamin"], [3, "tanggal lahir"], [4, "pendidikan"], [5, "agama"], [6, "jenis pegawai"],
  [7, "status kepegawaian"], [8, "golongan"], [9, "jabatan fungsional"], [10, "kategori akademisi"], [11, "unit kerja"],
  [12, "mulai kerja"], [13, "jabatan tambahan 1"], [14, "unit/prodi"], [15, "status pengangkatan 1"], [16, "jabatan tambahan 2"],
  [17, "unit/prodi"], [18, "status pengangkatan 2"],
];
const SLOT3: [number, string][] = [[19, "jabatan tambahan 3"], [20, "unit/prodi"], [21, "status pengangkatan 3"]];

const keTeks = (v: NilaiSel | undefined): string => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "1" : "") : v instanceof Date ? String(v.getTime() / 86_400_000 + 25569) : String(v));
const lipatAscii = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** `trim((string) x) ?: '(kosong)'` PHP: teks kosong dan "0" sama-sama dianggap kosong. */
const tampil = (t: string | undefined): string => {
  const v = phpTrim(t ?? "");
  return v === "" || v === "0" ? "(kosong)" : v;
};

/** Padanan KontrakNominatif::periksaHeader. Menolak berkas bila ada kolom dasar yang tidak sesuai posisinya. */
export function periksaHeaderNominatif(header: BarisSheet | undefined): { slot3: boolean } {
  const teks = (header ?? []).map((v) => keTeks(v).trim().toLowerCase());
  const salah: string[] = [];
  for (const [posisi, kataKunci] of KOLOM_WAJIB) {
    if (!(teks[posisi] ?? "").includes(kataKunci)) {
      salah.push(`kolom ke-${posisi + 1} seharusnya memuat "${kataKunci}" tetapi berisi "${tampil(teks[posisi])}"`);
    }
  }
  if (salah.length > 0) {
    throw new KesalahanUpload(
      `Susunan kolom file tidak sesuai template Nominatif Bulanan (kolom bergeser atau header berubah): ${salah.slice(0, 5).join("; ")}${salah.length > 5 ? "; ..." : ""}. Upload dibatalkan supaya data tidak terbaca di kolom yang salah.`,
    );
  }
  return { slot3: SLOT3.every(([posisi, kataKunci]) => (teks[posisi] ?? "").includes(kataKunci)) };
}

// ---------- master ----------
/** Kunci pencocokan nama master: huruf kecil (ASCII), koma dibuang, spasi ganda dirapikan. */
export const normalisasiNama = (v: string): string => lipatAscii(phpTrim(v.replace(/,/g, "").replace(/[ \t\n\v\f\r]+/g, " ")));

export type MasterNominatif = {
  jenisPegawai: ReadonlyMap<string, string>;
  statusKepegawaian: ReadonlyMap<string, { kode: string; kategori: string }>;
  golongan: ReadonlySet<string>;
  jabfungDosen: ReadonlyMap<string, string>;
  jabfungTendik: ReadonlyMap<string, string>;
  jabfungUmum: ReadonlyMap<string, string>;
  kategoriAkl: ReadonlyMap<string, string>;
  unitAsal: ReadonlyMap<string, string>;
  programStudi: ReadonlyMap<string, string>;
  jabatanTambahanRole: ReadonlyMap<string, string>;
};

// Alias unit: KDS1 menulis asrama sebagai "Asrama X, Kampus Y UM"; master memakai "Asrama X (Kampus Y)". Hanya dipakai bila nama persis tidak ada.
const ALIAS_UNIT: [string, string][] = [
  ["Asrama Matahari, Kampus II UM", "UA-205"], ["Asrama Mawar, Kampus III UM", "UA-206"], ["Asrama Aster dan Edelweis, Kampus Induk UM", "UA-207"],
  ["Asrama Dahlia, Kampus Induk UM", "UA-208"], ["Asrama Tulip, Kampus Induk UM", "UA-209"], ["Asrama Soka dan Lily, Kampus Induk UM", "UA-210"],
];

type Db = PrismaClient | Prisma.TransactionClient;

export async function muatMasterNominatif(db: Db): Promise<MasterNominatif> {
  const urut = { orderBy: { kode: "asc" as const } };
  const [jp, sk, gol, jfd, jft, jfu, kal, unit, prodi, role] = await Promise.all([
    db.jenisPegawai.findMany(urut), db.statusKepegawaian.findMany(urut), db.golongan.findMany(urut), db.jabatanFungsionalDosen.findMany(urut),
    db.jabatanFungsionalTendik.findMany(urut), db.jabatanFungsiUmumPelaksana.findMany(urut), db.kategoriAkademisiLuar.findMany(urut),
    db.unitAsal.findMany(urut), db.programStudi.findMany(urut), db.jabatanTambahanRole.findMany(urut),
  ]);
  const peta = <T, V>(daftar: T[], f: (x: T) => [string, V][]) => new Map(daftar.flatMap(f));

  const unitMap = peta(unit, (m) => [[normalisasiNama(m.nama), m.kode]]);
  for (const [nama, kode] of ALIAS_UNIT) if (!unitMap.has(normalisasiNama(nama))) unitMap.set(normalisasiNama(nama), kode);

  const jabfungDosen = peta(jfd, (m) => [[normalisasiNama(m.nama), m.kode]]);
  jabfungDosen.set("tenaga pengajar", "DSN-00"); // alias lama dari KDS1 ("Tenaga Dosen" nama resminya)
  const jabfungUmum = peta(jfu, (m) => [[normalisasiNama(m.nama), m.kode]]);
  jabfungUmum.set("laboran", "UMM-10");

  return {
    jenisPegawai: peta(jp, (m) => [[normalisasiNama(m.nama), m.kode], [normalisasiNama(m.kode), m.kode]]),
    statusKepegawaian: peta(sk, (m) => [[normalisasiNama(m.nama), { kode: m.kode, kategori: m.kategori }], [normalisasiNama(m.kode), { kode: m.kode, kategori: m.kategori }]]),
    golongan: new Set(gol.map((g) => g.kode)),
    jabfungDosen,
    jabfungTendik: peta(jft, (m) => [[normalisasiNama(`${m.jabatanPokok} ${m.jenjang}`), m.kode]]),
    jabfungUmum,
    kategoriAkl: peta(kal, (m) => [[normalisasiNama(m.nama), m.kode]]),
    unitAsal: unitMap,
    programStudi: peta(prodi, (m) => [[normalisasiNama(m.nama), m.kode]]),
    jabatanTambahanRole: peta(role, (m) => [[normalisasiNama(m.namaRole), m.kode]]),
  };
}

// ---------- validasi ----------
export type DataNominatif = {
  nama: string;
  jenisKelamin: string;
  tanggalLahir: string | null;
  pendidikanTerakhir: string | null;
  agama: string | null;
  jenisPegawaiKode: string;
  statusKepegawaianKode: string;
  golonganKode: string | null;
  jabatanFungsionalDosenKode: string | null;
  jabatanFungsionalTendikKode: string | null;
  jabatanFungsiUmumKode: string | null;
  kategoriAkademisiLuarKode: string | null;
  unitAsalKode: string;
  tanggalMulaiKerja: string;
};
export type SlotJabatan = { jabatanTambahanRoleKode: string; unitAsalKode: string | null; programStudiKode: string | null; statusPengangkatan: string };
export type Catatan = { nomorBaris: number; nipDimaksud: string; alasan: string };
export type BarisValid = { data: DataNominatif; jabatan: SlotJabatan[]; nomor: number };

export type HasilValidasiNominatif = { totalBaris: number; berhasil: number; gagal: number; valid: Map<string, BarisValid>; catatan: Catatan[] };

const teksSel = (row: BarisSheet, i: number) => phpTrim(keTeks(row[i]));
const atauNull = (row: BarisSheet, i: number) => {
  const t = teksSel(row, i);
  return t === "" ? null : t;
};

function prosesBaris(row: BarisSheet, m: MasterNominatif, galat: string[]): DataNominatif | null {
  const nama = teksSel(row, K.NAMA);
  if (nama === "") galat.push("Nama kosong");

  const jk = teksSel(row, K.JK).replace(/[a-z]/g, (c) => c.toUpperCase());
  if (jk !== "L" && jk !== "P") galat.push(`Jenis Kelamin tidak valid: '${jk}' (harus L atau P)`);

  const lahirMentah = row[K.LAHIR] ?? null;
  const lahir = parseTanggalNominatif(lahirMentah);
  if (lahir === null && phpTrim(keTeks(lahirMentah)) !== "") galat.push("Tanggal Lahir tidak valid (format tidak dikenali)");

  const jenisNama = teksSel(row, K.JENIS);
  const jenis = m.jenisPegawai.get(normalisasiNama(jenisNama)) ?? null;
  if (!jenis) galat.push(`Jenis Pegawai tidak ditemukan: '${jenisNama}'`);

  const statusNama = teksSel(row, K.STATUS);
  const status = m.statusKepegawaian.get(normalisasiNama(statusNama)) ?? null;
  if (!status) galat.push(`Status Kepegawaian tidak ditemukan: '${statusNama}'`);

  const golInput = teksSel(row, K.GOLONGAN);
  let golongan: string | null = null;
  if (status && status.kategori === "ASN") {
    if (golInput === "") galat.push("Golongan wajib diisi untuk status kepegawaian kategori ASN");
    else if (!m.golongan.has(golInput)) galat.push(`Golongan tidak ditemukan: '${golInput}'`);
    else golongan = golInput;
  } else if (m.golongan.has(golInput)) {
    golongan = golInput; // Non-ASN: opsional, disimpan bila kodenya valid
  }

  let jfd: string | null = null;
  let jft: string | null = null;
  let jfu: string | null = null;
  const jabfung = teksSel(row, K.JABFUNG);
  if (jabfung !== "" && jenis !== "AKL" && jenis !== null) {
    const kunci = normalisasiNama(jabfung);
    if (jenis === "DSN") {
      jfd = m.jabfungDosen.get(kunci) ?? null;
      if (!jfd) galat.push(`Jabatan Fungsional Dosen tidak ditemukan: '${jabfung}'`);
    } else if (jenis === "TDK") {
      jft = m.jabfungTendik.get(kunci) ?? null;
      if (!jft) {
        jfu = m.jabfungUmum.get(kunci) ?? null;
        if (!jfu) galat.push(`Jabatan Fungsional/Fungsi Umum Tendik tidak ditemukan: '${jabfung}'`);
      }
    }
  }

  const aklNama = teksSel(row, K.KATAKL);
  let akl: string | null = null;
  if (jenis === "AKL") {
    akl = m.kategoriAkl.get(normalisasiNama(aklNama)) ?? null;
    if (!akl) galat.push(`Kategori Akademisi Luar tidak ditemukan: '${aklNama}'`);
  }

  const unitNama = teksSel(row, K.UNIT);
  const unit = m.unitAsal.get(normalisasiNama(unitNama)) ?? null;
  if (!unit) galat.push(`Unit Kerja tidak ditemukan: '${unitNama}'`);

  const tmt = parseTanggalNominatif(row[K.TMT] ?? null);
  if (!tmt) galat.push("Tanggal Mulai Kerja (TMT) tidak valid/kosong");

  if (galat.length > 0 || !jenis || !status || !unit || !tmt) return null;
  return {
    nama, jenisKelamin: jk, tanggalLahir: lahir, pendidikanTerakhir: atauNull(row, K.PENDIDIKAN), agama: atauNull(row, K.AGAMA),
    jenisPegawaiKode: jenis, statusKepegawaianKode: status.kode, golonganKode: golongan, jabatanFungsionalDosenKode: jfd,
    jabatanFungsionalTendikKode: jft, jabatanFungsiUmumKode: jfu, kategoriAkademisiLuarKode: akl, unitAsalKode: unit, tanggalMulaiKerja: tmt,
  };
}

function resolveJabatanTambahan(row: BarisSheet, m: MasterNominatif, punyaSlot3: boolean, peringatan: string[]): SlotJabatan[] {
  const hasil: SlotJabatan[] = [];
  SLOT.slice(0, punyaSlot3 ? 3 : 2).forEach(([kRole, kUnit, kStatus], urutan) => {
    const n = urutan + 1;
    const roleNama = teksSel(row, kRole);
    if (roleNama === "") return;
    const role = m.jabatanTambahanRole.get(normalisasiNama(roleNama)) ?? null;
    if (!role) {
      peringatan.push(`Jabatan Tambahan ${n} '${roleNama}' tidak ada di master Jabatan Tambahan - slot dilewati`);
      return;
    }
    const unitProdiNama = teksSel(row, kUnit);
    const unit = m.unitAsal.get(normalisasiNama(unitProdiNama)) ?? null;
    const prodi = unit ? null : (m.programStudi.get(normalisasiNama(unitProdiNama)) ?? null);
    if (unitProdiNama !== "" && !unit && !prodi) {
      peringatan.push(`Jabatan Tambahan ${n} '${roleNama}': Unit/Prodi '${unitProdiNama}' tidak ditemukan di master - slot disimpan tanpa unit/prodi`);
    }
    const status = teksSel(row, kStatus);
    if (!["Definitif", "Plt", "Pjs"].includes(status)) {
      peringatan.push(`Jabatan Tambahan ${n} '${roleNama}': Status Pengangkatan '${status}' tidak valid (harus Definitif/Plt/Pjs) - slot dilewati`);
      return;
    }
    hasil.push({ jabatanTambahanRoleKode: role, unitAsalKode: unit, programStudiKode: prodi, statusPengangkatan: status });
  });
  return hasil;
}

export function validasiNominatif(baris: BarisSheet[], m: MasterNominatif, punyaSlot3: boolean): HasilValidasiNominatif {
  const hasil: HasilValidasiNominatif = { totalBaris: 0, berhasil: 0, gagal: 0, valid: new Map(), catatan: [] };
  const barisAsal = new Map<string, BarisSheet>(); // baris terakhir per NIP (untuk slot jabatan tambahan)
  for (let i = 1; i < baris.length; i++) {
    const row = baris[i];
    const nip = phpLtrim(phpTrim(keTeks(row[K.NIP])), "'");
    if (nip === "" || !/^[0-9]+$/.test(nip) || (typeof row[K.NIP] === "number" && !Number.isSafeInteger(row[K.NIP]))) continue;
    hasil.totalBaris++;

    const galat: string[] = [];
    const data = prosesBaris(row, m, galat);
    if (galat.length > 0 || !data) {
      hasil.catatan.push({ nomorBaris: i + 1, nipDimaksud: strLimit(nip, 18), alasan: strLimit(galat.join(" | "), 255) });
      continue;
    }
    hasil.valid.set(nip, { data, jabatan: [], nomor: i + 1 });
    barisAsal.set(nip, row);
  }
  hasil.berhasil = hasil.valid.size;
  hasil.gagal = hasil.totalBaris - hasil.berhasil;

  // peringatan slot jabatan tambahan (diurutkan menurut kemunculan NIP, setelah semua baris gagal), dan penyusunan slot
  for (const [nip, v] of hasil.valid) {
    const peringatan: string[] = [];
    v.jabatan = resolveJabatanTambahan(barisAsal.get(nip)!, m, punyaSlot3, peringatan);
    for (const p of peringatan) hasil.catatan.push({ nomorBaris: v.nomor, nipDimaksud: strLimit(nip, 18), alasan: strLimit(`[PERINGATAN] ${p}`, 255) });
  }
  return hasil;
}

// ---------- baca / periksa / simpan ----------
export async function bacaBarisNominatif(berkas: Buffer, namaSheet: string | null): Promise<{ baris: BarisSheet[]; slot3: boolean }> {
  const baris = await bacaSheet(berkas, namaSheet, JUMLAH_KOLOM_NOMINATIF);
  return { baris, slot3: periksaHeaderNominatif(baris[0]).slot3 };
}

export type RingkasanNominatif = {
  totalBaris: number;
  berhasil: number;
  gagal: number;
  peringatan: number;
  catatan: Catatan[];
  /** baris (nip, bulan, tahun) yang sudah ada dan akan DIGANTI */
  akanDiganti: number;
  akanBaru: number;
  /** NIP yang belum pernah ada di data pegawai */
  pegawaiBaru: number;
  /** NIP di snapshot sebelumnya (bulan terdekat sebelum periode ini) yang TIDAK ada di berkas: akan tampil non-aktif */
  tidakAdaDiBerkas: number;
  /** bulan/tahun snapshot pembanding, null bila belum ada snapshot sebelumnya */
  pembanding: { bulan: number; tahun: number; jumlah: number } | null;
};

export type OpsiNominatif = { bulan: number; tahun: number; namaSheet?: string | null };

async function ringkas(db: Db, h: HasilValidasiNominatif, { bulan, tahun }: OpsiNominatif): Promise<RingkasanNominatif> {
  const nips = [...h.valid.keys()];
  let akanDiganti = 0;
  let pegawaiAda = 0;
  for (let i = 0; i < nips.length; i += 1000) {
    const bagian = nips.slice(i, i + 1000);
    akanDiganti += await db.nominatifBulanan.count({ where: { bulan, tahun, pegawaiNip: { in: bagian } } });
    pegawaiAda += await db.pegawai.count({ where: { nip: { in: bagian } } });
  }
  const sebelumnya = await db.nominatifBulanan.findFirst({
    where: { OR: [{ tahun: { lt: tahun } }, { tahun, bulan: { lt: bulan } }] }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }], select: { bulan: true, tahun: true },
  });
  let pembanding: RingkasanNominatif["pembanding"] = null;
  let tidakAda = 0;
  if (sebelumnya) {
    const nipSebelumnya = (await db.nominatifBulanan.findMany({ where: { bulan: sebelumnya.bulan, tahun: sebelumnya.tahun }, select: { pegawaiNip: true } })).map((x) => x.pegawaiNip);
    tidakAda = nipSebelumnya.filter((n) => !h.valid.has(n)).length;
    pembanding = { bulan: sebelumnya.bulan, tahun: sebelumnya.tahun, jumlah: nipSebelumnya.length };
  }
  return {
    totalBaris: h.totalBaris, berhasil: h.berhasil, gagal: h.gagal, peringatan: h.catatan.filter((c) => c.alasan.startsWith("[PERINGATAN] ")).length,
    catatan: h.catatan, akanDiganti, akanBaru: h.valid.size - akanDiganti, pegawaiBaru: h.valid.size - pegawaiAda, tidakAdaDiBerkas: tidakAda, pembanding,
  };
}

/** Tahap PERIKSA: membaca dan memvalidasi seluruh berkas tanpa menulis apa pun. */
export async function periksaNominatif(prisma: PrismaClient, berkas: Buffer, opsi: OpsiNominatif): Promise<RingkasanNominatif> {
  const namaSheet = await periksaBerkas(berkas, opsi.namaSheet);
  const { baris, slot3 } = await bacaBarisNominatif(berkas, namaSheet);
  const h = validasiNominatif(baris, await muatMasterNominatif(prisma), slot3);
  return ringkas(prisma, h, opsi);
}

export type PenggunaUpload = { id: string | null; nama: string };
const potong = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/** Tahap SIMPAN: membaca ulang, memvalidasi dan menulis massal dalam SATU transaksi (semua atau tidak sama sekali). */
export async function simpanNominatif(
  prisma: PrismaClient,
  berkas: Buffer,
  namaFileAsli: string,
  opsi: OpsiNominatif,
  pengguna: PenggunaUpload,
): Promise<{ batchId: number; ringkasan: RingkasanNominatif }> {
  const namaSheet = await periksaBerkas(berkas, opsi.namaSheet);
  const { baris, slot3 } = await bacaBarisNominatif(berkas, namaSheet);
  const { bulan, tahun } = opsi;

  return prisma.$transaction(
    async (tx) => {
      const h = validasiNominatif(baris, await muatMasterNominatif(tx), slot3);
      const ringkasan = await ringkas(tx, h, opsi);

      const batch = await tx.uploadBatch.create({
        data: {
          jenis: "nominatif_bulanan", bulan, tahun, namaFileAsli, status: "Selesai", jumlahBarisTotal: h.totalBaris,
          jumlahBerhasil: h.berhasil, jumlahGagal: h.gagal, diunggahOlehNama: pengguna.nama, diunggahOlehId: pengguna.id,
        },
      });

      const entri = [...h.valid.entries()];
      for (const bagian of potong(entri, 500)) {
        await tx.pegawai.createMany({ data: bagian.map(([nip]) => ({ nip })), skipDuplicates: true });
        const kol = <T,>(f: (d: DataNominatif) => T) => bagian.map(([, v]) => f(v.data));
        // upsert massal: id baris yang sudah ada dipertahankan (penting: "snapshot terakhir" laporan tahunan memakai MAX(id))
        await tx.$executeRaw`
          INSERT INTO nominatif_bulanan ("pegawaiNip", bulan, tahun, nama, "jenisKelamin", "tanggalLahir", "pendidikanTerakhir", agama,
            "jenisPegawaiKode", "statusKepegawaianKode", "golonganKode", "jabatanFungsionalDosenKode", "jabatanFungsionalTendikKode",
            "jabatanFungsiUmumKode", "kategoriAkademisiLuarKode", "unitAsalKode", "tanggalMulaiKerja", "uploadBatchId")
          SELECT t.nip, ${bulan}, ${tahun}, t.nama, t.jk, t.lahir::date, t.pend, t.agama, t.jp, t.sk, t.gol, t.jfd, t.jft, t.jfu, t.akl, t.unit,
            t.tmt::date, ${batch.id}
          FROM unnest(${bagian.map(([nip]) => nip)}::text[], ${kol((d) => d.nama)}::text[], ${kol((d) => d.jenisKelamin)}::text[],
            ${kol((d) => d.tanggalLahir)}::text[], ${kol((d) => d.pendidikanTerakhir)}::text[], ${kol((d) => d.agama)}::text[],
            ${kol((d) => d.jenisPegawaiKode)}::text[], ${kol((d) => d.statusKepegawaianKode)}::text[], ${kol((d) => d.golonganKode)}::text[],
            ${kol((d) => d.jabatanFungsionalDosenKode)}::text[], ${kol((d) => d.jabatanFungsionalTendikKode)}::text[],
            ${kol((d) => d.jabatanFungsiUmumKode)}::text[], ${kol((d) => d.kategoriAkademisiLuarKode)}::text[], ${kol((d) => d.unitAsalKode)}::text[],
            ${kol((d) => d.tanggalMulaiKerja)}::text[])
            AS t(nip, nama, jk, lahir, pend, agama, jp, sk, gol, jfd, jft, jfu, akl, unit, tmt)
          ON CONFLICT ("pegawaiNip", bulan, tahun) DO UPDATE SET
            nama = EXCLUDED.nama, "jenisKelamin" = EXCLUDED."jenisKelamin", "tanggalLahir" = EXCLUDED."tanggalLahir",
            "pendidikanTerakhir" = EXCLUDED."pendidikanTerakhir", agama = EXCLUDED.agama, "jenisPegawaiKode" = EXCLUDED."jenisPegawaiKode",
            "statusKepegawaianKode" = EXCLUDED."statusKepegawaianKode", "golonganKode" = EXCLUDED."golonganKode",
            "jabatanFungsionalDosenKode" = EXCLUDED."jabatanFungsionalDosenKode", "jabatanFungsionalTendikKode" = EXCLUDED."jabatanFungsionalTendikKode",
            "jabatanFungsiUmumKode" = EXCLUDED."jabatanFungsiUmumKode", "kategoriAkademisiLuarKode" = EXCLUDED."kategoriAkademisiLuarKode",
            "unitAsalKode" = EXCLUDED."unitAsalKode", "tanggalMulaiKerja" = EXCLUDED."tanggalMulaiKerja", "uploadBatchId" = EXCLUDED."uploadBatchId"`;
      }

      const idPerNip = new Map<string, number>();
      for (const bagian of potong(entri, 1000)) {
        for (const r of await tx.nominatifBulanan.findMany({ where: { bulan, tahun, pegawaiNip: { in: bagian.map(([nip]) => nip) } }, select: { id: true, pegawaiNip: true } })) {
          idPerNip.set(r.pegawaiNip, r.id);
        }
      }
      for (const bagian of potong([...idPerNip.values()], 1000)) await tx.nominatifBulananJabatanTambahan.deleteMany({ where: { nominatifBulananId: { in: bagian } } });

      const jt: Prisma.NominatifBulananJabatanTambahanCreateManyInput[] = [];
      for (const [nip, v] of entri) for (const s of v.jabatan) jt.push({ nominatifBulananId: idPerNip.get(nip)!, ...s });
      for (const bagian of potong(jt, 1000)) await tx.nominatifBulananJabatanTambahan.createMany({ data: bagian });
      for (const bagian of potong(h.catatan, 1000)) {
        await tx.barisGagalUpload.createMany({ data: bagian.map((c) => ({ uploadBatchId: batch.id, nomorBaris: c.nomorBaris, nipDimaksud: c.nipDimaksud, alasan: c.alasan })) });
      }
      return { batchId: batch.id, ringkasan };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}
