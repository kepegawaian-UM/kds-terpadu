/**
 * Pembanding bulanan F5 (KDS2 vs KDS Terpadu) untuk SATU bulan. Fungsi murni atas baris yang sudah dibaca: tanpa akses basis data,
 * mudah dites. Keluaran hanya agregat (jumlah, pasangan KODE master); daftar NIP hanya dikembalikan sebagai data untuk disimpan
 * lokal oleh pemanggil, tidak pernah dicetak oleh pustaka ini. Perbedaan yang sudah DIPUTUSKAN dilabeli "diketahui" dan dipisahkan
 * dari selisih baru (lihat docs/09-rencana-f5-paralel.md §4); selisih baru membuat hasil "ADA SELISIH BARU".
 */

export type Nilai = string | number | null;
export type BarisNominatif = Record<string, Nilai>;
export type SlotJabatan = { role: string; unit: string | null; prodi: string | null; status: string | null };

/** Kolom Nominatif yang dibandingkan (nama field KDS Terpadu). NIP adalah kunci; id dan batch tidak dibandingkan. */
export const KOLOM_NOMINATIF = [
  "nama", "jenisKelamin", "tanggalLahir", "pendidikanTerakhir", "jenisPegawaiKode", "statusKepegawaianKode", "golonganKode",
  "jabatanFungsionalDosenKode", "jabatanFungsionalTendikKode", "jabatanFungsiUmumKode", "kategoriAkademisiLuarKode", "unitAsalKode", "tanggalMulaiKerja",
] as const;
/** Kolom yang nilainya KODE master atau tanggal/atribut non-pribadi: pasangan nilai boleh dicetak. Kolom lain hanya dihitung. */
const KOLOM_BOLEH_DICETAK = new Set<string>(KOLOM_NOMINATIF.filter((k) => k !== "nama" && k !== "tanggalLahir" && k !== "tanggalMulaiKerja"));

export type SelisihKolom = { sama: number; beda: number; pasangan: Map<string, number> };
export type HasilNominatif = {
  jumlahKds2: number;
  jumlahTerpadu: number;
  hanyaKds2: string[];
  hanyaTerpadu: string[];
  perKolom: Record<string, SelisihKolom>;
  /** baris yang selisihnya SELURUHNYA termasuk perbedaan diketahui */
  nipBedaDiketahui: number;
  /** baris yang punya selisih di luar perbedaan diketahui */
  nipBedaBaru: string[];
  diketahui: { golonganNonAsn: number };
};

const teks = (v: Nilai | undefined) => (v === null || v === undefined ? null : String(v));

export type KonteksNominatif = {
  /** kode status kepegawaian -> kategori ("ASN"/"Non-ASN"), dari master (sama di kedua sisi) */
  kategoriStatus: Map<string, string>;
};

export function bandingkanNominatif(kds2: BarisNominatif[], terpadu: BarisNominatif[], ctx: KonteksNominatif): HasilNominatif {
  const a = new Map(kds2.map((r) => [String(r.pegawaiNip), r]));
  const b = new Map(terpadu.map((r) => [String(r.pegawaiNip), r]));
  const perKolom: Record<string, SelisihKolom> = Object.fromEntries(KOLOM_NOMINATIF.map((k) => [k, { sama: 0, beda: 0, pasangan: new Map<string, number>() }]));
  const nipBedaBaru: string[] = [];
  let nipBedaDiketahui = 0;
  let golonganNonAsn = 0;

  for (const [nip, x] of a) {
    const y = b.get(nip);
    if (!y) continue;
    let adaBaru = false;
    let adaDiketahui = false;
    for (const kolom of KOLOM_NOMINATIF) {
      const nilaiA = teks(x[kolom]);
      const nilaiB = teks(y[kolom]);
      const s = perKolom[kolom];
      if (nilaiA === nilaiB) {
        s.sama++;
        continue;
      }
      s.beda++;
      if (KOLOM_BOLEH_DICETAK.has(kolom)) {
        const kunci = `${nilaiA ?? "kosong"} -> ${nilaiB ?? "kosong"}`;
        s.pasangan.set(kunci, (s.pasangan.get(kunci) ?? 0) + 1);
      }
      // Diketahui: golongan Non-ASN (KDS2 satu tingkat lebih rendah atau kosong dibanding SIMPEGA/Terpadu; keputusan pengguna menunggu).
      if (kolom === "golonganKode" && ctx.kategoriStatus.get(String(y.statusKepegawaianKode)) === "Non-ASN") {
        golonganNonAsn++;
        adaDiketahui = true;
      } else {
        adaBaru = true;
      }
    }
    if (adaBaru) nipBedaBaru.push(nip);
    else if (adaDiketahui) nipBedaDiketahui++;
  }
  return {
    jumlahKds2: a.size,
    jumlahTerpadu: b.size,
    hanyaKds2: [...a.keys()].filter((n) => !b.has(n)).sort(),
    hanyaTerpadu: [...b.keys()].filter((n) => !a.has(n)).sort(),
    perKolom,
    nipBedaDiketahui,
    nipBedaBaru: nipBedaBaru.sort(),
    diketahui: { golonganNonAsn },
  };
}

export type HasilJabatanTambahan = {
  /** NIP dengan isi slot sama persis (urutan slot tidak dihitung) */
  sama: number;
  /**
   * Terpadu LEBIH LENGKAP dan mencakup semua slot KDS2 (diketahui, bukan galat): slot tambahan (jabatan "merangkap" yang hilang di jalur
   * lama KDS2) dan/atau tujuan unit/program studi yang di KDS2 kosong karena belum ada di master KDS2.
   */
  terpaduLebihLengkapDiketahui: number;
  /** selisih lain: perlu ditinjau manusia */
  bedaBaru: string[];
};

const kunciSlot = (s: SlotJabatan) => `${s.role}|${s.unit ?? ""}|${s.prodi ?? ""}|${s.status ?? ""}`;
const tanpaTujuan = (s: SlotJabatan) => !s.unit && !s.prodi;

/** Setiap slot KDS2 punya pasangan sendiri di Terpadu: peran dan status sama, tujuan sama atau di KDS2 kosong (pasangan tidak dipakai dua kali). */
function terpaduMencakup(kds2: SlotJabatan[], terpadu: SlotJabatan[]): boolean {
  if (terpadu.length < kds2.length) return false;
  const terpakai = new Set<number>();
  for (const a of kds2) {
    const i = terpadu.findIndex((b, j) => !terpakai.has(j) && b.role === a.role && (b.status ?? null) === (a.status ?? null) && (tanpaTujuan(a) || (a.unit === b.unit && a.prodi === b.prodi)));
    if (i < 0) return false;
    terpakai.add(i);
  }
  return true;
}

export function bandingkanJabatanTambahan(kds2: Map<string, SlotJabatan[]>, terpadu: Map<string, SlotJabatan[]>, nipBersama: Iterable<string>): HasilJabatanTambahan {
  let sama = 0;
  let lebihLengkap = 0;
  const bedaBaru: string[] = [];
  for (const nip of nipBersama) {
    const slotA = kds2.get(nip) ?? [];
    const slotB = terpadu.get(nip) ?? [];
    const a = slotA.map(kunciSlot).sort();
    const b = slotB.map(kunciSlot).sort();
    if (a.length === b.length && a.every((v, i) => v === b[i])) sama++;
    else if (terpaduMencakup(slotA, slotB)) lebihLengkap++;
    else bedaBaru.push(nip);
  }
  return { sama, terpaduLebihLengkapDiketahui: lebihLengkap, bedaBaru: bedaBaru.sort() };
}

export type HasilRekap = {
  jumlahKds2: number;
  jumlahTerpadu: number;
  hanyaKds2: string[];
  hanyaTerpadu: string[];
  /** jumlah sel (NIP x komponen) yang dibandingkan dan yang beda */
  sel: { dibandingkan: number; beda: number };
  bedaPerKomponen: Map<string, number>;
  nipBeda: string[];
};

/** Rekap: peta NIP -> (komponen -> nilai teks). Nilai dibandingkan sebagai teks setelah dipangkas. */
export function bandingkanRekap(kds2: Map<string, Map<string, string | null>>, terpadu: Map<string, Map<string, string | null>>): HasilRekap {
  let dibandingkan = 0;
  let beda = 0;
  const bedaPerKomponen = new Map<string, number>();
  const nipBeda: string[] = [];
  for (const [nip, a] of kds2) {
    const b = terpadu.get(nip);
    if (!b) continue;
    let adaBeda = false;
    for (const komponen of new Set([...a.keys(), ...b.keys()])) {
      dibandingkan++;
      const va = (a.get(komponen) ?? "").trim();
      const vb = (b.get(komponen) ?? "").trim();
      if (va !== vb) {
        beda++;
        adaBeda = true;
        bedaPerKomponen.set(komponen, (bedaPerKomponen.get(komponen) ?? 0) + 1);
      }
    }
    if (adaBeda) nipBeda.push(nip);
  }
  return {
    jumlahKds2: kds2.size,
    jumlahTerpadu: terpadu.size,
    hanyaKds2: [...kds2.keys()].filter((n) => !terpadu.has(n)).sort(),
    hanyaTerpadu: [...terpadu.keys()].filter((n) => !kds2.has(n)).sort(),
    sel: { dibandingkan, beda },
    bedaPerKomponen,
    nipBeda: nipBeda.sort(),
  };
}

/** Penilaian akhir satu bulan: bersih bila tidak ada selisih baru di Nominatif, Jabatan Tambahan, maupun Rekap. */
export function nilaiBulan(n: HasilNominatif, jt: HasilJabatanTambahan, r: HasilRekap | null): { bersih: boolean; alasan: string[] } {
  const alasan: string[] = [];
  if (n.hanyaKds2.length > 0) alasan.push(`${n.hanyaKds2.length} NIP Nominatif hanya di KDS2`);
  if (n.hanyaTerpadu.length > 0) alasan.push(`${n.hanyaTerpadu.length} NIP Nominatif hanya di Terpadu`);
  if (n.nipBedaBaru.length > 0) alasan.push(`${n.nipBedaBaru.length} NIP Nominatif beda kolom (selisih baru)`);
  if (jt.bedaBaru.length > 0) alasan.push(`${jt.bedaBaru.length} NIP jabatan tambahan beda (selisih baru)`);
  if (r) {
    if (r.hanyaKds2.length > 0) alasan.push(`${r.hanyaKds2.length} NIP Absensi hanya di KDS2`);
    if (r.hanyaTerpadu.length > 0) alasan.push(`${r.hanyaTerpadu.length} NIP Absensi hanya di Terpadu`);
    if (r.sel.beda > 0) alasan.push(`${r.sel.beda} sel Absensi beda`);
  }
  return { bersih: alasan.length === 0, alasan };
}
