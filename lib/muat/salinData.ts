/**
 * Menyalin data domain dari satu database KDS Terpadu ke database lain dengan skema yang sama (dipakai memuat data asli dari salinan kerja lokal ke Neon).
 * Digerakkan oleh skema Prisma (DMMF): kolom dibaca dari skema, jadi kolom/tabel baru tidak perlu mengubah pemuat. Semua dalam SATU transaksi di tujuan:
 * gagal di tengah = tidak ada yang tersimpan; dry-run menjalankan semuanya lalu membatalkan. id dipertahankan; urutan id (sequence) disetel mengikuti sumber.
 *
 * Yang TIDAK disalin: akun pengguna dan master (sudah ada di tujuan). Kolom yang menunjuk pengguna (pembuat/pengunggah/penyelesai) diarahkan ke akun admin
 * tujuan (id pengguna lokal tidak ada di tujuan); kolom opsional yang kosong tetap kosong.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

/** Urutan aman untuk kunci asing (induk lebih dulu). Tabel lain (master, user, upload_chunk) sengaja tidak termasuk. */
export const URUTAN_MUAT = [
  "Pegawai", "UploadBatch", "NominatifBulanan", "NominatifBulananJabatanTambahan", "RekapKehadiranBulanan", "RekapKehadiranDetail", "BarisGagalUpload",
  "KoreksiRekap", "CatatanStatusPegawai", "AuditLog", "BarisBermasalah", "KamusKoreksi", "CatatanPerubahanBatch", "KoreksiTanggalMulaiKerja",
] as const;
export type NamaModel = (typeof URUTAN_MUAT)[number];

const HALAMAN = 5_000;
const MAKS_PARAMETER = 30_000;

type Delegate = {
  findMany(a: unknown): Promise<Record<string, unknown>[]>;
  createMany(a: { data: Record<string, unknown>[] }): Promise<unknown>;
  count(): Promise<number>;
};
type Klien = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

const dmmf = (n: string) => Prisma.dmmf.datamodel.models.find((m) => m.name === n)!;
const delegate = (p: unknown, n: string) => (p as Record<string, Delegate>)[n.charAt(0).toLowerCase() + n.slice(1)];
export const tabelDb = (n: string) => dmmf(n).dbName ?? n;
export const kunciUtama = (n: string) => dmmf(n).fields.find((f) => f.isId)!.name;
/** Kolom yang menunjuk tabel User (relasi), untuk diarahkan ke admin tujuan dan dikecualikan dari pembanding. */
export const kolomPengguna = (n: string): string[] => dmmf(n).fields.filter((f) => f.kind === "object" && f.type === "User").flatMap((f) => [...(f.relationFromFields ?? [])]);
const kolomJson = (n: string) => dmmf(n).fields.filter((f) => f.kind === "scalar" && f.type === "Json").map((f) => f.name);
const jumlahKolom = (n: string) => dmmf(n).fields.filter((f) => f.kind === "scalar").length;
const berurutOtomatis = (n: string) => {
  const f = dmmf(n).fields.find((x) => x.isId);
  return !!f && typeof f.default === "object" && f.default !== null && "name" in f.default && f.default.name === "autoincrement";
};
const kutip = (s: string) => `"${s}"`;

export type LaporanTabel = { model: string; tabel: string; dibaca: number; ditulis: number };

/**
 * Hanya jejak audit yang boleh sudah berisi di tujuan (peristiwa keamanan yang sah seperti penggantian kata sandi setelah tujuan dipakai). Barisnya DIPERTAHANKAN:
 * dicatat dulu, lalu ditaruh kembali dengan id baru SETELAH audit riwayat dimuat (id riwayat dipertahankan apa adanya).
 */
const BOLEH_TERISI = new Set(["AuditLog"]);
export type OpsiMuat = {
  sumber: PrismaClient;
  tujuan: PrismaClient;
  /** id akun admin di tujuan: menggantikan semua id pengguna dari sumber */
  adminTujuanId: string;
  dryRun?: boolean;
  lapor?: (pesan: string) => void;
};

class DryRunSelesai extends Error {}

async function urutanSumber(sumber: Klien, model: string): Promise<{ nama: string; nilai: number; dipakai: boolean } | null> {
  if (!berurutOtomatis(model)) return null;
  const r = await sumber.$queryRawUnsafe<{ nama: string | null }[]>(`SELECT pg_get_serial_sequence('${kutip(tabelDb(model))}', '${kunciUtama(model)}') AS nama`);
  const nama = r[0]?.nama;
  if (!nama) return null;
  const [s] = await sumber.$queryRawUnsafe<{ last_value: bigint; is_called: boolean }[]>(`SELECT last_value, is_called FROM ${nama}`);
  return { nama, nilai: Number(s.last_value), dipakai: s.is_called };
}

export async function muatData(opsi: OpsiMuat): Promise<{ dryRun: boolean; durasiMs: number; tabel: LaporanTabel[]; auditDipertahankan: number }> {
  const { sumber, tujuan, adminTujuanId, dryRun = false, lapor = () => {} } = opsi;
  const mulai = Date.now();
  const hasil: LaporanTabel[] = [];
  const urutan = new Map<string, { nama: string; nilai: number; dipakai: boolean }>();
  let auditDipertahankan = 0;
  for (const m of URUTAN_MUAT) {
    const u = await urutanSumber(sumber, m);
    if (u) urutan.set(m, u);
  }

  try {
    await tujuan.$transaction(
      async (tx) => {
        // tujuan harus kosong (tidak pernah menimpa)
        const terisi: string[] = [];
        for (const m of URUTAN_MUAT) {
          const n = await delegate(tx, m).count();
          if (n > 0 && !BOLEH_TERISI.has(m)) terisi.push(`${tabelDb(m)} (${n})`);
        }
        if (terisi.length > 0) throw new Error(`Tujuan tidak kosong: ${terisi.join(", ")}. Pemuatan dihentikan; tidak ada yang diubah.`);
        // baris audit yang sudah ada di tujuan dicatat dan dikosongkan sementara; dikembalikan setelah audit riwayat dimuat
        const auditTujuan = await delegate(tx, "AuditLog").findMany({ orderBy: { id: "asc" } });
        if (auditTujuan.length > 0) await (tx as unknown as { auditLog: { deleteMany(): Promise<unknown> } }).auditLog.deleteMany();

        for (const m of URUTAN_MUAT) {
          const pk = kunciUtama(m);
          const pengguna = new Set(kolomPengguna(m));
          const json = new Set(kolomJson(m));
          const ukuran = Math.max(1, Math.min(HALAMAN, Math.floor(MAKS_PARAMETER / jumlahKolom(m))));
          let dibaca = 0;
          let ditulis = 0;
          let terakhir: unknown = null;
          for (;;) {
            const baris = await delegate(sumber, m).findMany({ take: HALAMAN, orderBy: { [pk]: "asc" }, ...(terakhir === null ? {} : { skip: 1, cursor: { [pk]: terakhir } }) });
            if (baris.length === 0) break;
            dibaca += baris.length;
            const siap = baris.map((r) => {
              const o: Record<string, unknown> = { ...r };
              for (const k of pengguna) o[k] = o[k] === null || o[k] === undefined ? null : adminTujuanId;
              for (const k of json) if (o[k] === null || o[k] === undefined) o[k] = Prisma.DbNull;
              return o;
            });
            for (let i = 0; i < siap.length; i += ukuran) {
              const potong = siap.slice(i, i + ukuran);
              await delegate(tx, m).createMany({ data: potong });
              ditulis += potong.length;
            }
            terakhir = baris[baris.length - 1][pk];
            lapor(`  ${tabelDb(m)}: ${ditulis}`);
          }
          const total = await delegate(sumber, m).count();
          if (dibaca !== total || ditulis !== total) throw new Error(`${tabelDb(m)}: jumlah tidak cocok (sumber ${total}, dibaca ${dibaca}, ditulis ${ditulis})`);
          hasil.push({ model: m, tabel: tabelDb(m), dibaca, ditulis });
          if (m === "AuditLog" && auditTujuan.length > 0) {
            const [mx] = await tx.$queryRawUnsafe<{ maks: number | null }[]>(`SELECT MAX("id")::int AS maks FROM "audit_log"`);
            const awal = (mx.maks ?? 0) + 1;
            await delegate(tx, "AuditLog").createMany({ data: auditTujuan.map((r, i) => ({ ...r, id: awal + i })) });
            auditDipertahankan = auditTujuan.length;
            lapor(`  audit_log: ${auditTujuan.length} baris yang sudah ada di tujuan dipertahankan (id setelah riwayat)`);
          }
        }

        // urutan id: setval TIDAK ikut dibatalkan rollback, jadi hanya diterapkan pada pemuatan sungguhan
        if (!dryRun) {
          for (const [m, u] of urutan) {
            const [mx] = await tx.$queryRawUnsafe<{ maks: number | null }[]>(`SELECT MAX(${kutip(kunciUtama(m))})::int AS maks FROM ${kutip(tabelDb(m))}`);
            const nilai = Math.max(u.nilai, mx.maks ?? 0);
            const sudahDipakai = u.dipakai || (mx.maks ?? 0) > 0;
            await tx.$queryRawUnsafe(`SELECT setval('${u.nama}', ${Math.max(nilai, 1)}, ${sudahDipakai})`);
          }
        }
        if (dryRun) throw new DryRunSelesai();
      },
      { timeout: 30 * 60_000, maxWait: 60_000 },
    );
  } catch (e) {
    if (!(e instanceof DryRunSelesai)) throw e;
  }
  return { dryRun, durasiMs: Date.now() - mulai, tabel: hasil, auditDipertahankan };
}

export type BarisVerifikasi = { tabel: string; jumlahSumber: number; jumlahTujuan: number; sama: boolean };

/**
 * Membandingkan SEMUA baris: jumlah dan sidik jari md5 dari seluruh isi baris terurut menurut kunci (kolom penunjuk pengguna dikecualikan karena sengaja
 * diarahkan ke admin tujuan). Hanya angka dan nilai sidik jari yang dikembalikan; tidak ada isi baris.
 */
export async function verifikasiSalinan(sumber: Klien, tujuan: Klien): Promise<BarisVerifikasi[]> {
  // Jejak audit yang ditambahkan di tujuan SETELAH pemuatan (id di atas id terbesar sumber) bukan bagian salinan: tidak ikut dibandingkan.
  const [ms] = await sumber.$queryRawUnsafe<{ maks: number | null }[]>(`SELECT MAX("id")::int AS maks FROM "audit_log"`);
  const batasAudit = ms.maks ?? 0;
  const sidik = async (k: Klien, m: string) => {
    const pk = kunciUtama(m);
    const buang = kolomPengguna(m);
    const dasar = buang.length > 0 ? `(to_jsonb(t) - ARRAY[${buang.map((c) => `'${c}'`).join(",")}]::text[])::text` : "to_jsonb(t)::text";
    // to_jsonb tidak membedakan NULL SQL dari JSON null: kolom Json ikut diperiksa "IS NULL" agar keduanya tidak tertukar
    const isi = kolomJson(m).length > 0 ? `${dasar} || '#' || ${kolomJson(m).map((c) => `(t.${kutip(c)} IS NULL)::text`).join(" || ")}` : dasar;
    // kunci teks diurutkan per byte (COLLATE "C") supaya urutan sama di database dengan kolasi berbeda; kunci angka tidak mendukung COLLATE
    const urut = dmmf(m).fields.find((f) => f.isId)!.type === "String" ? `t.${kutip(pk)} COLLATE "C"` : `t.${kutip(pk)}`;
    const [r] = await k.$queryRawUnsafe<{ n: number; h: string }[]>(
      `SELECT count(*)::int AS n, coalesce(md5(string_agg(${isi}, '|' ORDER BY ${urut})), '') AS h FROM ${kutip(tabelDb(m))} t${m === "AuditLog" ? ` WHERE t."id" <= ${batasAudit}` : ""}`,
    );
    return r;
  };
  const hasil: BarisVerifikasi[] = [];
  for (const m of URUTAN_MUAT) {
    const [a, b] = [await sidik(sumber, m), await sidik(tujuan, m)];
    hasil.push({ tabel: tabelDb(m), jumlahSumber: a.n, jumlahTujuan: b.n, sama: a.n === b.n && a.h === b.h });
  }
  return hasil;
}
