/**
 * Paritas Rekap Individual (data asli, lokal) terhadap RekapIndividualService + RekapIndividualController (cari) +
 * RekapIndividualMassalController (kandidat) + RekapIndividualExport/MassalExport KDS2 lewat oracle: dokumen satu pegawai
 * (identitas, 12 bulan, total, persen, sel hasil koreksi, keterangan koreksi), pencarian (LIKE, wildcard, urutan, batas 30),
 * kandidat massal (filter, urutan TK + seri), dan isi sheet ekspor. Tes ini TIDAK mencetak isi data pegawai.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { nipNonaktif } from "@/lib/laporan/filter";
import { barisEksporIndividual, bangunRekapIndividual, cariPegawaiIndividual, judulSheetMassal, kandidatMassal, type LaporanIndividual } from "@/lib/laporan/rekapIndividual";

import { hasil, oracleTersedia, tanyaOracle } from "../support/oracle";

const url = process.env.PARITAS_DATABASE_URL;
const jalan = Boolean(url) && (await oracleTersedia());

/** PHP mengeluarkan array kosong sebagai [] meskipun bertipe peta: samakan ke {}. Urutan kunci peta tidak bermakna (hanya dibaca per kunci). */
const peta = (v: unknown) => (Array.isArray(v) && v.length === 0 ? {} : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v);
function samakan(l: LaporanIndividual | null): unknown {
  if (!l) return null;
  return {
    ...l,
    bulan: Object.fromEntries(Object.entries(l.bulan).map(([b, x]) => [b, x.ada ? { ...x, tanda: peta(x.tanda), nilai: peta(x.nilai) } : x])),
  };
}
const dariOracle = (o: Record<string, unknown> | null): unknown => {
  if (!o) return null;
  const bulan = o.bulan as Record<string, Record<string, unknown>>;
  return { ...o, bulan: Object.fromEntries(Object.entries(bulan).map(([b, x]) => [b, x.ada ? { ...x, tanda: peta(x.tanda), nilai: peta(x.nilai) } : x])) };
};

describe.skipIf(!jalan)("paritas Rekap Individual KDS2 <-> KDS Terpadu", () => {
  let db: PrismaClient;
  let nips: string[] = [];
  let nama: Map<string, string>;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    const nominatif = await db.nominatifBulanan.findMany({ where: { tahun: 2026 }, select: { pegawaiNip: true, nama: true, jenisPegawaiKode: true, bulan: true }, orderBy: { id: "asc" } });
    nama = new Map(nominatif.map((n) => [n.pegawaiNip, n.nama]));
    const unik = [...nama.keys()];
    const jenis = new Map(nominatif.map((n) => [n.pegawaiNip, n.jenisPegawaiKode]));
    const nonaktif = await nipNonaktif(db, 2026);
    const koreksi = (await db.koreksiRekap.findMany({ select: { nip: true } })).map((k) => k.nip);
    const catatan = (await db.catatanStatusPegawai.findMany({ select: { nip: true } })).map((c) => c.nip);
    const langkah = <T,>(a: T[], n: number) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / n)) === 0).slice(0, n);
    nips = [...new Set([
      ...langkah(unik.filter((n) => ["DSN", "TDK"].includes(jenis.get(n)!)), 30), ...langkah(nonaktif, 8), ...langkah(unik.filter((n) => jenis.get(n) === "AKL"), 4),
      ...langkah([...new Set(koreksi)], 8), ...langkah(catatan, 4), "000000000000000000", "abc",
    ])];
  }, 120_000);
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("dokumen satu pegawai (2026 dan 2025) identik untuk sampel yang beragam", async () => {
    const permintaan = [2026, 2025].flatMap((tahun) => nips.map((nip, i) => ({ id: `b${tahun}-${i}`, laporan: "rekapIndividual.bangun", params: { nip, tahun } })));
    const h = await tanyaOracle(permintaan);
    let ada = 0;
    let adaKoreksi = 0;
    const beda: string[] = [];
    for (const tahun of [2026, 2025]) {
      for (const [i, nip] of nips.entries()) {
        const o = hasil<Record<string, unknown> | null>(h, `b${tahun}-${i}`);
        const t = await bangunRekapIndividual(db, nip, tahun);
        if (t) ada++;
        if (t && t.keteranganKoreksi.length > 0) adaKoreksi++;
        if (JSON.stringify(samakan(t)) !== JSON.stringify(dariOracle(o))) {
          // bandingkan secara terstruktur untuk menemukan kolom yang beda tanpa mencetak data pegawai
          const kunciBeda = Object.keys({ ...(t ?? {}), ...(o ?? {}) }).filter((k) => JSON.stringify((samakan(t) as Record<string, unknown>)?.[k]) !== JSON.stringify((dariOracle(o) as Record<string, unknown>)?.[k]));
          beda.push(`${tahun}#${i}: ${kunciBeda.join(",")}`);
        }
      }
    }
    console.info(`[paritas] dokumen individual: ${nips.length * 2} permintaan, ${ada} berisi, ${adaKoreksi} bertanda koreksi`);
    expect(beda).toEqual([]);
    expect(ada).toBeGreaterThan(40);
  }, 600_000);

  it("pencarian: potongan nama/NIP, huruf besar/kecil, wildcard LIKE, tanpa hasil, dan batas 30", async () => {
    const contoh = [...nama.entries()].filter((_, i) => i % 211 === 0).slice(0, 6);
    const kata = new Set<string>(["zzzzqq", "%", "_", "a_i", "an", "AN", "i", "\\_", "\\%", "00", ""]);
    for (const [nip, n] of contoh) {
      kata.add(n.slice(0, 4));
      kata.add(n.slice(2, 6).toUpperCase());
      kata.add(n.split(" ").pop()!);
      kata.add(nip.slice(-6));
      kata.add(nip);
    }
    const daftar = [...kata].filter((k) => k !== "" || true);
    const h = await tanyaOracle(daftar.flatMap((cari, i) => [2026, 2025].map((tahun) => ({ id: `c${i}-${tahun}`, laporan: "rekapIndividual.cari", params: { cari, tahun } }))));
    const beda: string[] = [];
    let adaBanyak = false;
    for (const [i, cari] of daftar.entries()) {
      for (const tahun of [2026, 2025]) {
        const o = hasil<{ nip: string; nama: string }[]>(h, `c${i}-${tahun}`);
        const t = (await cariPegawaiIndividual(db, cari, tahun)).map((x) => ({ nip: x.nip, nama: x.nama }));
        if (o.length === 30) adaBanyak = true;
        if (JSON.stringify(t) !== JSON.stringify(o)) beda.push(`kata#${i}/${tahun}: baru=${t.length} kds2=${o.length}`);
      }
    }
    expect(beda).toEqual([]);
    expect(adaBanyak).toBe(true);
  }, 600_000);

  it("kandidat massal: kombinasi tahun, jenis, status, keaktifan, dan batas TK", async () => {
    const status = (await db.statusKepegawaian.findMany({ orderBy: { nama: "asc" }, select: { kode: true } })).map((s) => s.kode);
    const kasus = [
      { id: "bawaan", tahun: 2026, jenis: [], status: [], keaktifan: "aktif", minTk: 20 }, { id: "semua-0", tahun: 2026, jenis: [], status: [], keaktifan: "semua", minTk: 0 },
      { id: "nonaktif-5", tahun: 2026, jenis: [], status: [], keaktifan: "nonaktif", minTk: 5 }, { id: "dsn", tahun: 2026, jenis: ["DSN"], status: [], keaktifan: "semua", minTk: 3 },
      { id: "tdk-status", tahun: 2026, jenis: ["TDK"], status: status.slice(0, 2), keaktifan: "aktif", minTk: 1 }, { id: "2025", tahun: 2025, jenis: [], status: [], keaktifan: "semua", minTk: 10 },
      { id: "tinggi", tahun: 2026, jenis: [], status: [], keaktifan: "semua", minTk: 366 },
    ];
    const h = await tanyaOracle(kasus.map((k) => ({ id: k.id, laporan: "rekapIndividual.kandidat", params: k })));
    const beda: string[] = [];
    let total = 0;
    for (const k of kasus) {
      const o = hasil<unknown[]>(h, k.id);
      const t = await kandidatMassal(db, k.tahun, { jenis: k.jenis, status: k.status, keaktifan: k.keaktifan as "aktif" }, k.minTk);
      total += t.length;
      if (JSON.stringify(t) !== JSON.stringify(o)) beda.push(`${k.id}: baru=${t.length} kds2=${o.length}`);
    }
    console.info(`[paritas] kandidat massal: ${kasus.length} kombinasi, ${total} baris dibandingkan`);
    expect(beda).toEqual([]);
    expect(total).toBeGreaterThan(100);
  }, 600_000);

  it("isi sheet ekspor individual dan judul sheet ekspor massal identik", async () => {
    const sampel = nips.filter((n) => n.length > 5).slice(0, 12);
    const h = await tanyaOracle([
      ...sampel.map((nip, i) => ({ id: `e${i}`, laporan: "rekapIndividual.ekspor", params: { nip, tahun: 2026 } })),
      { id: "massal", laporan: "rekapIndividual.eksporMassal", params: { nips: [...sampel, ...sampel.slice(0, 3)], tahun: 2026 } },
    ]);
    const beda: string[] = [];
    let diperiksa = 0;
    for (const [i, nip] of sampel.entries()) {
      const l = await bangunRekapIndividual(db, nip, 2026);
      if (!l) continue;
      diperiksa++;
      const o = hasil<{ judul: string; baris: unknown[][] }>(h, `e${i}`);
      if (o.judul !== "Rekap Individual" || JSON.stringify(barisEksporIndividual(l)) !== JSON.stringify(o.baris)) beda.push(`ekspor#${i}`);
    }
    const laporan = (await Promise.all([...new Set([...sampel, ...sampel.slice(0, 3)])].map((n) => bangunRekapIndividual(db, n, 2026)))).filter((x): x is LaporanIndividual => x !== null);
    const sheets = hasil<{ judul: string; baris: unknown[][] }[]>(h, "massal");
    expect(judulSheetMassal(laporan)).toEqual(sheets.map((s) => s.judul));
    expect(laporan.map((l) => JSON.stringify(barisEksporIndividual(l)))).toEqual(sheets.map((s) => JSON.stringify(s.baris)));
    expect(diperiksa).toBeGreaterThan(5);
    expect(beda).toEqual([]);
  }, 600_000);
});
