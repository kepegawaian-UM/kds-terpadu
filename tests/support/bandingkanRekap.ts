/**
 * Pembanding bersama untuk tes paritas Rekap Bulanan/Tahunan: membandingkan hasil KDS Terpadu dengan data
 * oracle (kode KDS2 asli) baris demi baris. Dipakai oleh tes per-modul dan rangkaian paritas penuh.
 * Pesan gagal hanya memuat indeks/nama bagian yang berbeda, tidak pernah isi baris (NIP/nama).
 */
import type { PrismaClient } from "@prisma/client";
import { expect } from "vitest";

import type { Keaktifan } from "@/lib/laporan/filter";
import { laporanRekapBulanan } from "@/lib/laporan/rekapBulanan";
import { laporanRekapTahunan } from "@/lib/laporan/rekapTahunan";
import { kunciNama } from "@/lib/laporan/urutNama";

export type FilterUji = { jenis: string[]; status: string[]; keaktifan: Keaktifan };

export type OracleBulanan = {
  bulan: number;
  tahun: number;
  jenis: string[];
  status: string[];
  keaktifan: string;
  namaFile: string;
  komponen: { kode: string; nama: string }[];
  baris: {
    id: number;
    nip: string;
    nama: string;
    nilai: Record<string, string> | null;
    badge: [string, string] | null;
    tandai: Record<string, string>;
  }[];
};

export type OracleTahunan = {
  tahun: number;
  jenis: string[];
  status: string[];
  keaktifan: string;
  namaFile: string;
  komponen: { kode: string; nama: string; tipe: string }[];
  baris: { id: number; nip: string; nama: string; badge: [string, string] | null; sel: string[] }[];
};

const entri = (o: Record<string, string> | null | undefined) => JSON.stringify(Object.entries(o ?? {}).sort());

export async function bandingkanRekapBulanan(db: PrismaClient, id: string, o: OracleBulanan, filter: FilterUji, bulan: number, tahun: number) {
  const s = await laporanRekapBulanan(db, bulan, tahun, filter);
  expect(s.namaFile, `namaFile ${id}`).toBe(o.namaFile);
  expect({ jenis: s.jenis, status: s.status, keaktifan: s.keaktifan }, `filter ${id}`).toEqual({
    jenis: o.jenis,
    status: o.status,
    keaktifan: o.keaktifan,
  });
  expect(s.komponen, `komponen ${id}`).toEqual(o.komponen);
  expect(s.baris.length, `jumlah baris ${id}`).toBe(o.baris.length);
  const beda: { posisi: number; bagian: string[] }[] = [];
  o.baris.forEach((b, i) => {
    const x = s.baris[i];
    const bagian = [
      x.id !== b.id && "id/urutan",
      x.nip !== b.nip && "nip",
      x.nama !== b.nama && "nama",
      (x.nilai === null) !== (b.nilai === null) && "nilai-ada",
      entri(x.nilai) !== entri(b.nilai) && "nilai",
      JSON.stringify(x.badge) !== JSON.stringify(b.badge) && "badge",
      entri(x.tandai) !== entri(b.tandai) && "tandai",
    ].filter(Boolean) as string[];
    if (bagian.length) beda.push({ posisi: i, bagian });
  });
  expect(beda.slice(0, 5), `baris berbeda ${id}: ${beda.length}`).toEqual([]);
}

export async function bandingkanRekapTahunan(db: PrismaClient, id: string, o: OracleTahunan, filter: FilterUji, tahun: number) {
  const s = await laporanRekapTahunan(db, tahun, filter);
  expect(s.namaFile, `namaFile ${id}`).toBe(o.namaFile);
  expect({ jenis: s.jenis, status: s.status, keaktifan: s.keaktifan }, `filter ${id}`).toEqual({
    jenis: o.jenis,
    status: o.status,
    keaktifan: o.keaktifan,
  });
  expect(s.komponen.map((k) => [k.kode, k.nama, k.tipeNilai]), `komponen ${id}`).toEqual(o.komponen.map((k) => [k.kode, k.nama, k.tipe]));
  expect(s.baris.length, `jumlah baris ${id}`).toBe(o.baris.length);
  const beda: { posisi: number; bagian: string[] }[] = [];
  o.baris.forEach((b, i) => {
    const x = s.baris[i];
    const sel = s.komponen.map((k) => x.sel[k.kode]);
    const bagian = [
      x.id !== b.id && "id/urutan",
      x.nip !== b.nip && "nip",
      x.nama !== b.nama && "nama",
      JSON.stringify(x.badge) !== JSON.stringify(b.badge) && "badge",
      JSON.stringify(sel) !== JSON.stringify(b.sel) && "total",
    ].filter(Boolean) as string[];
    if (bagian.length) beda.push({ posisi: i, bagian });
  });
  expect(beda.slice(0, 5), `baris berbeda ${id}: ${beda.length}`).toEqual([]);
}

/**
 * Baris berurutan yang namanya sama menurut kolasi (huruf besar/kecil, aksen) dianggap satu kelompok seri dan
 * diurut menurut NIP: urutan di dalam kelompok itu TIDAK ditentukan di KDS2 (filesort MySQL tidak stabil,
 * terbukti: pada 2.871 baris tidak mengikuti id/NIP naik maupun turun), jadi dibandingkan sebagai himpunan.
 */
export function normalisasiSeri(rows: unknown[][]): unknown[][] {
  const hasil: unknown[][] = [];
  for (let i = 0; i < rows.length; ) {
    let j = i + 1;
    while (j < rows.length && kunciNama(String(rows[j][1])) === kunciNama(String(rows[i][1]))) j++;
    hasil.push(...rows.slice(i, j).sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)));
    i = j;
  }
  return hasil;
}

/** Bandingkan hasil ekspor (judul + baris) dengan oracle; urutan antar-nama kembar tidak dipersoalkan. */
export function bandingkanEkspor(id: string, o: { headings: string[]; rows: unknown[][] }, s: { headings: string[]; rows: unknown[][] }) {
  expect(s.headings, `judul ${id}`).toEqual(o.headings);
  expect(s.rows.length, `jumlah baris ekspor ${id}`).toBe(o.rows.length);
  const no = normalisasiSeri(o.rows);
  const ns = normalisasiSeri(s.rows);
  const beda = no.reduce<number>((n, r, i) => n + (JSON.stringify(r) === JSON.stringify(ns[i]) ? 0 : 1), 0);
  expect(beda, `baris ekspor berbeda ${id}`).toBe(0);
}
