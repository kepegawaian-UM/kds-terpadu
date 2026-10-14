/**
 * Terjemahan Kamus Koreksi KDS1 ke KDS Terpadu (F4.5c). Nilai kamus berupa KODE master; master KDS1 sebagian berbeda dari master KDS2
 * (kode unit kerja dan jabatan dosen), jadi kode diterjemahkan lewat NAMA master. Fungsi murni: tanpa akses basis data, mudah dites.
 * Entri yang tidak bisa diterjemahkan dengan pasti DILEWATI dan dilaporkan; tidak ada tebakan.
 */

export type BarisMaster = { kode: string; nama: string };
export type TabelMaster = "golongan" | "status" | "dosen" | "tendik" | "umum" | "kategori" | "unit" | "prodi" | "role";
export type MasterLengkap = Record<TabelMaster, BarisMaster[]>;

export const norm = (s: string) => s.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();

/** Nama yang berbeda di master KDS1 dan KDS2 tetapi jelas jabatan yang sama (kode dan urutan jenjang sama: DSN-00). */
const ALIAS_NAMA: Partial<Record<TabelMaster, Record<string, string>>> = { dosen: { "tenaga pengajar": "tenaga dosen" } };

export type KamusKds1 = { id: string; jenisField: string; kunciMentah: string; nilaiResolusi: string; catatan: string | null; dibuatPada: Date };
export type KamusHasil = { jenisField: string; kunciMentah: string; nilaiResolusi: string; catatan: string | null; dibuatPada: Date };
export type Terjemahan = { ok: true; nilai: string } | { ok: false; alasan: string };

/** Penerjemah kode antar master: kode sama + nama sama langsung dipakai; selain itu dicari lewat nama yang unik. */
export function buatPenerjemah(asal: MasterLengkap, tujuan: MasterLengkap) {
  const peta = (t: TabelMaster) => {
    const kodeAsal = new Map(asal[t].map((x) => [x.kode, x.nama]));
    const tujuanPerKode = new Map(tujuan[t].map((x) => [x.kode, x.nama]));
    const tujuanPerNama = new Map<string, string[]>();
    for (const x of tujuan[t]) tujuanPerNama.set(norm(x.nama), [...(tujuanPerNama.get(norm(x.nama)) ?? []), x.kode]);
    const alias = ALIAS_NAMA[t] ?? {};
    return (kode: string): Terjemahan => {
      const nama = kodeAsal.get(kode);
      if (nama === undefined) return { ok: false, alasan: `kode ${kode} tidak ada di master KDS1` };
      const sama = tujuanPerKode.get(kode);
      if (sama !== undefined && norm(sama) === norm(nama)) return { ok: true, nilai: kode };
      const k = tujuanPerNama.get(alias[norm(nama)] ?? norm(nama));
      if (!k) return { ok: false, alasan: `master ${t} "${kode}" tidak punya padanan nama di KDS Terpadu` };
      if (k.length > 1) return { ok: false, alasan: `master ${t} "${kode}" punya padanan nama ganda` };
      return { ok: true, nilai: k[0] };
    };
  };
  const p = Object.fromEntries((["golongan", "status", "dosen", "tendik", "umum", "kategori", "unit", "prodi", "role"] as TabelMaster[]).map((t) => [t, peta(t)])) as Record<TabelMaster, (k: string) => Terjemahan>;

  const namaUnitAsal = new Map(asal.unit.map((x) => [x.kode, x.nama]));
  const prodiPerNama = new Map<string, string[]>();
  for (const x of tujuan.prodi) prodiPerNama.set(norm(x.nama), [...(prodiPerNama.get(norm(x.nama)) ?? []), x.kode]);
  const prodiDariUnit = (kodeUnit: string): Terjemahan | null => {
    const nama = namaUnitAsal.get(kodeUnit);
    const k = nama === undefined ? undefined : prodiPerNama.get(norm(nama));
    return k && k.length === 1 ? { ok: true, nilai: k[0] } : null;
  };

  const KELOMPOK = ["Dosen", "Tendik", "Akademisi Luar UM"];
  const langsung = (t: TabelMaster) => (v: string) => p[t](v);
  const perJenis: Record<string, (v: string) => Terjemahan> = {
    Klasifikasi: (v) => (KELOMPOK.includes(v) ? { ok: true, nilai: v } : { ok: false, alasan: `kelompok "${v}" tidak dikenal` }),
    StatusKepegawaian: langsung("status"),
    Golongan: langsung("golongan"),
    JabatanFungsionalDosen: langsung("dosen"),
    JabatanFungsionalTendik: langsung("tendik"),
    FungsiUmumPelaksana: langsung("umum"),
    KategoriAkademisiLuar: langsung("kategori"),
    UnitKerja: langsung("unit"),
    PegawaiDikecualikanPermanen: (v) => ({ ok: true, nilai: v }),
    JabatanTambahan: (v) => {
      const slot = v.split(";").map((s) => s.split("|"));
      if (slot.length === 0 || slot.some((s) => s.length !== 3)) return { ok: false, alasan: "bentuk jabatan tambahan tidak dikenal" };
      const hasil: string[] = [];
      for (const [role, target, status] of slot) {
        const r = p.role(role);
        if (!r.ok) return r;
        if (target === "NONE") {
          hasil.push(`${r.nilai}|NONE|${status}`);
          continue;
        }
        let awalan: "UNIT:" | "PRODI:";
        let t: Terjemahan;
        if (target.startsWith("UNIT:")) {
          awalan = "UNIT:";
          t = p.unit(target.slice(5));
          // Di KDS1 lama, program studi yang belum ada di master pernah disimpan sebagai Unit Asal. Bila namanya kini punya padanan
          // tunggal di master Program Studi KDS Terpadu, targetnya dialihkan ke Program Studi (tempat yang benar).
          if (!t.ok) {
            const alt = prodiDariUnit(target.slice(5));
            if (alt?.ok) {
              awalan = "PRODI:";
              t = alt;
            }
          }
        } else if (target.startsWith("PRODI:")) {
          awalan = "PRODI:";
          t = p.prodi(target.slice(6));
        } else return { ok: false, alasan: "target jabatan tambahan tidak dikenal" };
        if (!t.ok) return t;
        hasil.push(`${r.nilai}|${awalan}${t.nilai}|${status}`);
      }
      return { ok: true, nilai: hasil.join(";") };
    },
  };

  return (e: KamusKds1): { ok: true; hasil: KamusHasil } | { ok: false; alasan: string } => {
    const f = perJenis[e.jenisField];
    if (!f) return { ok: false, alasan: `jenis "${e.jenisField}" tidak dikenal` };
    const t = f(e.nilaiResolusi);
    if (!t.ok) return { ok: false, alasan: t.alasan };
    return { ok: true, hasil: { jenisField: e.jenisField, kunciMentah: e.kunciMentah, nilaiResolusi: t.nilai, catatan: e.catatan, dibuatPada: e.dibuatPada } };
  };
}
