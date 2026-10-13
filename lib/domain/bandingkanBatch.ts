import { cariKandidatIdentitasMirip, normalisasiNamaIdentitas } from "./identitasEksternal";

export type PegawaiRingkas = {
  nip: string;
  nama: string;
  jenisPegawai: string;
  status: string;
  unitKerja: string;
};

/**
 * "NIP Anomali" - satu grup pegawai (2 anggota atau lebih) yang kemungkinan besar sebenarnya 1
 * orang yang sama tapi tercatat dgn NIP berbeda-beda:
 * - "DalamBatch": nama identik (persis, setelah dibersihkan) muncul >1x di batch B SENDIRI -
 *   deteksi exact-match, tidak butuh skor (selalu dianggap yakin).
 * - "LintasBatch": nama di "orang hilang" (A) mirip (dice >= ambang) dgn "orang baru" (B) -
 *   kandidat NIP berubah ANTAR batch, dipasangkan greedy skor tertinggi dulu.
 */
export type AnomaliNip = {
  nama: string;
  anggota: PegawaiRingkas[];
  sumber: "DalamBatch" | "LintasBatch";
  skor?: number;
};

export type HasilBandingkan = {
  orangBaru: PegawaiRingkas[];
  orangHilang: PegawaiRingkas[];
  nipAnomali: AnomaliNip[];
};

export const AMBANG_SKOR_NIP_BERUBAH = 0.7;

/**
 * Bandingkan 2 daftar pegawai (biasanya 2 batch berbeda) murni berdasar NIP, lalu cari dua jenis
 * anomali: (1) nama yang sama persis muncul >1x DALAM batch B sendiri (orang yang sama dihitung
 * berkali-kali dlm 1 bulan - ditemukan pertama kali pada kasus Akademisi Luar UM September 2026),
 * dan (2) "orang hilang" (A) yang namanya SANGAT mirip dgn "orang baru" (B) - kemungkinan orang yg
 * sama, NIP-nya berubah antar bulan. Keduanya CUMA dokumentasi/sinyal utk admin - tidak ada
 * perubahan data otomatis (lihat CatatanPerubahanBatch, diisi manual oleh admin kalau perlu).
 */
export function bandingkanDaftarPegawai(
  daftarA: PegawaiRingkas[],
  daftarB: PegawaiRingkas[]
): HasilBandingkan {
  const nipA = new Set(daftarA.map((p) => p.nip));
  const nipB = new Set(daftarB.map((p) => p.nip));

  const hilangMentah = daftarA.filter((p) => !nipB.has(p.nip));
  const baruMentah = daftarB.filter((p) => !nipA.has(p.nip));

  // 1. Duplikat nama PERSIS dalam batch B sendiri (cek SELURUH daftarB, bukan cuma baruMentah -
  // supaya tetap ketangkap walau salah satu NIP anggotanya kebetulan juga ada di A).
  const byNamaDalamB = new Map<string, PegawaiRingkas[]>();
  for (const p of daftarB) {
    const key = normalisasiNamaIdentitas(p.nama);
    const list = byNamaDalamB.get(key) ?? [];
    list.push(p);
    byNamaDalamB.set(key, list);
  }
  // Dibuktikan lewat data riil (kasus September 2026): nama sama kebetulan bisa terjadi utk
  // nama Indonesia umum (Tendik, mis. "Santoso"/"Sugianto" - 2 orang BEDA, satu PNS lama satu
  // Non-ASN direkrut belakangan) - itu BUKAN duplikat. Sebaliknya nama sama persis di kategori
  // Akademisi Luar UM (nama internasional panjang & khas) nyaris pasti orang yang sama. Syarat
  // "minimal 1 anggota AKL" memisahkan dua populasi ini tanpa menebak dari panjang/bentuk nama.
  const duplikatDalamB = [...byNamaDalamB.values()].filter(
    (list) =>
      list.length > 1 &&
      new Set(list.map((p) => p.nip)).size > 1 &&
      list.some((p) => p.jenisPegawai === "Akademisi Luar UM")
  );
  const nipTerlibatDuplikat = new Set(duplikatDalamB.flatMap((list) => list.map((p) => p.nip)));

  // 2. Pasangan lintas batch (hilang <-> baru mirip) - NIP baru yang sudah masuk duplikat #1
  // dikecualikan dari pencarian ini supaya 1 NIP tidak dihitung di 2 anomali sekaligus.
  const baruUntukPairing = baruMentah.filter((p) => !nipTerlibatDuplikat.has(p.nip));
  const baruByNip = new Map(baruUntukPairing.map((p) => [p.nip, p]));
  const hilangByNip = new Map(hilangMentah.map((p) => [p.nip, p]));

  type Pasangan = { nipHilang: string; nipBaru: string; skor: number };
  const semuaPasangan: Pasangan[] = [];
  for (const h of hilangMentah) {
    const kandidat = cariKandidatIdentitasMirip(h.nama, baruUntukPairing, baruUntukPairing.length || 1);
    for (const k of kandidat) {
      if (k.skor >= AMBANG_SKOR_NIP_BERUBAH) {
        semuaPasangan.push({ nipHilang: h.nip, nipBaru: k.nip, skor: k.skor });
      }
    }
  }
  semuaPasangan.sort((a, b) => b.skor - a.skor);

  const hilangTerpakai = new Set<string>();
  const baruTerpakai = new Set<string>();
  const pasanganLintasBatch: AnomaliNip[] = [];
  for (const p of semuaPasangan) {
    if (hilangTerpakai.has(p.nipHilang) || baruTerpakai.has(p.nipBaru)) continue;
    const hilangOrang = hilangByNip.get(p.nipHilang);
    const baruOrang = baruByNip.get(p.nipBaru);
    if (!hilangOrang || !baruOrang) continue;
    pasanganLintasBatch.push({
      nama: baruOrang.nama,
      anggota: [hilangOrang, baruOrang],
      sumber: "LintasBatch",
      skor: p.skor,
    });
    hilangTerpakai.add(p.nipHilang);
    baruTerpakai.add(p.nipBaru);
  }

  const nipAnomaliTotal = new Set([...nipTerlibatDuplikat, ...baruTerpakai]);

  const nipAnomali: AnomaliNip[] = [
    ...duplikatDalamB.map((list): AnomaliNip => ({ nama: list[0].nama, anggota: list, sumber: "DalamBatch" })),
    ...pasanganLintasBatch,
  ];

  return {
    orangBaru: baruMentah.filter((p) => !nipAnomaliTotal.has(p.nip)),
    orangHilang: hilangMentah.filter((p) => !hilangTerpakai.has(p.nip)),
    nipAnomali,
  };
}

/** NIP "utama" yang dipakai sbg kunci stabil utk 1 grup anomali - deterministik (NIP terkecil
 *  scr string) supaya catatan admin yang sudah disimpan tetap "nempel" ke grup yg sama walau
 *  halaman dibuka ulang / urutan daftar berubah. */
export function nipUtamaAnomali(anomali: AnomaliNip): string {
  return [...anomali.anggota].map((a) => a.nip).sort()[0];
}
