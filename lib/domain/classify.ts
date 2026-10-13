import { MAKS_JABATAN_TAMBAHAN, type AlasanBarisBermasalah, type KelompokPegawai } from "@/lib/constants";
import type { RawNominatifRow } from "@/lib/excel/types";

import type { KamusMap, MasterCache, NipTerdaftar } from "./masterCache";
import {
  exactMatch,
  extractGolonganCode,
  extractGolonganPPPK,
  kunciKamus,
  matchJabatanFungsionalTendik,
  matchStatusAgainstKategori,
  normalize,
  prefixOrExactMatch,
  prefixWordMatch,
} from "./matching";

export type Issue = { alasan: AlasanBarisBermasalah; detail: string };

export type JabatanTambahanSlot = {
  jabatanTambahanRoleKode: string;
  unitAsalKode: string | null;
  programStudiKode: string | null;
  statusPengangkatan: string;
};

export type ResolvedNominatif = {
  nama: string;
  jenisKelamin: "L" | "P";
  // Opsional sejak format tarikan SIMPEGA Okt 2026 (REKAP_PEGAWAI) tidak pernah menyertakannya.
  tanggalLahir: Date | null;
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
  tanggalMulaiKerja: Date;
  /** Array, bukan single - skema mendukung maks 3 (MAKS_JABATAN_TAMBAHAN) Jabatan Tambahan/bulan (lihat
   * cobaPecahDuaJabatanTambahan), array kosong = tidak punya jabatan tambahan. */
  jabatanTambahan: JabatanTambahanSlot[];
};

export type ClassifyResult =
  | { ok: true; data: ResolvedNominatif }
  | { ok: false; issues: Issue[] };

const ALASAN_PRIORITAS: AlasanBarisBermasalah[] = [
  "KlasifikasiAmbigu",
  "StatusTidakDikenali",
  "GolonganTidakDikenali",
  "JabatanTidakDikenali",
  "JabatanKosong",
  "JabatanTambahanTidakDikenali",
  "UnitKerjaTidakDikenali",
  "UnitKerjaKosong",
  "PendidikanTidakDikenali",
  "Lainnya",
];

/** Kunci kamus koreksi per jenis field - dipakai baik oleh classify.ts maupun resolveRow.ts
 *  supaya keduanya selalu sepakat soal bagaimana sebuah nilai mentah "diingat". */
/**
 * Klasifikasi & Kategori Akademisi Luar SENGAJA per-NIP, bukan per-teks (Jenis Pegawai+Status
 * Pegawai) - terbukti dari kasus nyata: 2 dosen sama-sama "Dosen"+"CPTNA" (teks identik), yang
 * satu memang dosen kontrak biasa, yang satu lagi dokter spesialis praktisi RS yang mengajar
 * paruh waktu (harus direklasifikasi manual ke Akademisi Luar UM "Praktisi Mengajar"). Kalau
 * kuncinya teks, "ingat" utk dokter itu akan SALAH ikut menerapkan Akademisi Luar UM ke dosen
 * kontrak biasa lainnya yang kebetulan kombinasi Jenis+Status-nya sama. Beda dgn field lain
 * (Status Kepegawaian, Golongan, Jabatan Tambahan) yang teksnya sendiri sudah cukup spesifik
 * membedakan orang (nama unit/jabatan spesifik jarang kebetulan sama tapi beda makna).
 */
export const kunciKlasifikasi = (row: Pick<RawNominatifRow, "nip">) => kunciKamus("NIP", row.nip);
export const kunciKategoriAkademisiLuar = (row: Pick<RawNominatifRow, "nip">) => kunciKamus("NIP", row.nip);
export const kunciStatusKepegawaian = (row: Pick<RawNominatifRow, "statusPegawaiRaw">) =>
  kunciKamus(row.statusPegawaiRaw);
export const kunciGolongan = (row: Pick<RawNominatifRow, "golonganPangkatRaw">) =>
  kunciKamus(row.golonganPangkatRaw);
/**
 * Kunci kamus BIASANYA teks mentah kolomnya sendiri (supaya 1 resolusi otomatis berlaku ke
 * SIAPA PUN yang teksnya persis sama, bukan cuma 1 NIP - misal typo yang sama, atau nama unit
 * yang sama-sama belum di master). TAPI kalau teksnya KOSONG TOTAL, kunci berbasis teks jadi
 * sama untuk SEMUA ORANG yang kosong, walau jawaban benarnya beda-beda per orang (mis. dua dosen
 * kontrak yang jabatan fungsionalnya sama-sama tidak diisi SIMPEGA, padahal keduanya punya
 * jenjang berbeda) - jadi utk kasus kosong, kunci dialihkan ke NIP supaya "ingat"-nya nempel ke
 * ORANGNYA, bukan ke kekosongan itu sendiri. Begitu SIMPEGA akhirnya mengisi kolom itu utk NIP
 * tsb, kunci otomatis kembali ke teks asli (ingatan lama disini jadi tidak terpakai lagi -
 * bukan ditimpa, cuma kalah prioritas karena kuncinya sudah beda).
 */
function kunciPerNipJikaKosong(nip: string, ...teksMentah: string[]): string {
  if (teksMentah.some((t) => t.trim())) return kunciKamus(...teksMentah);
  return kunciKamus("NIP", nip);
}

export const kunciJabatan = (row: Pick<RawNominatifRow, "jabatanFungsionalRaw" | "nip">) =>
  kunciPerNipJikaKosong(row.nip, row.jabatanFungsionalRaw);
// Unit Kerja kosong SENGAJA TETAP 1 kunci utk semua orang (bukan per-NIP seperti Jabatan di
// atas) - begitu kosong total, jawabannya SELALU sama ("Unit Kerja Belum Diketahui", lihat
// resolveUnitKerja) apapun orangnya, jadi 1 resolusi memang seharusnya berlaku ke semua NIP
// (termasuk NIP baru yang belum pernah muncul), bukan diingat per orang.
export const kunciUnitKerja = (row: Pick<RawNominatifRow, "subagUnitKerjaRaw" | "unitKerjaIndukRaw">) =>
  kunciKamus(row.subagUnitKerjaRaw, row.unitKerjaIndukRaw);
export const kunciJabatanTambahan = (row: Pick<RawNominatifRow, "jabatanTambahanRaw">) =>
  kunciKamus(row.jabatanTambahanRaw);

/**
 * Kamus koreksi menyimpan 1 String per entri, jadi resolusi Jabatan Tambahan (role + unit/prodi
 * + status pengangkatan sekaligus) di-encode jadi 1 string komposit "role|target|status". Kalau
 * orangnya punya >1 jabatan tambahan, slot-slotnya digabung dgn ";" ("slot1;slot2;slot3") - entri lama
 * 1 slot (tanpa ";") tetap terbaca persis seperti sebelumnya.
 */
function encodeSatuSlot(slot: JabatanTambahanSlot): string {
  const target = slot.unitAsalKode
    ? `UNIT:${slot.unitAsalKode}`
    : slot.programStudiKode
      ? `PRODI:${slot.programStudiKode}`
      : "NONE";
  return `${slot.jabatanTambahanRoleKode}|${target}|${slot.statusPengangkatan}`;
}

export function encodeJabatanTambahan(slots: JabatanTambahanSlot[]): string {
  return slots.map(encodeSatuSlot).join(";");
}

function decodeSatuSlot(encoded: string): JabatanTambahanSlot | null {
  const parts = encoded.split("|");
  if (parts.length !== 3) return null;
  const [roleKode, target, statusPengangkatan] = parts;
  return {
    jabatanTambahanRoleKode: roleKode,
    unitAsalKode: target.startsWith("UNIT:") ? target.slice(5) : null,
    programStudiKode: target.startsWith("PRODI:") ? target.slice(6) : null,
    statusPengangkatan,
  };
}

function decodeJabatanTambahan(encoded: string): JabatanTambahanSlot[] | null {
  const slots = encoded.split(";").map(decodeSatuSlot);
  if (slots.length === 0 || slots.length > MAKS_JABATAN_TAMBAHAN || slots.some((s) => s === null)) return null;
  return slots as JabatanTambahanSlot[];
}

function dariKamus(kamus: KamusMap, jenisField: string, kunci: string): string | undefined {
  return kamus.get(`${jenisField}::${kunci}`);
}

function kodeJenisPegawai(master: MasterCache, kelompok: KelompokPegawai): string {
  const found = master.jenisPegawai.find((j) => normalize(j.nama) === normalize(kelompok));
  if (!found) throw new Error(`Master JenisPegawai untuk "${kelompok}" tidak ditemukan - seed data rusak?`);
  return found.kode;
}

/** Urutan prioritas klasifikasi kelompok, dikonfirmasi user (lihat plan §4). */
export function resolveKelompok(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap
): { kelompok: KelompokPegawai } | { issue: Issue } {
  const diingat = dariKamus(kamus, "Klasifikasi", kunciKlasifikasi(row));
  if (diingat && ["Dosen", "Tendik", "Akademisi Luar UM"].includes(diingat)) {
    return { kelompok: diingat as KelompokPegawai };
  }

  // Status Pegawai yang menandakan Akademisi Luar UM (Praktisi/AP/dst) SELALU menang, bahkan
  // kalau kolom "Kelompok Jabatan" bilang lain - dikonfirmasi user (Sep 2026): tarikan SIMPEGA
  // format baru (REKAP_PEGAWAI) salah isi Kelompok Jabatan="Dosen" utk 359 baris berstatus
  // "Praktisi"/"AP"/"Akademisi Luar UM" (literal), padahal kebijakan yg berlaku tetap
  // menghitung mereka Akademisi Luar UM - jadi dicek DULU sebelum percaya kolom itu.
  if (matchStatusAgainstKategori(master.kategoriAkademisiLuar, (k) => k.nama, row.statusPegawaiRaw)) {
    return { kelompok: "Akademisi Luar UM" };
  }
  if (normalize(row.statusPegawaiRaw) === normalize("Akademisi Luar UM")) {
    return { kelompok: "Akademisi Luar UM" };
  }

  if (row.kelompokJabatanRaw) {
    const literal = row.kelompokJabatanRaw.trim();
    if (["Dosen", "Tendik", "Akademisi Luar UM"].includes(literal)) {
      return { kelompok: literal as KelompokPegawai };
    }
  }

  if (prefixOrExactMatch(master.kategoriAkademisiLuar, (k) => k.nama, row.jenisPegawaiRaw)) {
    return { kelompok: "Akademisi Luar UM" };
  }
  if (normalize(row.jenisPegawaiRaw) === normalize("Dosen")) {
    return { kelompok: "Dosen" };
  }
  if (!row.jenisPegawaiRaw.trim()) {
    return {
      issue: {
        alasan: "KlasifikasiAmbigu",
        detail: 'Kolom "Jenis Pegawai" dan "Status Pegawai" sama-sama kosong/tidak dikenali.',
      },
    };
  }
  return { kelompok: "Tendik" };
}

export function resolveKategoriAkademisiLuar(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap
): { kode: string } | { issue: Issue } {
  const diingat = dariKamus(kamus, "KategoriAkademisiLuar", kunciKategoriAkademisiLuar(row));
  if (diingat && master.kategoriAkademisiLuar.some((k) => k.kode === diingat)) return { kode: diingat };

  const byStatus = matchStatusAgainstKategori(master.kategoriAkademisiLuar, (k) => k.nama, row.statusPegawaiRaw);
  if (byStatus) return { kode: byStatus.kode };
  const byJenis = prefixOrExactMatch(master.kategoriAkademisiLuar, (k) => k.nama, row.jenisPegawaiRaw);
  if (byJenis) return { kode: byJenis.kode };
  return {
    issue: {
      alasan: "KlasifikasiAmbigu",
      detail: `Kelompok sudah pasti Akademisi Luar UM, tapi kategori spesifiknya tidak cocok master (mentah: Jenis Pegawai="${row.jenisPegawaiRaw}", Status Pegawai="${row.statusPegawaiRaw}").`,
    },
  };
}

export function resolveStatusKepegawaian(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap
): { kode: string; kategori: string } | { issue: Issue } {
  const diingat = dariKamus(kamus, "StatusKepegawaian", kunciStatusKepegawaian(row));
  if (diingat) {
    const found = master.statusKepegawaian.find((s) => s.kode === diingat);
    if (found) return { kode: found.kode, kategori: found.kategori };
  }

  const byKode = master.statusKepegawaian.find(
    (s) => normalize(s.kode) === normalize(row.statusPegawaiRaw)
  );
  if (byKode) return { kode: byKode.kode, kategori: byKode.kategori };
  const byNama = exactMatch(master.statusKepegawaian, (s) => s.nama, row.statusPegawaiRaw);
  if (byNama) return { kode: byNama.kode, kategori: byNama.kategori };
  return {
    issue: {
      alasan: "StatusTidakDikenali",
      detail: `Status Pegawai mentah "${row.statusPegawaiRaw}" tidak cocok dengan master Status Kepegawaian manapun.`,
    },
  };
}

export function resolveGolongan(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap,
  statusKategori: string
): { kode: string | null } | { issue: Issue } {
  // SEBELUMNYA baris ini langsung skip total (return null) kalau bukan ASN - TERBUKTI SALAH:
  // PTNA (Non-ASN) ternyata SELALU punya golongan asli di file sumber (37/37 sampel, format
  // identik PNS "Penata, III/c"), CPTNA kadang juga (2/94). Sekarang golongan SELALU dicoba
  // diekstrak dulu utk SEMUA status - baru kalau gagal, ASN tetap wajib (flag review), sedangkan
  // Non-ASN dianggap wajar kosong (mis. Praktisi/Akademisi Luar UM/PTT yang kolomnya memang
  // selalu cuma tanda koma) - tidak ikut kena flag review palsu.
  const diingat = dariKamus(kamus, "Golongan", kunciGolongan(row));
  if (diingat && master.golongan.some((g) => g.kode === diingat)) return { kode: diingat };

  // PPPK pakai skala Jenjang I-XVII (romawi polos), bukan golongan ruang PNS ("II/d") - lihat
  // catatan di extractGolonganPPPK.
  const extracted =
    normalize(row.statusPegawaiRaw) === normalize("PPPK")
      ? extractGolonganPPPK(row.golonganPangkatRaw)
      : extractGolonganCode(row.golonganPangkatRaw);
  if (!extracted) {
    if (statusKategori !== "ASN") return { kode: null };
    return {
      issue: {
        alasan: "GolonganTidakDikenali",
        detail: `Status ASN tapi golongan tidak bisa diekstrak dari teks "${row.golonganPangkatRaw}".`,
      },
    };
  }
  const found = master.golongan.find((g) => g.kode === extracted);
  if (!found) {
    if (statusKategori !== "ASN") return { kode: null };
    return {
      issue: {
        alasan: "GolonganTidakDikenali",
        detail: `Kode golongan "${extracted}" (dari teks "${row.golonganPangkatRaw}") tidak ada di master.`,
      },
    };
  }
  return { kode: found.kode };
}

type JabatanResolusi = {
  jabatanFungsionalDosenKode: string | null;
  jabatanFungsionalTendikKode: string | null;
  jabatanFungsiUmumKode: string | null;
};

/**
 * Alias istilah Jabatan Fungsional Dosen: file sumber SIMPEGA hampir selalu menulis "Tenaga
 * Dosen" untuk jenjang paling dasar, TAPI master resmi (dipakai SIMPEGA & tool ini, sama-sama
 * di-seed dari Rancangan_Master_Data_Kepegawaian_SIMPEGA_UM.xlsx) pakai istilah "Tenaga
 * Pengajar" - JANGAN ganti nama di master jadi "Tenaga Dosen" (hasil export tool ini akan
 * ditolak SIMPEGA karena masternya di sana TETAP "Tenaga Pengajar"). Cukup alias di sini saja,
 * kunci sudah dinormalize (lowercase+trim) jadi konsisten dgn helper `normalize`.
 */
const ALIAS_JABATAN_FUNGSIONAL_DOSEN: Record<string, string> = {
  "tenaga dosen": "Tenaga Pengajar",
};

/** Kode placeholder "Belum Diketahui (Perlu Verifikasi Manual)" - lihat seed-data terkait. */
const JABATAN_DOSEN_BELUM_DIKETAHUI = "DSN-99";
const JABATAN_FUNGSI_UMUM_BELUM_DIKETAHUI = "UMM-99";

export function resolveJabatan(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap,
  kelompok: KelompokPegawai,
  nipTerdaftar: NipTerdaftar
): JabatanResolusi | { issue: Issue } {
  const kunci = kunciJabatan(row);
  // Dosen/Tendik BARU (NIP belum pernah tercatat bulan manapun sebelumnya) dgn Jabatan
  // Fungsional kosong - keputusan user: langsung "Belum Diketahui" otomatis, TIDAK usah nunggu
  // direview manual dulu (beda dgn pegawai LAMA yang kolomnya kosong lagi - itu tetap direview,
  // karena kemungkinan admin punya info spesifik dari SK/riwayat, lihat kunciPerNipJikaKosong).
  const pegawaiBaruJabatanKosong = !row.jabatanFungsionalRaw.trim() && !nipTerdaftar.has(row.nip);

  if (kelompok === "Dosen") {
    const diingat = dariKamus(kamus, "JabatanFungsionalDosen", kunci);
    const dariMaster =
      (diingat && master.jabatanFungsionalDosen.find((j) => j.kode === diingat)) ||
      exactMatch(master.jabatanFungsionalDosen, (j) => j.nama, row.jabatanFungsionalRaw) ||
      // Master pakai label lengkap "Guru Besar (Profesor)" tapi sumber data biasa cuma tulis
      // "Guru Besar" - fallback ini HANYA jalan kalau exactMatch di atas gagal, jadi raw yang
      // persis "Lektor" tetap match ke "Lektor" duluan, tidak pernah nyasar ke "Lektor Kepala".
      prefixWordMatch(master.jabatanFungsionalDosen, (j) => j.nama, row.jabatanFungsionalRaw) ||
      (() => {
        const alias = ALIAS_JABATAN_FUNGSIONAL_DOSEN[normalize(row.jabatanFungsionalRaw)];
        return alias
          ? exactMatch(master.jabatanFungsionalDosen, (j) => j.nama, alias)
          : undefined;
      })();
    if (!dariMaster) {
      if (pegawaiBaruJabatanKosong) {
        return { jabatanFungsionalDosenKode: JABATAN_DOSEN_BELUM_DIKETAHUI, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: null };
      }
      if (!row.jabatanFungsionalRaw.trim()) {
        return {
          issue: {
            alasan: "JabatanKosong",
            detail: "Kolom Jabatan Fungsional kosong total di file sumber - bukan kegagalan pencocokan. Cari dari sumber lain (arsip/unit terkait) kalau ada; kalau memang belum ada infonya sama sekali, pilih \"Belum Diketahui (Perlu Verifikasi Manual)\" supaya orang ini tetap tercatat di laporan bulan ini.",
          },
        };
      }
      return {
        issue: {
          alasan: "JabatanTidakDikenali",
          detail: `Jabatan Fungsional Dosen mentah "${row.jabatanFungsionalRaw}" tidak cocok master.`,
        },
      };
    }
    return { jabatanFungsionalDosenKode: dariMaster.kode, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: null };
  }

  if (kelompok === "Tendik") {
    const diingatTendik = dariKamus(kamus, "JabatanFungsionalTendik", kunci);
    const tendik =
      (diingatTendik && master.jabatanFungsionalTendik.find((j) => j.kode === diingatTendik)) ||
      matchJabatanFungsionalTendik(master.jabatanFungsionalTendik, row.jabatanFungsionalRaw);
    if (tendik) {
      return { jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: tendik.kode, jabatanFungsiUmumKode: null };
    }
    if (pegawaiBaruJabatanKosong) {
      return { jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: JABATAN_FUNGSI_UMUM_BELUM_DIKETAHUI };
    }

    const diingatUmum = dariKamus(kamus, "FungsiUmumPelaksana", kunci);
    const umum =
      (diingatUmum && master.jabatanFungsiUmumPelaksana.find((j) => j.kode === diingatUmum)) ||
      exactMatch(master.jabatanFungsiUmumPelaksana, (j) => j.nama, row.jabatanFungsionalRaw);
    if (umum) {
      return { jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: umum.kode };
    }

    if (!row.jabatanFungsionalRaw.trim()) {
      return {
        issue: {
          alasan: "JabatanKosong",
          detail: "Kolom Jabatan Fungsional kosong total di file sumber - bukan kegagalan pencocokan. Cari dari sumber lain (arsip/unit terkait) kalau ada; kalau memang belum ada infonya sama sekali, pilih \"Belum Diketahui (Perlu Verifikasi Manual)\" supaya orang ini tetap tercatat di laporan bulan ini.",
        },
      };
    }
    return {
      issue: {
        alasan: "JabatanTidakDikenali",
        detail: `Jabatan Fungsional Tendik mentah "${row.jabatanFungsionalRaw}" tidak cocok master fungsional tertentu maupun Fungsi Umum Pelaksana.`,
      },
    };
  }

  // Akademisi Luar UM tidak wajib punya jabatan fungsional/fungsi.
  return { jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: null };
}

export function resolveUnitKerja(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap
): { kode: string } | { issue: Issue } {
  const diingat = dariKamus(kamus, "UnitKerja", kunciUnitKerja(row));
  if (diingat && master.unitAsal.some((u) => u.kode === diingat)) return { kode: diingat };

  const kandidat = [row.subagUnitKerjaRaw, row.unitKerjaIndukRaw, row.direktoratFakultasRaw, row.unitStatistikRaw];
  for (const raw of kandidat) {
    const found = exactMatch(master.unitAsal, (u) => u.nama, raw);
    if (found) return { kode: found.kode };
  }

  if (kandidat.every((k) => !k.trim() || k.trim() === "-")) {
    return {
      issue: {
        alasan: "UnitKerjaKosong",
        detail: "Kolom Unit Kerja (Subag/Unit Kerja Induk/Direktorat-Fakultas/Unit Statistik) kosong total di file sumber - bukan kegagalan pencocokan. Cari dari sumber lain (arsip/unit terkait) kalau ada; kalau memang belum ada infonya sama sekali, pilih \"Unit Kerja Belum Diketahui (Perlu Verifikasi Manual)\" supaya orang ini tetap tercatat di laporan bulan ini.",
      },
    };
  }
  return {
    issue: {
      alasan: "UnitKerjaTidakDikenali",
      detail: `Tidak ada kandidat unit kerja ("${row.subagUnitKerjaRaw}" / "${row.unitKerjaIndukRaw}" / "${row.direktoratFakultasRaw}" / "${row.unitStatistikRaw}") yang cocok dengan master Unit Asal.`,
    },
  };
}

const PREFIX_STATUS_PENGANGKATAN = /^(plt\.?|pjs\.?|pelaksana tugas|pejabat sementara)\s+/i;

/**
 * Sebagian teks Jabatan Tambahan diawali singkatan status pengangkatan yang eksplisit ("Plt."
 * = Pelaksana Tugas, "Pjs." = Pejabat Sementara) - ini SINYAL LANGSUNG dari data sumber, bukan
 * tebakan, jadi diekstrak & dipakai. Kalau tidak ada awalan ini sama sekali, statusnya TETAP
 * tidak diasumsikan "Definitif" secara diam-diam - baris tetap perlu resolusi manual sekali.
 */
function ekstrakStatusPengangkatan(raw: string): { sisaTeks: string; status: "Plt" | "Pjs" | null } {
  const m = raw.match(PREFIX_STATUS_PENGANGKATAN);
  if (!m) return { sisaTeks: raw, status: null };
  const awalan = m[1].toLowerCase();
  const status = awalan.startsWith("plt") || awalan.startsWith("pelaksana") ? "Plt" : "Pjs";
  return { sisaTeks: raw.slice(m[0].length), status };
}

type UnitAtauProdi = { unit: { kode: string } } | { prodi: { kode: string } };

/**
 * Singkatan fakultas yang TERKONFIRMASI muncul di data sumber ("Koordinator Tata Usaha, FIS" /
 * "-FT" / "..., FMIPA") - fakultas-fakultas ini JUGA terdaftar sebagai Unit Asal-nya sendiri
 * (bukan cuma Unit Induk), jadi alias ke nama lengkapnya langsung bisa dicocokkan. Sengaja HANYA
 * yang benar-benar terlihat di data, bukan menebak singkatan fakultas lain yang belum pernah
 * muncul (mis. Fakultas Ekonomi dan Bisnis bisa saja "FEB" atau lainnya - tidak ditebak).
 */
const ALIAS_SINGKATAN_FAKULTAS: Record<string, string> = {
  // 6 baris pertama terkonfirmasi langsung dari data sumber nyata (pola berulang "Koordinator
  // Tata Usaha, <singkatan>" utk fakultas yang berbeda-beda).
  fis: "Fakultas Ilmu Sosial",
  ft: "Fakultas Teknik",
  fmipa: "Fakultas Matematika dan Ilmu Pengetahuan Alam",
  fip: "Fakultas Ilmu Pendidikan",
  fs: "Fakultas Sastra",
  feb: "Fakultas Ekonomi dan Bisnis",
  // 4 di bawah singkatan baku sama tapi belum terlihat langsung di data - aman ditambahkan,
  // kalau ternyata salah/tidak dipakai alias ini cuma tidak pernah ke-trigger (tidak pernah
  // salah cocok ke fakultas lain).
  fk: "Fakultas Kedokteran",
  fpsi: "Fakultas Psikologi",
  fv: "Fakultas Vokasi",
  fik: "Fakultas Ilmu Keolahragaan",
};

/**
 * Alias nama-panjang/singkatan-lama ke nama resmi di master, utk institusi yang sudah GANTI
 * status/singkatan tapi teks sumber masih pakai versi lama - dikonfirmasi dari 82 baris Jabatan
 * Tambahan yang tadinya tidak cocok master (lihat riwayat commit): "Satuan Pengawasan
 * Internal"/"Satuan Penjaminan Mutu" adalah nama lama sebelum naik status jadi "Badan", BPUDA/LPPP/
 * LPPM singkatan resmi yang sumber kadang tulis, dan 2 nama Direktorat yang di sumber kadang hilang
 * atau nambah kata "Perencanaan," dibanding nama resmi masternya.
 */
const PRODI_PENDIDIKAN_NON_FORMAL = "S2 Pendidikan Non Formal dan Program Studi S3 Pendidikan Non Formal";

const ALIAS_NAMA_LENGKAP: Record<string, string> = {
  "upt satuan pengawasan internal": "Badan Pengawasan Internal",
  "upt satuan penjaminan mutu": "Badan Penjaminan Mutu",
  "badan pengembangan usaha dan dana abadi": "BPUDA",
  lppp: "Lembaga Pengembangan Pendidikan dan Pembelajaran",
  lppm: "Lembaga Penelitian dan Pengabdian Kepada Masyarakat",
  "direktorat data dan informasi, pemeringkatan, hubungan masyarakat, dan kerja sama":
    "Direktorat Perencanaan, Data dan Informasi, Pemeringkatan, Hubungan Masyarakat, dan Kerja Sama",
  "direktorat perencanaan, sumber daya manusia, dan keuangan": "Direktorat Sumber Daya Manusia dan Keuangan",
  "direktorat sumber daya manusia, dan keuangan": "Direktorat Sumber Daya Manusia dan Keuangan",
};

/**
 * Role yang namanya SENDIRI sudah unik menempel sebagian nama unit resminya (mis. master role
 * "Kepala Sub Direktorat Kesejahteraan" - bukan generik "Kepala Sub Direktorat" + target, tapi
 * sudah 1:1 dengan 1 unit tertentu: "Sub Direktorat Kesejahteraan, Kewirausahaan, Karir dan
 * Alumni"). Sisa teks setelah role macam ini SELALU cuma lanjutan nama resmi yang sama atau
 * konteks induk (tidak pernah target lain) - jadi begitu role ini ketemu, target sudah pasti,
 * tidak perlu cocokkan sisa sama sekali. Dibatasi HANYA ke kode role yang benar-benar terbukti
 * berperilaku begini dari 82 baris di atas, bukan ditebak untuk seluruh 79 role master.
 */
const ROLE_KE_UNIT_TETAP: Record<string, string> = {
  "JBT-10": "UA-044", // Kepala Seksi Akuntansi dan Pelaporan Keuangan -> Seksi Akuntansi dan Pelaporan Keuangan
  "JBT-11": "UA-045", // Kepala Seksi Anggaran dan Perpajakan -> Seksi Anggaran dan Perpajakan
  "JBT-34": "UA-068", // Kepala Sub Direktorat Hubungan Masyarakat dan Kerja Sama Direktorat Perencanaan -> Sub Direktorat Hubungan Masyarakat dan Kerja Sama
  "JBT-35": "UA-069", // Kepala Sub Direktorat Kesejahteraan -> Sub Direktorat Kesejahteraan, Kewirausahaan, Karir dan Alumni
  "JBT-38": "UA-072", // Kepala Sub Direktorat Minat -> Sub Direktorat Minat, Bakat, dan Penalaran
  "JBT-43": "UA-176", // Kepala Subdit Data dan Informasi -> Sub Direktorat Data dan Informasi
  "JBT-44": "UA-075", // Kepala Subdit Pemeringkatan -> Sub Direktorat Pemeringkatan
  "JBT-18": "UA-175", // Kepala Seksi Kinerja -> Seksi Kinerja, Disiplin, dan Sistem Informasi SDM
};

/**
 * Fallback KHUSUS pola "Bidang X pada <Unit Resmi>" / "Bidang X pada <Unit Resmi>" - "Bidang X"
 * di sini cuma deskripsi tugas spesifik orangnya (mis. "Anggota SPI Bidang Keuangan"), BUKAN nama
 * unit resmi tersendiri, jadi tidak akan pernah ketemu di master. Ambil bagian SETELAH kata
 * "pada" TERAKHIR (supaya aman dari "Bidang X, Y pada Z" yang ada koma sebelum "pada") dan
 * cocokkan itu saja ke Unit Asal.
 */
function cariUnitAtauProdiDenganPadaSuffix(sisa: string, master: MasterCache): UnitAtauProdi | undefined {
  const idx = sisa.lastIndexOf(" pada ");
  if (idx === -1) return undefined;
  const target = sisa.slice(idx + " pada ".length).trim();
  return target ? cariUnitAtauProdi(target, master) : undefined;
}

/**
 * Cocokkan sisa teks ke Unit Asal ATAU Program Studi - exact match dulu (persis sama persis,
 * termasuk lewat alias singkatan fakultas di atas), fallback ke sisa yang DIAWALI KATA UTUH
 * nama unit/prodi (mis. sisa "D4 Tata Boga Fakultas Vokasi" vs master prodi "D4 Tata Boga" -
 * sumber data sering menempel nama fakultas induk di belakang nama prodi/unit yang sebenarnya).
 * Exact match otomatis menang kalau ada (namanya sama panjang dgn seluruh sisa, pasti lebih
 * panjang dari prefix mana pun) - kalau cuma ada beberapa kandidat prefix, dipilih yang namanya
 * PALING PANJANG (paling spesifik).
 */
function cariUnitAtauProdi(sisa: string, master: MasterCache): UnitAtauProdi | undefined {
  const sisaSetelahAlias = samakanEjaan(normalize(ALIAS_SINGKATAN_FAKULTAS[sisa] ?? ALIAS_NAMA_LENGKAP[sisa] ?? sisa));

  type Kandidat = { kode: string; namaNorm: string; tipe: "unit" | "prodi" };
  const semua: Kandidat[] = [
    ...master.unitAsal.map((u) => ({ kode: u.kode, namaNorm: samakanEjaan(normalize(u.nama)), tipe: "unit" as const })),
    ...master.programStudi.map((p) => ({ kode: p.kode, namaNorm: samakanEjaan(normalize(p.nama)), tipe: "prodi" as const })),
  ];
  let terbaik: Kandidat | undefined;
  for (const k of semua) {
    // Batas kata setelah nama unit/prodi persis biasanya spasi (lanjut kalimat), tapi kadang
    // sumber taruh koma/titik dua langsung (mis. "Seksi Data, Direktorat ..." - nama fakultas
    // induk ditempel setelah tanda baca, bukan spasi) - keduanya dianggap batas kata yang valid.
    const cocok =
      k.namaNorm === sisaSetelahAlias ||
      sisaSetelahAlias.startsWith(`${k.namaNorm} `) ||
      sisaSetelahAlias.startsWith(`${k.namaNorm},`) ||
      sisaSetelahAlias.startsWith(`${k.namaNorm}:`);
    if (!cocok) continue;
    if (!terbaik || k.namaNorm.length > terbaik.namaNorm.length) terbaik = k;
  }
  if (!terbaik) return undefined;
  return terbaik.tipe === "unit" ? { unit: { kode: terbaik.kode } } : { prodi: { kode: terbaik.kode } };
}

/**
 * Fallback KHUSUS: kata kategori generik di akhir nama role (mis. "Departemen" pada "Ketua
 * Departemen", "Lembaga" pada "Ketua Lembaga") sebenarnya SERING jadi awalan nama unit
 * resminya sendiri ("Departemen Sosiologi"), bukan murni bagian dari role - jadi role
 * "menghabiskan" kata yang seharusnya jadi awalan target. Coba tempelkan balik 1-3 kata
 * terakhir nama role ke depan sisa, cek tiap hasil tempelan lewat cariUnitAtauProdi - HANYA
 * berhasil kalau memang ada unit/prodi resmi yang cocok, jadi aman dari salah tebak
 * (rekonstruksi yang salah otomatis tidak match apa pun & fallback ini dilewati).
 */
function cariUnitAtauProdiDenganKataKategoriRole(
  namaRole: string,
  sisa: string,
  master: MasterCache
): UnitAtauProdi | undefined {
  const kataRole = normalize(namaRole).split(" ");
  for (let k = 1; k < kataRole.length && k <= 3; k++) {
    const tempel = `${kataRole.slice(-k).join(" ")} ${sisa}`;
    const match = cariUnitAtauProdi(tempel, master);
    if (match) return match;
  }
  return undefined;
}

/**
 * Alias peran-ke-kategori-unit: jabatan orangnya ("Direktur") beda KATA dari kategori resmi
 * unitnya ("Direktorat") walau strukturnya identik (kepala unit itu) - beda dgn fallback di atas
 * yang menempel ULANG kata role sendiri, ini GANTI ke kata lain. Dikonfirmasi ke master: 6
 * "Direktorat ..." SUDAH ada persis sbg Unit Asal (UA-013..UA-018), cuma teks sumber selalu
 * pakai "Direktur" (jabatan orangnya), bukan "Direktorat" (nama unitnya).
 */
const ALIAS_PERAN_KE_KATEGORI_UNIT: Record<string, string> = {
  direktur: "direktorat",
  sekretaris: "sekretariat",
};

function cariUnitAtauProdiDenganAliasPeran(
  namaRole: string,
  sisa: string,
  master: MasterCache
): UnitAtauProdi | undefined {
  const kategori = ALIAS_PERAN_KE_KATEGORI_UNIT[normalize(namaRole)];
  return kategori ? cariUnitAtauProdi(`${kategori} ${sisa}`, master) : undefined;
}

/**
 * Master Program Studi TIDAK konsisten menamai jenjang - kadang "S2 <Nama>"/"S3 <Nama>", kadang
 * "<Nama> Program Magister"/"<Nama> Program Doktor" (dua-duanya dipakai untuk prodi berbeda,
 * lihat prisma/seed-data/programStudi.json), sedangkan teks sumber SELALU pakai gaya "<Nama>
 * Program Magister"/"<Nama> Program Doktor". Fallback ini menyamakan kedua gaya penulisan itu
 * (pisahkan {jenjang, nama dasar}, lalu bandingkan nama dasarnya) supaya prodi yang di master
 * kebetulan ditulis gaya "S2/S3" tetap ketemu.
 */
function kanonikProdi(nama: string): { jenjang: "S2" | "S3" | null; dasar: string } {
  const n = normalize(nama);
  if (n.startsWith("s2 ")) return { jenjang: "S2", dasar: n.slice(3) };
  if (n.startsWith("s3 ")) return { jenjang: "S3", dasar: n.slice(3) };
  if (n.endsWith(" program magister")) return { jenjang: "S2", dasar: n.slice(0, -" program magister".length) };
  if (n.endsWith(" program doktor")) return { jenjang: "S3", dasar: n.slice(0, -" program doktor".length) };
  return { jenjang: null, dasar: n };
}

function cariProdiDenganKanonikJenjang(sisa: string, master: MasterCache): UnitAtauProdi | undefined {
  // "Program Magister"/"Program Doktor" bisa muncul di TENGAH sisa (mis. "ilmu ekonomi program
  // magister fakultas ekonomi dan bisnis" - fakultas induk menempel di belakang), jadi dicari
  // sbg SUBSTRING, bukan cuma akhiran, lalu bagian sebelumnya jadi dasar pembanding.
  const penanda: Array<{ frasa: string; jenjang: "S2" | "S3" }> = [
    { frasa: " program magister", jenjang: "S2" },
    { frasa: " program doktor", jenjang: "S3" },
  ];
  for (const { frasa, jenjang } of penanda) {
    const idx = sisa.indexOf(frasa);
    if (idx === -1) continue;
    const dasar = sisa.slice(0, idx).trim();
    if (!dasar) continue;
    const cocok = master.programStudi.find((p) => {
      const k = kanonikProdi(p.nama);
      return k.jenjang === jenjang && k.dasar === dasar;
    });
    if (cocok) return { prodi: { kode: cocok.kode } };
  }
  return undefined;
}

/**
 * Menyamakan variasi ejaan antara teks sumber dan nama master ke 1 bentuk. Diterapkan ke KEDUA
 * sisi (teks sumber DAN nama unit/prodi master, lihat cariUnitAtauProdi) - kalau cuma ke teks
 * sumber, nama master yang ejaannya beda jadi tidak ketemu: unit "Departemen Pendidikan IPA"
 * (singkat) tapi prodi "S2 Pendidikan Ilmu Pengetahuan Alam" (lengkap) di master yang sama.
 * Input sudah ternormalisasi (lowercase).
 */
function samakanEjaan(n: string): string {
  return (
    n
      // Master SELALU pakai singkatan "UPT" (mis. "UPT Layanan Pengadaan") dan "Departemen
      // Pendidikan IPA", tapi sumber data sering menulis lengkap "Unit Pelaksana Teknis"/"Pendidikan
      // Ilmu Pengetahuan Alam". SENGAJA dibatasi ke frasa "Pendidikan Ilmu Pengetahuan Alam" saja
      // (bukan "Ilmu Pengetahuan Alam" polos) - "Fakultas Matematika dan Ilmu Pengetahuan Alam"
      // (nama resmi FMIPA) justru TETAP pakai ejaan lengkap di master, jadi tidak boleh ikut
      // ke-alias (regresi yang sempat terjadi: Dekan/Wakil Dekan FMIPA jadi tidak ketemu master).
      .replace(/\bunit pelaksana teknis\b/g, "upt")
      .replace(/\bpendidikan ilmu pengetahuan alam\b/g, "pendidikan ipa")
      // "PTIK" singkatan "Pusat Teknologi Informasi dan Komunikasi" (nama resmi Unit Asal-nya
      // selalu "UPT Pusat Teknologi Informasi dan Komunikasi") - sumber sering pakai singkatan ini.
      .replace(/\bptik\b/g, "pusat teknologi informasi dan komunikasi")
      // Master tulis "Departemen Bimbingan Konseling" (tanpa "dan"), sumber sering tulis lengkap
      // "Bimbingan dan Konseling" - disamakan di sini.
      .replace(/\bbimbingan dan konseling\b/g, "bimbingan konseling")
      // Prodi "Pendidikan Luar Sekolah" sudah direbrand nasional jadi "Pendidikan Non Formal" -
      // nama Departemen-nya di UM tetap pakai nama lama, tapi nama Prodi di master sudah pakai
      // nama baru (PRD-099), jadi disamakan di sini supaya tetap ketemu.
      .replace(
        /\bpendidikan luar sekolah program magister dan program doktor\b/g,
        normalize(PRODI_PENDIDIKAN_NON_FORMAL)
      )
  );
}

/**
 * Raw "Jabatan Tambahan" menggabungkan nama role + unit/prodi dalam 1 sel TANPA pemisah yang
 * konsisten - kadang koma ("Kepala Sub Direktorat Layanan Pendidikan, Direktorat Pendidikan"),
 * kadang tanpa apa pun ("Dekan Fakultas Ilmu Sosial"). Jadi dicari lewat KANDIDAT AWALAN dari
 * 79 nama role master (dicoba dari yang PALING PANJANG/spesifik dulu, supaya "Kepala Pusat
 * Evaluasi Pendidikan" tidak salah kepotong jadi "Kepala Pusat"), lalu sisanya (setelah dibuang
 * koma/spasi pemisah) dicocokkan ke Unit Asal/Program Studi lewat cariUnitAtauProdi. Kalau
 * sisa tidak cocok apa pun, kandidat itu ditolak dan dicoba kandidat role berikutnya - tetap
 * deterministik (exact/prefix-kata-utuh di kedua sisi), bukan tebakan posisi atau fuzzy.
 */
export function pisahJabatanTambahanRaw(
  raw: string,
  master: MasterCache
): {
  roleRaw: string;
  unit?: { kode: string };
  prodi?: { kode: string };
  /** true = role match ditemukan TANPA sisa teks sama sekali (mis. "Rektor", "Ketua Senat") -
   * berarti target unit/prodi memang tidak relevan, bukan gagal dicari. */
  sisaKosong: boolean;
  status: "Plt" | "Pjs" | null;
} {
  const { sisaTeks, status } = ekstrakStatusPengangkatan(raw.trim());
  // Master SELALU pakai singkatan "UPT" (mis. "UPT Layanan Pengadaan") dan "Departemen
  // Pendidikan IPA", tapi sumber data sering menulis lengkap "Unit Pelaksana Teknis"/"Pendidikan
  // Ilmu Pengetahuan Alam" - alias di level teks mentah supaya baik peran maupun nama unitnya
  // sendiri konsisten cocok ke master. SENGAJA dibatasi ke frasa "Pendidikan Ilmu Pengetahuan
  // Alam" saja (bukan "Ilmu Pengetahuan Alam" polos) - "Fakultas Matematika dan Ilmu Pengetahuan
  // Alam" (nama resmi FMIPA) justru TETAP pakai ejaan lengkap di master, jadi tidak boleh ikut
  // ke-alias (regresi yang sempat terjadi: Dekan/Wakil Dekan FMIPA jadi tidak ketemu master).
  const rawNorm = samakanEjaan(normalize(sisaTeks));

  const kandidatRole = master.jabatanTambahanRole
    .filter((r) => {
      const roleNorm = normalize(r.namaRole);
      if (!rawNorm.startsWith(roleNorm)) return false;
      const sisa = rawNorm.slice(roleNorm.length);
      return sisa === "" || sisa.startsWith(" ") || sisa.startsWith(",") || sisa.startsWith(":");
    })
    .sort((a, b) => b.namaRole.length - a.namaRole.length);

  for (const role of kandidatRole) {
    let sisa = rawNorm.slice(normalize(role.namaRole).length).trim();
    if (sisa.startsWith(",") || sisa.startsWith("-") || sisa.startsWith(":")) sisa = sisa.slice(1).trim();
    // "Pembina Asrama Putra:"/"Pembina Asrama Putri:" - penanda jenis kelamin penghuni asrama,
    // bukan bagian dari nama unit asramanya sendiri.
    sisa = sisa.replace(/^(putra|putri)\s*:?\s*/, "");
    if (!sisa) return { roleRaw: role.namaRole, sisaKosong: true, status };
    // Nama institusi sendiri ditempel di belakang role level-Universitas (mis. "Rektor
    // Universitas Negeri Malang", "Sekretaris Universitas Negeri Malang") - redundan (cuma ada
    // 1 UM), setara dgn sisa kosong, bukan target sungguhan yang perlu dicocokkan ke unit/prodi.
    if (sisa === normalize("Universitas Negeri Malang")) {
      return { roleRaw: role.namaRole, sisaKosong: true, status };
    }
    // "Wakil Rektor I (Bidang Pendidikan, Kemahasiswaan, dan Alumni)" - keterangan bidang tugas
    // dalam kurung, bukan target unit/prodi terpisah (jabatan level Rektorat tidak butuh target).
    if (sisa.startsWith("(") && sisa.endsWith(")")) {
      return { roleRaw: role.namaRole, sisaKosong: true, status };
    }
    // Sebagian role di master SUDAH unik menempel sebagian nama unit resminya (lihat
    // ROLE_KE_UNIT_TETAP) - begitu role ini ketemu, target sudah pasti tanpa perlu cocokkan sisa.
    const unitTetap = ROLE_KE_UNIT_TETAP[role.kode];
    if (unitTetap) return { roleRaw: role.namaRole, unit: { kode: unitTetap }, sisaKosong: false, status };

    const match =
      cariUnitAtauProdi(sisa, master) ??
      cariUnitAtauProdiDenganKataKategoriRole(role.namaRole, sisa, master) ??
      cariUnitAtauProdiDenganAliasPeran(role.namaRole, sisa, master) ??
      cariProdiDenganKanonikJenjang(sisa, master) ??
      cariUnitAtauProdiDenganPadaSuffix(sisa, master);
    if (match && "unit" in match) return { roleRaw: role.namaRole, unit: match.unit, sisaKosong: false, status };
    if (match && "prodi" in match) return { roleRaw: role.namaRole, prodi: match.prodi, sisaKosong: false, status };
  }

  return { roleRaw: sisaTeks, sisaKosong: false, status };
}

type SatuJabatanTambahanTerurai = {
  role: { kode: string };
  unit?: { kode: string };
  prodi?: { kode: string };
  status: "Plt" | "Pjs" | "Definitif";
};

function uraiSatuJabatanTambahan(mentah: string, master: MasterCache): SatuJabatanTambahanTerurai | null {
  const { roleRaw, unit, prodi, sisaKosong, status } = pisahJabatanTambahanRaw(mentah, master);
  const role = exactMatch(master.jabatanTambahanRole, (r) => r.namaRole, roleRaw);
  if (!role || (!sisaKosong && !unit && !prodi)) return null;
  return { role: { kode: role.kode }, unit, prodi, status: status ?? "Definitif" };
}

/** Teks (setelah awalan "Plt."/"Pjs." dibuang) diawali nama salah satu role master pada batas kata. */
function diawaliNamaRole(teks: string, master: MasterCache): boolean {
  const n = normalize(ekstrakStatusPengangkatan(teks.trim()).sisaTeks);
  return master.jabatanTambahanRole.some((r) => {
    const roleNorm = normalize(r.namaRole);
    if (!n.startsWith(roleNorm)) return false;
    const sisa = n.slice(roleNorm.length);
    return sisa === "" || sisa.startsWith(" ") || sisa.startsWith(",") || sisa.startsWith(":");
  });
}

/**
 * Cari titik-titik pemisah ANTAR jabatan di teks Jabatan Tambahan. Sumber memisahkan 2 jabatan
 * dgn " dan " ("Plt. Sekretaris X dan Plt. Ketua Y") atau "merangkap"/"merangkap sebagai"
 * ("Ketua Departemen X merangkap Ketua Program Studi Y" - pola ini yang terbanyak di tarikan
 * REKAP_PEGAWAI). Sebuah " dan "/"merangkap" HANYA dihitung pemisah kalau teks SETELAHNYA diawali
 * nama role master - jadi " dan " yang cuma bagian nama resmi ("Fakultas Ekonomi dan Bisnis",
 * "Hukum dan Kewarganegaraan") tidak pernah dianggap pemisah. Jumlah jabatan = jumlah titik + 1.
 */
function cariPemisahJabatan(teks: string, master: MasterCache): { awal: number; akhir: number }[] {
  const regex = /\s+(?:merangkap(?:\s+sebagai)?|dan)\s+/gi;
  const hasil: { awal: number; akhir: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(teks))) {
    const akhir = m.index + m[0].length;
    if (diawaliNamaRole(teks.slice(akhir), master)) hasil.push({ awal: m.index, akhir });
  }
  return hasil;
}

function potongPerPemisah(teks: string, pemisah: { awal: number; akhir: number }[]): string[] {
  const bagian: string[] = [];
  let mulai = 0;
  for (const p of pemisah) {
    bagian.push(teks.slice(mulai, p.awal));
    mulai = p.akhir;
  }
  bagian.push(teks.slice(mulai));
  return bagian;
}

/**
 * Untuk PRATINJAU/prefill form resolve manual (bukan keputusan otomatis): pecah teks di tiap
 * pemisah jabatan lalu isi sebisanya role & target tiap bagian - bagian yang gagal cocok tetap
 * dikembalikan (role/target null) supaya admin tinggal melengkapi, bukan mulai dari kosong.
 */
export function uraiJabatanTambahanSebagian(
  raw: string,
  master: MasterCache
): { roleKode: string | null; unitAsalKode: string | null; programStudiKode: string | null; status: string }[] {
  const teks = raw.replace(/\s+/g, " ").trim();
  if (!teks) return [];
  const pemisah = diawaliNamaRole(teks, master) ? cariPemisahJabatan(teks, master) : [];
  return potongPerPemisah(teks, pemisah)
    .slice(0, MAKS_JABATAN_TAMBAHAN)
    .map((b) => {
      const { roleRaw, unit, prodi, status } = pisahJabatanTambahanRaw(b, master);
      const role = exactMatch(master.jabatanTambahanRole, (r) => r.namaRole, roleRaw);
      return {
        roleKode: role?.kode ?? null,
        unitAsalKode: unit?.kode ?? null,
        programStudiKode: prodi?.kode ?? null,
        status: status ?? "Definitif",
      };
    });
}

/**
 * Jabatan Tambahan opsional - kosong di data sumber = tidak menjabat, bukan error. Akademisi
 * Luar UM tidak pernah punya jabatan tambahan struktural. Status Pengangkatan: kalau teksnya
 * diawali "Plt."/"Pjs." eksplisit, itu SINYAL LANGSUNG dipakai apa adanya; kalau tidak ada
 * awalan itu sama sekali, DIANGGAP "Definitif" (keputusan user - status Plt/Pjs di SIMPEGA
 * praktiknya SELALU ditulis eksplisit di sumber kalau memang berlaku, jadi ketiadaan awalan itu
 * adalah sinyal yang cukup kuat, bukan sekadar data yang hilang).
 */
export function resolveJabatanTambahan(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap,
  kelompok: KelompokPegawai
): { slots: JabatanTambahanSlot[] } | { issue: Issue } {
  if (!row.jabatanTambahanRaw.trim() || kelompok === "Akademisi Luar UM") {
    return { slots: [] };
  }

  const diingat = dariKamus(kamus, "JabatanTambahan", kunciJabatanTambahan(row));
  if (diingat) {
    const decoded = decodeJabatanTambahan(diingat);
    if (
      decoded &&
      decoded.every(
        (s) =>
          master.jabatanTambahanRole.some((r) => r.kode === s.jabatanTambahanRoleKode) &&
          (!s.unitAsalKode || master.unitAsal.some((u) => u.kode === s.unitAsalKode)) &&
          (!s.programStudiKode || master.programStudi.some((p) => p.kode === s.programStudiKode))
      )
    ) {
      return { slots: decoded };
    }
  }

  // Teks yang MEMUAT lebih dari 1 jabatan ("X merangkap Y" / "X dan Y") dipecah DULU, sebelum
  // jalur 1-jabatan di bawah - kalau tidak, role+unit pertama cocok duluan dan sisa teks setelahnya
  // (jabatan kedua) terbuang diam-diam, krn pencocokan unit menerima sisa apa pun di belakang
  // nama unit (lihat cariUnitAtauProdi).
  const teks = row.jabatanTambahanRaw.replace(/\s+/g, " ").trim();
  if (diawaliNamaRole(teks, master)) {
    const pemisah = cariPemisahJabatan(teks, master);
    if (pemisah.length + 1 > MAKS_JABATAN_TAMBAHAN) {
      return {
        issue: {
          alasan: "JabatanTambahanTidakDikenali",
          detail: `Jabatan Tambahan mentah "${row.jabatanTambahanRaw}" memuat ${pemisah.length + 1} jabatan, sedangkan skema hanya mendukung maks ${MAKS_JABATAN_TAMBAHAN} per bulan - perlu keputusan manual jabatan mana yang dicatat.`,
        },
      };
    }
    if (pemisah.length >= 1) {
      const bagian = potongPerPemisah(teks, pemisah);
      const terurai = bagian.map((b) => uraiSatuJabatanTambahan(b, master));
      if (terurai.every((t): t is SatuJabatanTambahanTerurai => t !== null)) {
        return {
          slots: terurai.map((p) => ({
            jabatanTambahanRoleKode: p.role.kode,
            unitAsalKode: p.unit?.kode ?? null,
            programStudiKode: p.prodi?.kode ?? null,
            statusPengangkatan: p.status,
          })),
        };
      }
      return {
        issue: {
          alasan: "JabatanTambahanTidakDikenali",
          detail: `Jabatan Tambahan mentah "${row.jabatanTambahanRaw}" memuat ${bagian.length} jabatan, tapi salah satunya tidak bisa dipetakan lengkap (role + unit/prodi) ke master.`,
        },
      };
    }
    if (/\bmerangkap\b/i.test(teks)) {
      return {
        issue: {
          alasan: "JabatanTambahanTidakDikenali",
          detail: `Jabatan Tambahan mentah "${row.jabatanTambahanRaw}" memuat kata "merangkap", tapi jabatan setelahnya bukan role yang ada di master - perlu keputusan manual (tambah role baru atau abaikan).`,
        },
      };
    }
  }

  const { roleRaw, unit, prodi, sisaKosong, status } = pisahJabatanTambahanRaw(row.jabatanTambahanRaw, master);
  const role = exactMatch(master.jabatanTambahanRole, (r) => r.namaRole, roleRaw);

  // Target unit/prodi cuma wajib kalau teks mentahnya memang MENYISAKAN sesuatu setelah nama
  // role (mis. "Ketua Program Studi <nama prodi>") - kalau raw persis nama role tanpa sisa apa
  // pun (mis. "Rektor", "Ketua Senat"), itu memang jabatan level Universitas yang tidak
  // punya/butuh target, bukan kegagalan pencarian.
  if (role && (sisaKosong || unit || prodi)) {
    return {
      slots: [
        {
          jabatanTambahanRoleKode: role.kode,
          unitAsalKode: unit?.kode ?? null,
          programStudiKode: prodi?.kode ?? null,
          statusPengangkatan: status ?? "Definitif",
        },
      ],
    };
  }

  // Format tarikan baru (REKAP_PEGAWAI, Okt 2026+) punya kolom "Unit Kerja Jabatan Tambahan"
  // TERPISAH dari teks role-nya - role sudah ketemu tapi sisa teks gabungan gagal dicocokkan,
  // coba kolom terpisah ini sbg fallback TERAKHIR (bukan yang pertama - kolom ini kadang cuma
  // berisi unit kerja UTAMA orangnya, bukan target spesifik, mis. utk role "Pembina Asrama" -
  // makanya cuma dipakai kalau ekstraksi dari teks gabungan sendiri sudah gagal total).
  if (role && !sisaKosong && !unit && !prodi && row.unitKerjaJabatanTambahanRaw.trim()) {
    const viaKolomTerpisah = cariUnitAtauProdi(normalize(row.unitKerjaJabatanTambahanRaw), master);
    if (viaKolomTerpisah) {
      return {
        slots: [
          {
            jabatanTambahanRoleKode: role.kode,
            unitAsalKode: "unit" in viaKolomTerpisah ? viaKolomTerpisah.unit.kode : null,
            programStudiKode: "prodi" in viaKolomTerpisah ? viaKolomTerpisah.prodi.kode : null,
            statusPengangkatan: status ?? "Definitif",
          },
        ],
      };
    }
  }

  return {
    issue: {
      alasan: "JabatanTambahanTidakDikenali",
      detail: `Jabatan Tambahan mentah "${row.jabatanTambahanRaw}" tidak bisa dipetakan lengkap (nama role ${role ? "cocok" : "TIDAK cocok"} master, unit/prodi ${unit || prodi ? "cocok" : "TIDAK cocok"} master).`,
    },
  };
}

function pilihAlasanUtama(issues: Issue[]): AlasanBarisBermasalah {
  for (const a of ALASAN_PRIORITAS) {
    if (issues.some((i) => i.alasan === a)) return a;
  }
  return "Lainnya";
}

export function classifyRow(
  row: RawNominatifRow,
  master: MasterCache,
  kamus: KamusMap,
  nipTerdaftar: NipTerdaftar
): ClassifyResult {
  const issues: Issue[] = [];

  const kelompokResult = resolveKelompok(row, master, kamus);
  if ("issue" in kelompokResult) {
    // Tanpa kelompok, field lain (jabatan/status) tidak bisa dievaluasi sama sekali.
    return { ok: false, issues: [kelompokResult.issue] };
  }
  const kelompok = kelompokResult.kelompok;

  let kategoriAkademisiLuarKode: string | null = null;
  if (kelompok === "Akademisi Luar UM") {
    const kat = resolveKategoriAkademisiLuar(row, master, kamus);
    if ("issue" in kat) issues.push(kat.issue);
    else kategoriAkademisiLuarKode = kat.kode;
  }

  let statusKepegawaianKode: string;
  let golonganKode: string | null = null;
  if (kelompok === "Akademisi Luar UM") {
    // Aturan master: semua Akademisi Luar UM statusnya PTT.
    statusKepegawaianKode = "PTT";
  } else {
    const status = resolveStatusKepegawaian(row, master, kamus);
    if ("issue" in status) {
      issues.push(status.issue);
      statusKepegawaianKode = "";
    } else {
      statusKepegawaianKode = status.kode;
      const golongan = resolveGolongan(row, master, kamus, status.kategori);
      if ("issue" in golongan) issues.push(golongan.issue);
      else golonganKode = golongan.kode;
    }
  }

  const jabatan = resolveJabatan(row, master, kamus, kelompok, nipTerdaftar);
  let jabatanFungsionalDosenKode: string | null = null;
  let jabatanFungsionalTendikKode: string | null = null;
  let jabatanFungsiUmumKode: string | null = null;
  if ("issue" in jabatan) {
    issues.push(jabatan.issue);
  } else {
    ({ jabatanFungsionalDosenKode, jabatanFungsionalTendikKode, jabatanFungsiUmumKode } = jabatan);
  }

  const unit = resolveUnitKerja(row, master, kamus);
  let unitAsalKode = "";
  if ("issue" in unit) issues.push(unit.issue);
  else unitAsalKode = unit.kode;

  const jabatanTambahan = resolveJabatanTambahan(row, master, kamus, kelompok);
  let jabatanTambahanSlots: JabatanTambahanSlot[] = [];
  if ("issue" in jabatanTambahan) issues.push(jabatanTambahan.issue);
  else jabatanTambahanSlots = jabatanTambahan.slots;

  const nama = row.namaDenganGelar.trim() || row.namaTanpaGelar.trim();
  if (!nama) issues.push({ alasan: "Lainnya", detail: "Nama pegawai kosong di data sumber." });

  const jenisKelamin = row.jenisKelaminRaw.trim().toUpperCase();
  if (jenisKelamin !== "L" && jenisKelamin !== "P") {
    issues.push({ alasan: "Lainnya", detail: `Jenis Kelamin mentah "${row.jenisKelaminRaw}" bukan L/P.` });
  }

  if (!row.tanggalMasuk) {
    issues.push({ alasan: "Lainnya", detail: "Tanggal Masuk (dipakai sebagai TMT) kosong/tidak valid di data sumber." });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: {
      nama,
      jenisKelamin: jenisKelamin as "L" | "P",
      tanggalLahir: row.tanggalLahir,
      pendidikanTerakhir: row.pendidikanRaw.trim() || null,
      agama: row.agamaRaw.trim() || null,
      jenisPegawaiKode: kodeJenisPegawai(master, kelompok),
      statusKepegawaianKode,
      golonganKode,
      jabatanFungsionalDosenKode,
      jabatanFungsionalTendikKode,
      jabatanFungsiUmumKode,
      kategoriAkademisiLuarKode,
      unitAsalKode,
      tanggalMulaiKerja: row.tanggalMasuk as Date,
      jabatanTambahan: jabatanTambahanSlots,
    },
  };
}

export { pilihAlasanUtama };
