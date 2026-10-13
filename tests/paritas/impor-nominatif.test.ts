/**
 * PARITAS importer Nominatif Bulanan (F4.3a): NominatifBulananImporter + KontrakNominatif KDS2 ASLI (oracle PHP di SQLite
 * memori, dengan tabel master DIGANTI isi master kds_test supaya nama->kode identik) dan importer baru (kds_test) memproses
 * keadaan awal dan berkas yang SAMA; hasil tersimpan harus identik: batch, pegawai, nominatif (semua kolom), jabatan
 * tambahan, dan baris catatan (gagal + peringatan) beserta teks dan nomor barisnya. Berkas dua arah (exceljs/PhpSpreadsheet).
 * Id baris dibandingkan menurut URUTAN (PostgreSQL menghabiskan nomor urut saat upsert berbenturan; SQLite tidak).
 * Format tanggal yang diuji = yang diterima KDS2 dan importer baru dengan hasil sama (beda sengaja: tests/unit/tanggal.test.ts).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { simpanNominatif } from "@/lib/impor/nominatif";
import { KesalahanUpload } from "@/lib/upload/konstanta";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { type KeadaanLengkap, muatKeadaan } from "../support/keadaan";
import { jalankanOracleNominatif, oracleImporTersedia, type Sel } from "../support/oracleImpor";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleImporTersedia());

const HEADER = [
  "NIP", "Nama", "Jenis Kelamin", "Tanggal Lahir", "Pendidikan Terakhir", "Agama", "Jenis Pegawai", "Status Kepegawaian", "Golongan",
  "Jabatan Fungsional/Fungsi Umum", "Kategori Akademisi Luar", "Unit Kerja", "Tanggal Mulai Kerja (TMT)", "Jabatan Tambahan 1", "Unit/Prodi 1",
  "Status Pengangkatan 1", "Jabatan Tambahan 2", "Unit/Prodi 2", "Status Pengangkatan 2", "Jabatan Tambahan 3", "Unit/Prodi 3", "Status Pengangkatan 3",
];
const HEADER_LAMA = [...HEADER.slice(0, 19), "Catatan Bandingkan Batch", "x", "y"]; // berkas lama tanpa blok Jabatan Tambahan 3

type Master = {
  unit: string[]; unitKode: string[]; prodi: string[]; dosen: string[]; tendik: string[]; umum: string[]; akl: string[]; role: string[];
};
type Kasus = { id: string; keadaan: KeadaanLengkap; header?: string[]; baris: Sel[][]; bulan?: number; tahun?: number };

const nip = (n: number) => `19800101200501${String(n).padStart(4, "0")}`;

type OpsiBaris = { sel?: Record<number, Sel> };
const baris = (m: Master, n: Sel, jenis: "DSN" | "TDK" | "AKL", o: OpsiBaris = {}): Sel[] => {
  const dasar: Sel[] = [
    n, `Nama ${n}`, "L", "1990-05-17", "S1", "Islam", jenis === "DSN" ? "Dosen" : jenis === "TDK" ? "Tendik" : "Akademisi Luar UM", "PNS", "III/a",
    jenis === "DSN" ? m.dosen[1] : jenis === "TDK" ? m.tendik[0] : "", jenis === "AKL" ? m.akl[0] : "", m.unit[0], "2018-03-04",
    "", "", "", "", "", "", "", "", "",
  ];
  for (const [i, v] of Object.entries(o.sel ?? {})) dasar[Number(i)] = v;
  return dasar;
};

function buatKasus(m: Master): Kasus[] {
  const K: Kasus[] = [];
  const sk = { nominatif: [] as NonNullable<KeadaanLengkap["nominatif"]> };

  K.push({
    id: "dasar",
    keadaan: {},
    baris: [
      baris(m, nip(1), "DSN"), baris(m, nip(2), "TDK"), baris(m, nip(3), "TDK", { sel: { 9: m.umum[0] } }), baris(m, nip(4), "AKL"),
      baris(m, nip(5), "DSN", { sel: { 7: "PTNA", 8: "III/a" } }), // Non-ASN dengan golongan valid: disimpan
      baris(m, nip(6), "DSN", { sel: { 7: "PTNA", 8: "-" } }), // Non-ASN golongan tak dikenal: diabaikan
      baris(m, nip(7), "TDK", { sel: { 7: "PTT", 8: "" , 3: "", 4: "", 5: ""} }), // tanggal lahir/pendidikan/agama kosong
    ],
  });

  K.push({
    id: "galat-per-kolom",
    keadaan: {},
    baris: [
      baris(m, nip(1), "DSN", { sel: { 1: "" } }), // nama kosong
      baris(m, nip(2), "DSN", { sel: { 2: "X" } }), // JK
      baris(m, nip(3), "DSN", { sel: { 2: "p" } }), // JK huruf kecil: diterima
      baris(m, nip(4), "DSN", { sel: { 3: "13/13/1990" } }), // tanggal lahir tak valid
      baris(m, nip(5), "DSN", { sel: { 6: "Alien" } }), // jenis pegawai
      baris(m, nip(6), "DSN", { sel: { 7: "Entah" } }), // status
      baris(m, nip(7), "DSN", { sel: { 8: "" } }), // ASN tanpa golongan
      baris(m, nip(8), "DSN", { sel: { 8: "X/z" } }), // golongan tak ada
      baris(m, nip(9), "DSN", { sel: { 9: "Jabatan Tidak Ada" } }), // jabfung dosen
      baris(m, nip(10), "TDK", { sel: { 9: "Jabatan Tidak Ada" } }), // jabfung tendik/umum
      baris(m, nip(11), "AKL", { sel: { 10: "Kategori Tidak Ada" } }), // kategori AKL
      baris(m, nip(12), "DSN", { sel: { 11: "Unit Tidak Ada" } }), // unit
      baris(m, nip(13), "DSN", { sel: { 12: "" } }), // TMT kosong
      baris(m, nip(14), "DSN", { sel: { 12: "31-31-2018" } }), // TMT tak valid
      baris(m, nip(15), "DSN", { sel: { 1: "", 2: "Q", 6: "Alien", 7: "Entah", 11: "Unit Tidak Ada", 12: "" } }), // banyak galat sekaligus
      baris(m, nip(16), "DSN", { sel: { 1: "", 2: "Q", 6: "Alien" + "x".repeat(150), 7: "Entah" + "y".repeat(150), 11: "Unit" + "z".repeat(60) } }), // pesan > 255 karakter
      baris(m, nip(17), "AKL", { sel: { 9: "tidak dipakai untuk AKL" } }), // AKL: jabfung diabaikan
      baris(m, nip(18), "DSN", { sel: { 10: "Kategori Tidak Ada" } }), // kategori hanya untuk AKL: diabaikan
    ],
  });

  K.push({
    id: "normalisasi-dan-alias",
    keadaan: {},
    baris: [
      baris(m, nip(1), "DSN", { sel: { 6: "DOSEN", 7: "  pegawai negeri sipil ", 11: m.unit[0].toUpperCase() } }),
      baris(m, nip(2), "DSN", { sel: { 6: "dsn", 7: "pns", 9: m.dosen[0].toUpperCase() } }), // kode sebagai nama, huruf besar
      baris(m, nip(3), "DSN", { sel: { 9: "Tenaga Pengajar" } }), // alias lama
      baris(m, nip(4), "TDK", { sel: { 9: "Laboran" } }), // alias
      baris(m, nip(5), "TDK", { sel: { 9: m.tendik[1].replace(/ /, "   ") } }), // spasi ganda
      baris(m, nip(6), "DSN", { sel: { 11: m.unit[1].replace(/ /g, ",  ") } }), // koma dan spasi ganda
      baris(m, nip(7), "DSN", { sel: { 11: "Asrama Matahari, Kampus II UM" } }), // alias asrama
      baris(m, nip(8), "DSN", { sel: { 11: m.unit[0] + " " } }), // NBSP tidak ikut trim: tak ditemukan
    ],
  });

  K.push({
    id: "jabatan-tambahan",
    keadaan: {},
    baris: [
      baris(m, nip(1), "DSN", { sel: { 13: m.role[0], 14: m.unit[0], 15: "Definitif" } }), // slot 1 unit
      baris(m, nip(2), "DSN", { sel: { 13: m.role[0], 14: m.prodi[0], 15: "Plt", 16: m.role[1], 17: m.unit[1], 18: "Pjs", 19: m.role[2], 20: m.prodi[1], 21: "Definitif" } }), // 3 slot, prodi
      baris(m, nip(3), "DSN", { sel: { 13: "Role Tidak Ada", 14: m.unit[0], 15: "Definitif", 16: m.role[0], 17: "", 18: "Definitif" } }), // role tak dikenal dilewati; slot 2 tanpa unit
      baris(m, nip(4), "DSN", { sel: { 13: m.role[0], 14: "Unit Tidak Ada", 15: "Definitif" } }), // unit/prodi tak ditemukan: disimpan tanpa
      baris(m, nip(5), "DSN", { sel: { 13: m.role[0], 14: m.unit[0], 15: "definitif", 16: m.role[1], 17: m.unit[0], 18: "" } }), // status tak valid (huruf kecil / kosong): dilewati
      baris(m, nip(6), "DSN", { sel: { 13: "", 14: m.unit[0], 15: "Definitif", 19: m.role[0], 20: m.unit[1], 21: "Plt" } }), // slot 1 kosong, slot 3 ada
    ],
  });

  K.push({
    id: "berkas-lama-tanpa-slot3",
    keadaan: {},
    header: HEADER_LAMA,
    baris: [baris(m, nip(1), "DSN", { sel: { 13: m.role[0], 14: m.unit[0], 15: "Definitif", 19: m.role[1], 20: m.unit[0], 21: "Plt" } })], // slot 3 tidak dibaca
  });

  K.push({
    id: "nip",
    keadaan: {},
    baris: [
      baris(m, nip(1), "DSN"), baris(m, nip(2), "DSN"), baris(m, nip(1), "TDK", { sel: { 1: "Ganda Terakhir" } }), // ganda: terakhir menang
      baris(m, `'${nip(3)}`, "DSN"), baris(m, ` ${nip(4)} `, "DSN"), baris(m, 123456, "DSN"), baris(m, "ABC123", "DSN"), baris(m, null, "DSN"),
      baris(m, nip(2), "DSN", { sel: { 1: "" } }), // ganda tapi baris terakhir GAGAL: baris pertama (valid) tetap dipakai
      ["Catatan kaki: contoh pengisian", "x"],
    ],
  });

  K.push({
    id: "re-upload",
    keadaan: {
      nominatif: [
        { nip: nip(1), bulan: 9, tahun: 2026, jenis: "TDK", tmt: "2010-01-01", jt: [{ role: m.role[0], unit: m.unitKode[0], status: "Definitif" }, { role: m.role[1], unit: m.unitKode[1], status: "Plt" }] },
        { nip: nip(2), bulan: 9, tahun: 2026, jenis: "DSN", tmt: "2012-01-01", jt: [{ role: m.role[0], unit: m.unitKode[0], status: "Definitif" }] },
        { nip: nip(3), bulan: 9, tahun: 2026, jenis: "DSN", tmt: "2012-01-01" }, // tidak ada di berkas: tetap
        { nip: nip(1), bulan: 8, tahun: 2026, jenis: "TDK", tmt: "2010-01-01", jt: [{ role: m.role[2], unit: m.unitKode[0], status: "Pjs" }] }, // bulan lain: tak tersentuh
        { nip: nip(2), bulan: 9, tahun: 2025, jenis: "DSN", tmt: "2012-01-01" },
      ],
    },
    baris: [baris(m, nip(1), "DSN", { sel: { 1: "Baru Satu", 13: m.role[2], 14: m.unit[0], 15: "Plt" } }), baris(m, nip(2), "TDK"), baris(m, nip(4), "DSN")],
  });

  K.push({
    id: "header-salah",
    keadaan: {},
    header: [...HEADER.slice(0, 3), "Tempat Lahir", ...HEADER.slice(3, 21)], // kolom bergeser
    baris: [baris(m, nip(1), "DSN")],
  });
  K.push({ id: "header-kosong-kolom", keadaan: {}, header: [...HEADER.slice(0, 10), "", ...HEADER.slice(11)], baris: [baris(m, nip(1), "DSN")] });
  K.push({ id: "header-banyak-salah", keadaan: {}, header: HEADER.map((_, i) => `Kolom ${i}`), baris: [baris(m, nip(1), "DSN")] });
  K.push({ id: "header-huruf-besar-dan-tambahan", keadaan: {}, header: HEADER.map((h) => `  ${h.toUpperCase()} (wajib)`), baris: [baris(m, nip(1), "DSN")] });

  K.push({
    id: "format-tanggal",
    keadaan: {},
    baris: [
      ["2018-03-04", "1990-05-17"], ["2018-03-04 10:30:00", "1990-5-7"], ["2018-3-4", "1990/05/17"], ["04-03-2018", "17-05-1990"], ["04.03.2018", "17.05.1990"],
      ["20180304", "19900517"], ["4 January 2018", "17 May 1990"], ["4-Jan-2018", "17-May-1990"], ["Jan 4, 2018", "May 17, 1990"], ["31-12-2018", ""],
      [" 2018-03-04 ", " 1990-05-17 "],
    ].map(([tmt, lahir], i) => baris(m, nip(i + 1), "DSN", { sel: { 12: tmt, 3: lahir } })),
  });

  // acak bersemi tetap
  let s = 20261013;
  const acak = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pilih = <T,>(a: T[]): T => a[Math.floor(acak() * a.length)];
  const kunci = { ...sk };
  const rows: Sel[][] = [];
  for (let i = 0; i < 300; i++) {
    const jenis = pilih<"DSN" | "TDK" | "AKL">(["DSN", "DSN", "TDK", "TDK", "AKL"]);
    const sel: Record<number, Sel> = {};
    if (acak() < 0.1) sel[1] = "";
    if (acak() < 0.1) sel[2] = pilih(["X", "", "p", "l"]);
    if (acak() < 0.08) sel[6] = "Alien";
    if (acak() < 0.08) sel[7] = pilih(["Entah", "PNS", "PTNA", "PTT", "CPNS"]);
    if (acak() < 0.1) sel[8] = pilih(["", "II/b", "X/z", "-", "IV/a"]);
    if (acak() < 0.08) sel[11] = "Unit Tidak Ada";
    if (acak() < 0.08) sel[12] = pilih(["", "31-31-2018", "2020-02-29"]);
    if (acak() < 0.1) sel[9] = pilih([m.dosen[0], m.dosen[2], m.tendik[2], m.umum[1], "Tidak Ada", ""]);
    if (acak() < 0.1) sel[10] = pilih([m.akl[0], m.akl[1], "Tidak Ada", ""]);
    if (acak() < 0.15) Object.assign(sel, { 13: pilih([m.role[0], m.role[3], "Role?"]), 14: pilih([m.unit[0], m.prodi[0], "Unit?", ""]), 15: pilih(["Definitif", "Plt", "Pjs", "x"]) });
    if (acak() < 0.05) Object.assign(sel, { 16: m.role[1], 17: m.unit[1], 18: "Plt", 19: m.role[2], 20: m.prodi[1], 21: "Definitif" });
    const n = acak() < 0.06 ? 1 + Math.floor(acak() * 40) : i + 100; // sebagian NIP ganda
    rows.push(baris(m, acak() < 0.04 ? `'${nip(n)}` : nip(n), jenis, { sel }));
  }
  K.push({
    id: "acak",
    keadaan: { nominatif: [{ nip: nip(105), bulan: 9, tahun: 2026, jenis: "DSN", tmt: "2011-01-01", jt: [{ role: m.role[0], unit: m.unitKode[0], status: "Definitif" }] }, { nip: nip(110), bulan: 8, tahun: 2026, jenis: "TDK", tmt: "2011-01-01" }] },
    baris: rows,
  });
  void kunci;
  return K;
}

// ---------- penjalankan ----------
async function tulisXlsx(jalur: string, k: Kasus): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Nominatif Bulanan");
  ws.addRow(k.header ?? HEADER);
  k.baris.forEach((b) => ws.addRow(b.map((v) => (v !== null && typeof v === "object" ? { formula: v.f, result: v.v } : v))));
  await wb.xlsx.writeFile(jalur);
}

type Dump = {
  galat?: string | null;
  batch: Record<string, unknown> | null;
  pegawai: string[];
  nominatif: Record<string, unknown>[];
  jt: Record<string, unknown>[];
  catatan: unknown[];
};

/** Menyeragamkan id menjadi urutan (lihat catatan di kepala berkas) dan membuang kolom yang tak dibandingkan. */
function seragamkan(d: Dump) {
  const urutan = new Map<number, number>();
  const nominatif = d.nominatif.map((n, i) => {
    urutan.set(Number(n.id), i);
    const tanpaId: Record<string, unknown> = { ...n };
    delete tanpaId.id;
    const { tanggal_lahir, tanggal_mulai_kerja, ...sisa } = tanpaId;
    // SQLite menyimpan kolom date baris keadaan awal sebagai "Y-m-d 00:00:00": samakan ke tanggal murni
    const tgl = (v: unknown) => (v ? String(v).slice(0, 10) : null);
    return { urutan: i, ...sisa, tanggal_lahir: tgl(tanggal_lahir), tanggal_mulai_kerja: tgl(tanggal_mulai_kerja) };
  });
  return { ...d, nominatif, jt: d.jt.map((j) => ({ nominatif: urutan.get(Number(j.nominatif_bulanan_id)), role: j.jabatan_tambahan_role_kode, unit: j.unit_asal_kode, prodi: j.program_studi_kode, status: j.status_pengangkatan })) };
}

async function ambilDump(prisma: PrismaClient, batchId: number): Promise<Dump> {
  const b = await prisma.uploadBatch.findUniqueOrThrow({ where: { id: batchId } });
  const tgl = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const nominatif = (await prisma.nominatifBulanan.findMany({ orderBy: { id: "asc" } })).map((n) => ({
    id: n.id, nip: n.pegawaiNip, bulan: n.bulan, tahun: n.tahun, nama: n.nama, jenis_kelamin: n.jenisKelamin, tanggal_lahir: tgl(n.tanggalLahir),
    pendidikan_terakhir: n.pendidikanTerakhir, agama: n.agama, jenis_pegawai_kode: n.jenisPegawaiKode, status_kepegawaian_kode: n.statusKepegawaianKode,
    golongan_kode: n.golonganKode, jabatan_fungsional_dosen_kode: n.jabatanFungsionalDosenKode, jabatan_fungsional_tendik_kode: n.jabatanFungsionalTendikKode,
    jabatan_fungsi_umum_kode: n.jabatanFungsiUmumKode, kategori_akademisi_luar_kode: n.kategoriAkademisiLuarKode, unit_asal_kode: n.unitAsalKode,
    tanggal_mulai_kerja: tgl(n.tanggalMulaiKerja), upload_batch_id: n.uploadBatchId === batchId ? "baru" : "lama",
  }));
  const jt = (await prisma.nominatifBulananJabatanTambahan.findMany({ orderBy: { id: "asc" } })).map((j) => ({
    id: j.id, nominatif_bulanan_id: j.nominatifBulananId, jabatan_tambahan_role_kode: j.jabatanTambahanRoleKode, unit_asal_kode: j.unitAsalKode,
    program_studi_kode: j.programStudiKode, status_pengangkatan: j.statusPengangkatan,
  }));
  const catatan = (await prisma.barisGagalUpload.findMany({ where: { uploadBatchId: batchId }, orderBy: { id: "asc" } })).map((c) => [c.nomorBaris, c.nipDimaksud, c.alasan]);
  return {
    batch: { jenis: b.jenis, nama_file: b.namaFileAsli, diupload_oleh: b.diunggahOlehNama, total_baris: b.jumlahBarisTotal, baris_berhasil: b.jumlahBerhasil, baris_gagal: b.jumlahGagal },
    pegawai: (await prisma.pegawai.findMany({ orderBy: { nip: "asc" } })).map((p) => p.nip), nominatif, jt, catatan,
  };
}

const PREFIKS_MASTER: [string, string][] = [
  ["mst_jenis_pegawai", "jenisPegawai"], ["mst_status_kepegawaian", "statusKepegawaian"], ["mst_golongan", "golongan"], ["mst_jabatan_fungsional_dosen", "jabatanFungsionalDosen"],
  ["mst_jabatan_fungsional_tendik", "jabatanFungsionalTendik"], ["mst_jabatan_fungsi_umum_pelaksana", "jabatanFungsiUmumPelaksana"],
  ["mst_kategori_akademisi_luar", "kategoriAkademisiLuar"], ["mst_unit_asal", "unitAsal"], ["mst_program_studi", "programStudi"], ["mst_jabatan_tambahan_role", "jabatanTambahanRole"],
];

describe.skipIf(!ada)("Paritas importer Nominatif terhadap importer KDS2 asli", () => {
  const dir = mkdtempSync(join(tmpdir(), "kds-nom-"));
  const prisma = new PrismaClient();
  let kasus: Kasus[] = [];
  let oracle: Record<string, Dump & { galat: string | null }>;
  const jalur = (id: string, mode: "xl" | "php") => join(dir, `${id}.${mode}.xlsx`).replace(/\\/g, "/");

  beforeAll(async () => {
    const a = (rows: { nama: string }[]) => rows.map((r) => r.nama);
    const [unit, prodi, dosen, tendik, umum, akl, role] = await Promise.all([
      prisma.unitAsal.findMany({ orderBy: { kode: "asc" } }), prisma.programStudi.findMany({ orderBy: { kode: "asc" } }), prisma.jabatanFungsionalDosen.findMany({ orderBy: { kode: "asc" } }),
      prisma.jabatanFungsionalTendik.findMany({ orderBy: { kode: "asc" } }), prisma.jabatanFungsiUmumPelaksana.findMany({ orderBy: { kode: "asc" } }),
      prisma.kategoriAkademisiLuar.findMany({ orderBy: { kode: "asc" } }), prisma.jabatanTambahanRole.findMany({ orderBy: { kode: "asc" } }),
    ]);
    const master: Master = {
      unit: a(unit), unitKode: unit.map((u) => u.kode), prodi: a(prodi), dosen: a(dosen), tendik: tendik.map((t) => `${t.jabatanPokok} ${t.jenjang}`),
      umum: a(umum), akl: a(akl), role: role.map((r) => r.namaRole),
    };
    // unit "Asrama Matahari" harus ada untuk uji alias: bila tidak, alias tetap diuji lewat oracle (hasil sama = kedua menolak)
    kasus = buatKasus({ ...master, role: [...role.map((r) => r.namaRole)] });
    // kode role dipakai di keadaan (jt) -> gunakan kode, bukan nama
    const kodeRole = role.map((r) => r.kode);
    for (const k of kasus) for (const n of k.keadaan.nominatif ?? []) for (const j of n.jt ?? []) j.role = kodeRole[master.role.indexOf(j.role)] ?? j.role;

    const masterJson: Record<string, unknown[]> = {};
    for (const [tabel, model] of PREFIKS_MASTER) {
      masterJson[tabel] = await (prisma as unknown as Record<string, { findMany(a: unknown): Promise<unknown[]> }>)[model].findMany({ orderBy: { kode: "asc" } });
    }

    const kasusOracle = [];
    for (const k of kasus) {
      const dasar = { keadaan: k.keadaan, bulan: k.bulan ?? 9, tahun: k.tahun ?? 2026, namaFileAsli: "nominatif.xlsx" };
      await tulisXlsx(jalur(k.id, "xl"), k);
      kasusOracle.push({ ...dasar, id: `${k.id}.xl`, berkas: jalur(k.id, "xl") });
      kasusOracle.push({ ...dasar, id: `${k.id}.php`, berkas: jalur(k.id, "php"), tulisBerkas: { baris: [k.header ?? HEADER, ...k.baris], namaSheet: ["Nominatif Bulanan"] } });
    }
    oracle = (await jalankanOracleNominatif({ master: masterJson, kasus: kasusOracle })) as typeof oracle;
  }, 280_000);

  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  const nama = (id: string) => id;
  for (const id of ["dasar", "galat-per-kolom", "normalisasi-dan-alias", "jabatan-tambahan", "berkas-lama-tanpa-slot3", "nip", "re-upload", "header-salah", "header-kosong-kolom", "header-banyak-salah", "header-huruf-besar-dan-tambahan", "format-tanggal", "acak"]) {
    for (const mode of ["xl", "php"] as const) {
      it(`${nama(id)} [berkas ${mode === "xl" ? "ditulis exceljs, dibaca PhpSpreadsheet" : "ditulis PhpSpreadsheet, dibaca exceljs"}]`, async () => {
        const k = kasus.find((x) => x.id === id)!;
        const harapan = oracle[`${id}.${mode}`];
        await kosongkanDomain(prisma);
        await muatKeadaan(prisma, k.keadaan);

        const proses = () => simpanNominatif(prisma, readFileSync(jalur(id, mode)), "nominatif.xlsx", { bulan: k.bulan ?? 9, tahun: k.tahun ?? 2026 }, { id: null, nama: "oracle" });
        if (harapan.galat) {
          // berkas ditolak seluruhnya: pesan identik dan tidak ada yang tersimpan
          const sebelum = await prisma.nominatifBulanan.count();
          let pesan = "";
          try {
            await proses();
          } catch (e) {
            expect(e).toBeInstanceOf(KesalahanUpload);
            pesan = (e as Error).message;
          }
          expect(`ValidationException: ${pesan}`).toBe(harapan.galat);
          expect(await prisma.nominatifBulanan.count()).toBe(sebelum);
          return;
        }
        const { batchId } = await proses();
        const hasil = await ambilDump(prisma, batchId);
        expect(seragamkan(hasil)).toEqual(seragamkan({ ...harapan, galat: undefined }));
      }, 90_000);
    }
  }

  it("katalog bermakna: kasus acak memuat baris gagal, peringatan, dan jabatan tambahan", () => {
    const a = oracle["acak.xl"];
    expect(a.batch!.baris_berhasil as number).toBeGreaterThan(100);
    expect(a.batch!.baris_gagal as number).toBeGreaterThan(20);
    expect(a.catatan.some((c) => String((c as unknown[])[2]).startsWith("[PERINGATAN]"))).toBe(true);
    expect(a.jt.length).toBeGreaterThan(5);
    expect(oracle["header-salah.xl"].galat).toMatch(/Susunan kolom file tidak sesuai/);
    expect(oracle["dasar.xl"].nominatif.length).toBe(7);
  });
});
