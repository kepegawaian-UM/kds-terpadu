/**
 * F5.1: membandingkan data SATU bulan antara KDS2 (MySQL kds2_produksi, hanya SELECT) dan KDS Terpadu (PostgreSQL lokal kds_f5/kds_paritas).
 * Nominatif (per kolom), Jabatan Tambahan, dan Rekap Kehadiran (per sel). Hanya agregat yang dicetak (jumlah dan pasangan KODE master);
 * tidak ada NIP atau nama di layar. Daftar NIP selisih ditulis ke berkas lokal hanya bila diminta (--berkas); folder .f5-keluaran
 * sudah diabaikan git.
 *
 *   npm run f5:bandingkan -- <bulan> <tahun> [--berkas]
 *
 * Alamat Terpadu: F5_DATABASE_URL (default PARITAS_DATABASE_URL); nama database harus kds_f5 atau kds_paritas.
 * Keluar dengan kode 1 bila ada selisih baru (di luar perbedaan yang sudah diputuskan, lihat docs/09 §4).
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import {
  type BarisNominatif, KOLOM_NOMINATIF, type SlotJabatan, bandingkanJabatanTambahan, bandingkanNominatif, bandingkanRekap, nilaiBulan,
} from "../lib/f5/bandingkan";
import { bukaKds2BacaSaja } from "./kds2-mysql";
import { TABEL_DOMAIN } from "./migrasi/tabel";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const bulan = Number(args[0]);
const tahun = Number(args[1]);
const tulisBerkas = process.argv.includes("--berkas");
if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12 || !Number.isInteger(tahun)) throw new Error("Pakai: npm run f5:bandingkan -- <bulan 1-12> <tahun> [--berkas]");

const url = process.env.F5_DATABASE_URL || process.env.PARITAS_DATABASE_URL || "";
if (!/\/kds_(f5|paritas)(\?|$)/.test(url)) throw new Error("F5_DATABASE_URL/PARITAS_DATABASE_URL harus menunjuk database lokal kds_f5 atau kds_paritas.");
const pg = new PrismaClient({ datasourceUrl: url });
const bacaPg = async <T>(sql: string, ...nilai: unknown[]): Promise<T[]> => {
  if (!/^\s*select\b/i.test(sql)) throw new Error("Hanya SELECT yang diizinkan.");
  return (await pg.$queryRawUnsafe(sql, ...nilai)) as T[];
};

const tabelNominatif = TABEL_DOMAIN.find((t) => t.mysql === "nominatif_bulanan")!;
const kolomMy = (pgNama: string) => tabelNominatif.kolom.find((k) => k.pg === pgNama)!;
const persen = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);
const urut = (m: Map<string, number>, n = 6) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, c]) => `${k} x${c}`).join(" | ");

async function main() {
  const kds2 = await bukaKds2BacaSaja();
  try {
    // ---- Nominatif ----
    const ekspresi = ["nip AS pegawaiNip", ...KOLOM_NOMINATIF.map((k) => {
      const c = kolomMy(k);
      return c.tipe === "date" ? `DATE_FORMAT(\`${c.my}\`, '%Y-%m-%d') AS \`${k}\`` : `\`${c.my}\` AS \`${k}\``;
    })].join(", ");
    const nomKds2 = await kds2.kueri<BarisNominatif>(`SELECT ${ekspresi} FROM nominatif_bulanan WHERE bulan = ? AND tahun = ?`, [bulan, tahun]);
    const ekspresiPg = ['"pegawaiNip"', ...KOLOM_NOMINATIF.map((k) => (kolomMy(k).tipe === "date" ? `to_char("${k}", 'YYYY-MM-DD') AS "${k}"` : `"${k}"`))].join(", ");
    const nomPg = await bacaPg<BarisNominatif>(`SELECT ${ekspresiPg} FROM nominatif_bulanan WHERE bulan = $1 AND tahun = $2`, bulan, tahun);
    const kategoriStatus = new Map((await bacaPg<{ kode: string; kategori: string }>("SELECT kode, kategori FROM mst_status_kepegawaian")).map((s) => [s.kode, s.kategori]));

    console.log(`=== Bulan ${bulan}/${tahun} | KDS2 (MySQL) vs Terpadu (${url.split("/").pop()?.split("?")[0]}) ===`);
    console.log(`\n[Nominatif] KDS2=${nomKds2.length} baris | Terpadu=${nomPg.length} baris`);
    const n = bandingkanNominatif(nomKds2, nomPg, { kategoriStatus });
    console.log(`  NIP hanya di KDS2: ${n.hanyaKds2.length} | hanya di Terpadu: ${n.hanyaTerpadu.length}`);
    const bersama = n.jumlahKds2 - n.hanyaKds2.length;
    for (const k of KOLOM_NOMINATIF) {
      const s = n.perKolom[k];
      const pasangan = s.pasangan.size > 0 ? `  [${urut(s.pasangan)}]` : "";
      console.log(`  kolom ${k.padEnd(28)} sama ${String(s.sama).padStart(5)}/${bersama} (${persen(s.sama, bersama)})${pasangan}`);
    }
    console.log(`  NIP beda hanya karena perbedaan diketahui (golongan Non-ASN): ${n.nipBedaDiketahui} | NIP beda selisih BARU: ${n.nipBedaBaru.length}`);

    // ---- Jabatan Tambahan ----
    const slotKds2 = new Map<string, SlotJabatan[]>();
    for (const r of await kds2.kueri<{ nip: string; role: string; unit: string | null; prodi: string | null; status: string | null }>(
      "SELECT n.nip AS nip, j.jabatan_tambahan_role_kode AS role, j.unit_asal_kode AS unit, j.program_studi_kode AS prodi, j.status_pengangkatan AS status " +
        "FROM nominatif_bulanan_jabatan_tambahan j JOIN nominatif_bulanan n ON n.id = j.nominatif_bulanan_id WHERE n.bulan = ? AND n.tahun = ?", [bulan, tahun])) {
      slotKds2.set(r.nip, [...(slotKds2.get(r.nip) ?? []), r]);
    }
    const slotPg = new Map<string, SlotJabatan[]>();
    for (const r of await bacaPg<{ nip: string; role: string; unit: string | null; prodi: string | null; status: string | null }>(
      'SELECT n."pegawaiNip" AS nip, j."jabatanTambahanRoleKode" AS role, j."unitAsalKode" AS unit, j."programStudiKode" AS prodi, j."statusPengangkatan" AS status ' +
        'FROM nominatif_bulanan_jabatan_tambahan j JOIN nominatif_bulanan n ON n.id = j."nominatifBulananId" WHERE n.bulan = $1 AND n.tahun = $2', bulan, tahun)) {
      slotPg.set(r.nip, [...(slotPg.get(r.nip) ?? []), r]);
    }
    const nipBersama = nomKds2.map((r) => String(r.pegawaiNip)).filter((nip) => nomPg.some((p) => p.pegawaiNip === nip));
    const jt = bandingkanJabatanTambahan(slotKds2, slotPg, nipBersama);
    // Selisih yang SUDAH dikonfirmasi pengguna per NIP (berkas lokal .f5-keluaran/dikonfirmasi.json, diabaikan git):
    // {"jabatanTambahan": ["<nip>", ...], "nominatif": ["<nip>", ...]}. Disebut terpisah di keluaran, tidak disembunyikan.
    const konfirmasi: { jabatanTambahan?: string[]; nominatif?: string[] } = existsSync(".f5-keluaran/dikonfirmasi.json") ? JSON.parse(readFileSync(".f5-keluaran/dikonfirmasi.json", "utf8")) : {};
    const jtDikonfirmasi = jt.bedaBaru.filter((x) => konfirmasi.jabatanTambahan?.includes(x));
    jt.bedaBaru = jt.bedaBaru.filter((x) => !jtDikonfirmasi.includes(x));
    const nomDikonfirmasi = n.nipBedaBaru.filter((x) => konfirmasi.nominatif?.includes(x));
    n.nipBedaBaru = n.nipBedaBaru.filter((x) => !nomDikonfirmasi.includes(x));
    console.log(`\n[Jabatan Tambahan] slot KDS2=${[...slotKds2.values()].flat().length} | Terpadu=${[...slotPg.values()].flat().length}`);
    if (jtDikonfirmasi.length + nomDikonfirmasi.length > 0) console.log(`  [dikonfirmasi pengguna, tidak dihitung selisih baru] jabatan tambahan: ${jtDikonfirmasi.length} | kolom Nominatif: ${nomDikonfirmasi.length}`);
    console.log(`  NIP sama: ${jt.sama} | Terpadu lebih lengkap (slot merangkap / tujuan unit-prodi yang kosong di KDS2, diketahui): ${jt.terpaduLebihLengkapDiketahui} | selisih BARU: ${jt.bedaBaru.length}`);

    // ---- Rekap Kehadiran ----
    const muatRekap = (baris: { nip: string; komponen: string; nilai: string | null }[]) => {
      const m = new Map<string, Map<string, string | null>>();
      for (const r of baris) {
        if (!m.has(r.nip)) m.set(r.nip, new Map());
        m.get(r.nip)!.set(r.komponen, r.nilai === null ? null : String(r.nilai));
      }
      return m;
    };
    const rekapKds2 = muatRekap(await kds2.kueri(
      "SELECT r.nip AS nip, d.komponen_kode AS komponen, d.nilai AS nilai FROM rekap_kehadiran_detail d JOIN rekap_kehadiran_bulanan r ON r.id = d.rekap_kehadiran_bulanan_id WHERE r.bulan = ? AND r.tahun = ?", [bulan, tahun]));
    const rekapPg = muatRekap(await bacaPg(
      'SELECT r.nip AS nip, d."komponenKode" AS komponen, d.nilai AS nilai FROM rekap_kehadiran_detail d JOIN rekap_kehadiran_bulanan r ON r.id = d."rekapKehadiranBulananId" WHERE r.bulan = $1 AND r.tahun = $2', bulan, tahun));
    console.log(`\n[Rekap Kehadiran] KDS2=${rekapKds2.size} pegawai | Terpadu=${rekapPg.size} pegawai`);
    let r = null as ReturnType<typeof bandingkanRekap> | null;
    if (rekapKds2.size === 0 && rekapPg.size === 0) {
      console.log("  (tidak ada Rekap bulan ini di kedua sisi; dilewati)");
    } else {
      r = bandingkanRekap(rekapKds2, rekapPg);
      console.log(`  NIP hanya di KDS2: ${r.hanyaKds2.length} | hanya di Terpadu: ${r.hanyaTerpadu.length} | sel dibandingkan ${r.sel.dibandingkan}, beda ${r.sel.beda}${r.bedaPerKomponen.size > 0 ? `  [${urut(r.bedaPerKomponen)}]` : ""}`);
    }

    const nilai = nilaiBulan(n, jt, r);
    console.log(`\n=== HASIL: ${nilai.bersih ? "BERSIH (tidak ada selisih baru)" : "ADA SELISIH BARU"} ===`);
    for (const a of nilai.alasan) console.log(`  - ${a}`);

    if (tulisBerkas) {
      mkdirSync(".f5-keluaran", { recursive: true });
      const jalur = `.f5-keluaran/${tahun}-${String(bulan).padStart(2, "0")}-selisih.json`;
      writeFileSync(jalur, JSON.stringify({ nominatif: { hanyaKds2: n.hanyaKds2, hanyaTerpadu: n.hanyaTerpadu, bedaBaru: n.nipBedaBaru }, jabatanTambahan: jt.bedaBaru, rekap: r ? { hanyaKds2: r.hanyaKds2, hanyaTerpadu: r.hanyaTerpadu, nipBeda: r.nipBeda } : null }, null, 1));
      console.log(`Daftar NIP selisih ditulis ke ${jalur} (lokal, diabaikan git).`);
    }
    if (!nilai.bersih) process.exitCode = 1;
  } finally {
    await kds2.tutup();
    await pg.$disconnect();
  }
}

main().catch((e) => {
  console.error("Gagal:", e instanceof Error ? e.message.slice(0, 400) : e);
  process.exit(2);
});
