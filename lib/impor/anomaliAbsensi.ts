/**
 * Peringatan anomali pada tahap PERIKSA Upload Absensi (tambahan Terpadu, tidak ada di KDS2). Semua hanya peringatan: tidak pernah menolak baris atau mengubah hasil
 * impor. Aturan murni (deteksiAnomali) dipisah dari pembacaan database (muatKonteksAnomali) supaya mudah diuji dan bisa dipakai ulang untuk halaman anomali.
 * Daftar ini sengaja terpisah dari catatan impor lama agar paritas importer dengan KDS2 tidak berubah.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export type TingkatAnomali = "penting" | "sedang" | "info";

export type Anomali = { nomorBaris: number; nip: string; nama: string; tingkat: TingkatAnomali; kode: string; pesan: string };

export const BATAS_CUTI_TAHUNAN = 18;
export const BATAS_SAKIT_SETAHUN = 60;

/** Komponen ketidakhadiran/cuti (penugasan TD dan TB dipisah: pegawainya bertugas, bukan absen). */
const IZIN = ["I", "S", "SD", "TK", "CTH", "CTM", "CTB", "CAP", "CTLN"] as const;
const PENUGASAN = ["TD", "TB"] as const;

/** (int) PHP atas teks: bilangan bulat di awal, selain itu 0. */
const n = (v: string | undefined): number => {
  const m = /^\s*([-+]?\d+)/.exec(v ?? "");
  return m ? Number(m[1]) : 0;
};

export type KonteksAnomali = {
  nama: ReadonlyMap<string, string>;
  jenisKelamin: ReadonlyMap<string, string>;
  /** hari Cuti Tahunan pada bulan LAIN di tahun yang sama (yang sudah tersimpan) */
  cthBulanLain: ReadonlyMap<string, number>;
  /** hari Sakit (S + SD) pada bulan lain di tahun yang sama */
  sakitBulanLain: ReadonlyMap<string, number>;
};

/** Pegawai bershift (mis. "Satpam 3 Shift"): kolom JENIS_SHIFT berisi sesuatu selain kosong atau "-". Hari kerjanya memang berbeda dari kantor. */
export function adalahBershift(jenisShift: string | undefined): boolean {
  const s = (jenisShift ?? "").trim();
  return s !== "" && s !== "-" && s !== "0";
}

/** Nilai hari kerja (Σ HARI) yang paling sering muncul di berkas (tanpa pegawai bershift); null bila tidak ada. */
function modusHariKerja(valid: ReadonlyMap<string, Record<string, string>>): number | null {
  const hitung = new Map<number, number>();
  for (const v of valid.values()) {
    if (adalahBershift(v.JENIS_SHIFT)) continue;
    const s = n(v.SIGMA_HARI);
    if (s > 0) hitung.set(s, (hitung.get(s) ?? 0) + 1);
  }
  return [...hitung.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const URUT: Record<TingkatAnomali, number> = { penting: 0, sedang: 1, info: 2 };

export function deteksiAnomali(valid: ReadonlyMap<string, Record<string, string>>, nomorBaris: ReadonlyMap<string, number>, ctx: KonteksAnomali): Anomali[] {
  const hasil: Anomali[] = [];
  const modus = modusHariKerja(valid);

  for (const [nip, v] of valid) {
    const tambah = (tingkat: TingkatAnomali, kode: string, pesan: string) =>
      hasil.push({ nomorBaris: nomorBaris.get(nip) ?? 0, nip, nama: ctx.nama.get(nip) ?? "", tingkat, kode, pesan });
    const sigma = n(v.SIGMA_HARI);
    const masuk = n(v.JUMLAH_MASUK_NYATA);
    const total = n(v.TOTAL);
    const izin = IZIN.reduce((a, k) => a + n(v[k]), 0);
    const tugas = PENUGASAN.reduce((a, k) => a + n(v[k]), 0);
    const rincianIzin = IZIN.filter((k) => n(v[k]) > 0).map((k) => `${k} ${n(v[k])}`).join(", ");

    // ---- PENTING
    const melebihi = sigma > 0 && masuk + izin > sigma + 1;
    if (melebihi) tambah("penting", "melebihi_hari_kerja", `Masuk nyata ${masuk} + tidak hadir ${izin} (${rincianIzin || "-"}) melebihi ${sigma} hari kerja`);
    else if (sigma > 0) {
      for (const k of [...IZIN, ...PENUGASAN]) if (n(v[k]) > sigma) tambah("penting", "komponen_melebihi_hari_kerja", `${k} ${n(v[k])} melebihi ${sigma} hari kerja`);
    }
    if (total > 0 && masuk === 0 && izin === 0 && tugas === 0) {
      tambah("penting", "total_tanpa_komponen", `TOTAL ${total} terisi, tetapi masuk nyata 0 dan tidak ada komponen cuti/izin: kemungkinan cuti atau izin tercatat di kolom yang salah`);
    }
    if (n(v.CTM) > 0 && ctx.jenisKelamin.get(nip) === "L") tambah("penting", "cuti_melahirkan_laki_laki", `Cuti Melahirkan ${n(v.CTM)} hari pada pegawai laki-laki`);
    const cthIni = n(v.CTH);
    const cthKumulatif = cthIni + (ctx.cthBulanLain.get(nip) ?? 0);
    if (cthIni > 0 && cthKumulatif > BATAS_CUTI_TAHUNAN) {
      tambah("penting", "cuti_tahunan_kumulatif", `Cuti Tahunan tahun ini mencapai ${cthKumulatif} hari (bulan ini ${cthIni}, bulan lain ${cthKumulatif - cthIni}); batas wajar sekitar ${BATAS_CUTI_TAHUNAN}`);
    }

    // ---- SEDANG
    if (sigma > 0 && masuk === 0 && total === 0 && izin === 0 && tugas === 0) tambah("sedang", "tanpa_keterangan", `Ada ${sigma} hari kerja, tetapi tidak ada masuk maupun keterangan apa pun`);
    if (sigma > 0 && n(v.TK) >= sigma) tambah("sedang", "tk_sebulan_penuh", `TK ${n(v.TK)} dari ${sigma} hari kerja (sebulan penuh)`);
    const sakitIni = n(v.S) + n(v.SD);
    const sakitKumulatif = sakitIni + (ctx.sakitBulanLain.get(nip) ?? 0);
    if (sakitIni > 0 && sakitKumulatif >= BATAS_SAKIT_SETAHUN) tambah("sedang", "sakit_kumulatif", `Sakit tahun ini mencapai ${sakitKumulatif} hari (bulan ini ${sakitIni})`);

    // ---- INFO
    if (sigma > 0 && modus !== null && sigma !== modus && !adalahBershift(v.JENIS_SHIFT)) tambah("info", "hari_kerja_berbeda", `Hari kerja ${sigma}, berbeda dari yang lazim di berkas (${modus}) padahal bukan pegawai bershift`);
  }
  return hasil.sort((a, b) => URUT[a.tingkat] - URUT[b.tingkat] || a.nomorBaris - b.nomorBaris);
}

export function hitungPerTingkat(daftar: readonly Anomali[]): Record<TingkatAnomali, number> {
  return { penting: daftar.filter((a) => a.tingkat === "penting").length, sedang: daftar.filter((a) => a.tingkat === "sedang").length, info: daftar.filter((a) => a.tingkat === "info").length };
}

type Db = PrismaClient | Prisma.TransactionClient;
const potong = <T>(a: T[], k: number): T[][] => Array.from({ length: Math.ceil(a.length / k) }, (_, i) => a.slice(i * k, (i + 1) * k));

/** Membaca nama, jenis kelamin, dan akumulasi cuti/sakit bulan lain untuk NIP yang ada di berkas. Hanya membaca. */
export async function muatKonteksAnomali(db: Db, nips: string[], bulan: number, tahun: number): Promise<KonteksAnomali> {
  const nama = new Map<string, string>();
  const jenisKelamin = new Map<string, string>();
  const cthBulanLain = new Map<string, number>();
  const sakitBulanLain = new Map<string, number>();
  for (const bagian of potong(nips, 1000)) {
    const orang = await db.$queryRaw<{ nip: string; nama: string; jk: string }[]>`
      select distinct on ("pegawaiNip") "pegawaiNip" as nip, nama, "jenisKelamin" as jk
      from nominatif_bulanan
      where "pegawaiNip" = any(${bagian}::text[]) and (tahun < ${tahun} or (tahun = ${tahun} and bulan <= ${bulan}))
      order by "pegawaiNip", tahun desc, bulan desc`;
    for (const o of orang) {
      nama.set(o.nip, o.nama);
      jenisKelamin.set(o.nip, o.jk);
    }
    const jumlah = await db.$queryRaw<{ nip: string; kode: string; total: number }[]>`
      select r.nip as nip, d."komponenKode" as kode,
             sum(coalesce(nullif(substring(d.nilai from '^[ ]*[-+]?[0-9]+'), '')::int, 0))::int as total
      from rekap_kehadiran_detail d join rekap_kehadiran_bulanan r on r.id = d."rekapKehadiranBulananId"
      where r.tahun = ${tahun} and r.bulan <> ${bulan} and r.nip = any(${bagian}::text[]) and d."komponenKode" in ('CTH', 'S', 'SD')
      group by r.nip, d."komponenKode"`;
    for (const j of jumlah) {
      if (j.kode === "CTH") cthBulanLain.set(j.nip, j.total);
      else sakitBulanLain.set(j.nip, (sakitBulanLain.get(j.nip) ?? 0) + j.total);
    }
  }
  return { nama, jenisKelamin, cthBulanLain, sakitBulanLain };
}
