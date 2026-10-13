import { ColumnMappingError } from "./types";

/**
 * File export mentah SIMPEGA punya beberapa nama kolom yang literally duplikat (kadang dengan
 * suffix "_2"/"_4" dst di file itu sendiri, kadang tanpa suffix sama sekali - mis. "NIP" muncul
 * 2x tanpa suffix). Suffix itu sendiri TIDAK stabil antar bulan (lihat perbandingan file Jan vs
 * Sep 2026 di plan), jadi resolusi duplikat di sini dilakukan lewat NORMALISASI nama (buang
 * suffix "_<angka>" di akhir) lalu diambil berdasar URUTAN KEMUNCULAN kolom itu di sheet -
 * urutan blok ini terbukti stabil meski indeks kolom absolut & angka suffix-nya bergeser.
 */
function normalizeHeaderName(raw: string): string {
  return raw.trim().replace(/_\d+$/, "");
}

type HeaderOccurrences = Map<string, number[]>; // nama ternormalisasi -> daftar index kolom (1-based, urut)

function buildOccurrences(headerRow: unknown[]): HeaderOccurrences {
  const occurrences: HeaderOccurrences = new Map();
  headerRow.forEach((cell, idx) => {
    if (typeof cell !== "string") return;
    const name = normalizeHeaderName(cell);
    if (!name) return;
    const colIndex = idx + 1; // exceljs getRow().values pakai index 1-based dengan slot 0 kosong; caller sudah menyesuaikan
    const list = occurrences.get(name) ?? [];
    list.push(colIndex);
    occurrences.set(name, list);
  });
  return occurrences;
}

function nth(occurrences: HeaderOccurrences, name: string, n: number): number {
  const list = occurrences.get(name);
  if (!list || list.length <= n) {
    throw new ColumnMappingError(
      `Kolom "${name}" (kemunculan ke-${n + 1}) tidak ditemukan di header. Format file mungkin berubah - periksa manual sebelum lanjut.`
    );
  }
  return list[n];
}

function single(occurrences: HeaderOccurrences, name: string): number {
  return nth(occurrences, name, 0);
}

function hasAnchorNearby(
  headerRow: unknown[],
  targetCol: number,
  anchorName: string,
  window = 4
): boolean {
  const from = Math.max(0, targetCol - 1 - window);
  const to = targetCol - 1;
  for (let i = from; i < to; i++) {
    const cell = headerRow[i];
    if (typeof cell === "string" && normalizeHeaderName(cell) === anchorName) return true;
  }
  return false;
}

export type ColumnMap = {
  nip: number;
  namaDenganGelar: number;
  namaTanpaGelar: number;
  jenisKelamin: number;
  tanggalLahir: number;
  agama: number;
  statusPegawai: number;
  jenisPegawai: number;
  kelompokJabatan: number | null;
  golonganPangkat: number;
  jabatanFungsional: number;
  jabatanTambahan: number;
  pendidikan: number;
  subagUnitKerja: number;
  unitKerjaInduk: number;
  direktoratFakultas: number;
  unitStatistik: number;
  tanggalMasuk: number;
};

/**
 * Bangun peta kolom dari baris header, dengan validasi "anchor" (kolom tetangga yang
 * diharapkan) untuk kolom TMT yang muncul 3x - supaya kalau urutan blok berubah suatu saat,
 * proses GAGAL KERAS dengan pesan jelas alih-alih diam-diam salah pasang TMT.
 */
export function buildColumnMap(headerRow: unknown[]): ColumnMap {
  const occ = buildOccurrences(headerRow);

  // TMT ke-3 (Jabatan Fungsional) divalidasi lewat anchor "Jabatan Fungsional" di dekatnya -
  // kolom TMT itu sendiri tidak dipakai langsung ke skema kita (tanggal_mulai_kerja pakai
  // "Tanggal Masuk"), tapi validasinya tetap dijalankan sebagai sinyal bahwa struktur file
  // belum berubah drastis dari yang sudah diverifikasi.
  const tmtGolongan = nth(occ, "TMT", 0);
  const tmtJabatanTambahan = nth(occ, "TMT", 1);
  const tmtJabatanFungsional = nth(occ, "TMT", 2);

  if (!hasAnchorNearby(headerRow, tmtGolongan, "Golongan Pangkat")) {
    throw new ColumnMappingError(
      'Kolom TMT pertama diharapkan mengikuti "Golongan Pangkat" tapi tidak ditemukan di sekitarnya. Struktur file berubah - periksa manual.'
    );
  }
  if (!hasAnchorNearby(headerRow, tmtJabatanTambahan, "Jabatan Tambahan")) {
    throw new ColumnMappingError(
      'Kolom TMT kedua diharapkan mengikuti "Jabatan Tambahan" tapi tidak ditemukan di sekitarnya. Struktur file berubah - periksa manual.'
    );
  }
  if (!hasAnchorNearby(headerRow, tmtJabatanFungsional, "Jabatan Fungsional")) {
    throw new ColumnMappingError(
      'Kolom TMT ketiga diharapkan mengikuti "Jabatan Fungsional" tapi tidak ditemukan di sekitarnya. Struktur file berubah - periksa manual.'
    );
  }

  return {
    nip: nth(occ, "NIP", 0),
    namaDenganGelar: single(occ, "Nama Lengkap(Dengan Gelar)"),
    namaTanpaGelar: single(occ, "Nama Lengkap(Tanpa Gelar)"),
    jenisKelamin: single(occ, "Jenis Kelamin"),
    tanggalLahir: single(occ, "Tanggal Lahir"),
    agama: nth(occ, "Agama", 0),
    statusPegawai: single(occ, "Status Pegawai"),
    jenisPegawai: single(occ, "Jenis Pegawai"),
    kelompokJabatan: occ.has("Kelompok Jabatan") ? single(occ, "Kelompok Jabatan") : null,
    golonganPangkat: single(occ, "Golongan Pangkat"),
    jabatanFungsional: single(occ, "Jabatan Fungsional"),
    jabatanTambahan: single(occ, "Jabatan Tambahan"),
    pendidikan: single(occ, "Jenjang Pendidikan"),
    subagUnitKerja: single(occ, "Subag/Unit Kerja"),
    unitKerjaInduk: single(occ, "Unit/Unit Kerja Induk"),
    direktoratFakultas: single(occ, "Direktorat/Fakultas"),
    unitStatistik: single(occ, "Unit Statistik"),
    tanggalMasuk: single(occ, "Tanggal Masuk"),
  };
}
