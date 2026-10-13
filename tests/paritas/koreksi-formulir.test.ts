/**
 * PARITAS validasi formulir Koreksi Rekap (F4.2b): KoreksiRekapRequest KDS2 ASLI (oracle PHP) dan validasiKoreksi baru menerima
 * masukan yang SAMA; kolom yang ditolak harus identik, dan pesan buatan KDS2 (messages()) persis. Pesan aturan dasar berbahasa
 * Indonesia sengaja berbeda dari KDS2 (Inggris) dan tidak dibandingkan teksnya.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { bersihkanKoreksi, type FormKoreksi, KOLOM_KOREKSI, PESAN_KOREKSI, validasiKoreksi } from "@/lib/koreksi/validasi";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";
import { jalankanOracleKoreksi, oracleImporTersedia } from "../support/oracleImpor";

const ada = Boolean(process.env.TEST_DATABASE_URL) && (await oracleImporTersedia());
const NIP = "198001012005011001";
const dasar: FormKoreksi = { jenis: "periode", nip: NIP, dari_komponen: "TK", ke_komponen: "TB", tanggal_mulai: "2026-09-01", tanggal_selesai: "", alasan: "uji" };
const angka: FormKoreksi = { jenis: "angka", nip: NIP, dari_komponen: "TK", ke_komponen: "TB", bulan: "9", tahun: "2026", jumlah_hari: "3", alasan: "uji" };
const khusus = new Set<string>(Object.values(PESAN_KOREKSI));

const KASUS: [string, FormKoreksi][] = [
  ["periode-valid", dasar], ["angka-valid", angka], ["ke-kosong", { ...dasar, ke_komponen: "" }], ["selesai-sama-mulai", { ...dasar, tanggal_selesai: "2026-09-01" }],
  ["jenis-kosong", { ...dasar, jenis: "" }], ["jenis-salah", { ...dasar, jenis: "bulanan" }],
  ["nip-kosong", { ...dasar, nip: "" }], ["nip-tak-ada", { ...dasar, nip: "123456789012345678" }], ["nip-terlalu-panjang", { ...dasar, nip: "1".repeat(19) }],
  ["dari-kosong", { ...dasar, dari_komponen: "" }], ["dari-bukan-komponen-angka", { ...dasar, dari_komponen: "TOTAL" }], ["dari-tak-ada", { ...dasar, dari_komponen: "XX" }],
  ["ke-bukan-komponen-angka", { ...dasar, ke_komponen: "JENIS_SHIFT" }], ["ke-sama-dengan-dari", { ...dasar, ke_komponen: "TK" }], ["ke-tak-ada-dan-sama", { ...dasar, dari_komponen: "XX", ke_komponen: "XX" }],
  ["periode-mulai-kosong", { ...dasar, tanggal_mulai: "" }], ["periode-mulai-salah", { ...dasar, tanggal_mulai: "bukan tanggal" }], ["selesai-salah", { ...dasar, tanggal_selesai: "bukan tanggal" }],
  ["selesai-sebelum-mulai", { ...dasar, tanggal_selesai: "2026-08-31" }], ["selesai-tanpa-mulai-angka", { ...angka, tanggal_selesai: "2026-01-01" }],
  ["selesai-tanpa-mulai-periode", { ...dasar, tanggal_mulai: "", tanggal_selesai: "2026-01-01" }],
  ["angka-bulan-kosong", { ...angka, bulan: "" }], ["angka-tahun-kosong", { ...angka, tahun: "" }], ["angka-hari-kosong", { ...angka, jumlah_hari: "" }],
  ["angka-bulan-13", { ...angka, bulan: "13" }], ["angka-bulan-0", { ...angka, bulan: "0" }], ["angka-tahun-2019", { ...angka, tahun: "2019" }], ["angka-tahun-2101", { ...angka, tahun: "2101" }],
  ["angka-hari-0", { ...angka, jumlah_hari: "0" }], ["angka-hari-32", { ...angka, jumlah_hari: "32" }], ["angka-hari-desimal", { ...angka, jumlah_hari: "2.5" }], ["angka-bulan-huruf", { ...angka, bulan: "sembilan" }],
  ["angka-batas-pas", { ...angka, bulan: "12", tahun: "2100", jumlah_hari: "31" }], ["angka-batas-bawah", { ...angka, bulan: "1", tahun: "2020", jumlah_hari: "1" }],
  ["periode-dengan-angka-isi-salah", { ...dasar, bulan: "99", tahun: "1", jumlah_hari: "abc" }], ["periode-dengan-angka-kosong", { ...dasar, bulan: "", tahun: "", jumlah_hari: "" }],
  ["alasan-kosong", { ...dasar, alasan: "" }], ["alasan-255", { ...dasar, alasan: "a".repeat(255) }], ["alasan-256", { ...dasar, alasan: "a".repeat(256) }],
  ["sumber-150", { ...dasar, sumber: "s".repeat(150) }], ["sumber-151", { ...dasar, sumber: "s".repeat(151) }],
  ["semua-kosong", {}], ["banyak-galat", { jenis: "angka", nip: "x", dari_komponen: "XX", ke_komponen: "XX", alasan: "", bulan: "13", tahun: "1", jumlah_hari: "0" }],
];

function acak(): [string, FormKoreksi][] {
  let s = 20261013;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pilih = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const hasil: [string, FormKoreksi][] = [];
  for (let i = 0; i < 150; i++) {
    hasil.push([`acak-${i}`, {
      jenis: pilih(["periode", "angka", "angka", "", "x"]), nip: pilih([NIP, NIP, "", "999", "1".repeat(19)]), dari_komponen: pilih(["TK", "TB", "", "XX", "TOTAL", "CTH"]),
      ke_komponen: pilih(["TB", "TK", "", "", "XX", "CTH"]), tanggal_mulai: pilih(["2026-09-01", "", "salah", "2026-10-01"]), tanggal_selesai: pilih(["", "", "2026-08-01", "2026-12-31", "salah"]),
      bulan: pilih(["9", "", "13", "0", "x", "1"]), tahun: pilih(["2026", "", "2019", "2101", "x"]), jumlah_hari: pilih(["3", "", "0", "32", "x", "31"]),
      alasan: pilih(["a", "", "b".repeat(256)]), sumber: pilih(["", "", "s".repeat(151), "ok"]),
    }]);
  }
  return hasil;
}

const ringkas = (g: Record<string, string[]> | null | undefined) => (g ? Object.fromEntries(Object.keys(g).sort().map((k) => [k, g[k].filter((m) => khusus.has(m))])) : null);

describe.skipIf(!ada)("Paritas validasi formulir Koreksi terhadap KoreksiRekapRequest KDS2 asli", () => {
  const prisma = new PrismaClient();
  const semua = [...KASUS, ...acak()];
  let oracle: Record<string, { langkah: { hasil: { galat: Record<string, string[]> | null }; galat: string | null }[] }>;

  beforeAll(async () => {
    oracle = (await jalankanOracleKoreksi([
      { id: "v", keadaan: { nominatif: [{ nip: NIP, bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" }] }, langkah: semua.map(([, f]) => ({ op: "validasi", input: bersihkanKoreksi(f) })) },
    ])) as typeof oracle;
    await kosongkanDomain(prisma);
    await muatKeadaan(prisma, { nominatif: [{ nip: NIP, bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" }] });
  }, 280_000);

  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.$disconnect();
  });

  it("semua kasus: kolom yang ditolak dan pesan buatan KDS2 identik", async () => {
    const beda: string[] = [];
    for (const [i, [nama, form]] of semua.entries()) {
      const l = oracle.v.langkah[i];
      expect(l.galat, `oracle galat di ${nama}: ${l.galat}`).toBeNull();
      const { galat } = await validasiKoreksi(prisma, form);
      const mine = Object.keys(galat).length ? ringkas(galat as Record<string, string[]>) : null;
      if (JSON.stringify(mine) !== JSON.stringify(ringkas(l.hasil.galat))) beda.push(`${nama}: baru=${JSON.stringify(mine)} kds2=${JSON.stringify(ringkas(l.hasil.galat))}`);
    }
    expect(beda).toEqual([]);
  }, 120_000);

  it("katalog bermakna: ada kasus valid dan ditolak, semua kolom pernah ditolak", () => {
    const hasil = semua.map((_, i) => oracle.v.langkah[i].hasil.galat);
    expect(hasil.filter((g) => g === null).length).toBeGreaterThan(5);
    expect(hasil.filter((g) => g !== null).length).toBeGreaterThan(40);
    const kolomDitolak = new Set(hasil.flatMap((g) => Object.keys(g ?? {})));
    for (const k of KOLOM_KOREKSI) expect(kolomDitolak.has(k), k).toBe(true);
  });
});
