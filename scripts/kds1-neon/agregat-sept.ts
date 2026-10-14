/** Agregat BACA-SAJA dari snapshot September 2026 di Neon KDS1: pembanding hasil Standarisasi KDS1 asli vs KDS Terpadu vs KDS2. Tanpa NIP/nama. */
import { denganKds1 } from "./sambung";

async function main() {
  await denganKds1(async (q) => {
    const batch = await q<{ id: string; status: string; n: bigint }>(`select b."id", b."status", (select count(*) from nominatif_bulanan n where n."uploadBatchId" = b."id")::bigint as n from upload_batch b where b."bulan" = 9 and b."tahun" = 2026`);
    console.log("Batch Sept 2026 di KDS1:", batch.map((b) => `${b.status}:${b.n}`).join(", "));
    const jab = await q<{ t: string | null; u: string | null; n: bigint }>(`select t."jabatanPokok" || ' ' || t."jenjang" as t, u."nama" as u, count(*)::bigint as n from nominatif_bulanan n join upload_batch b on b."id" = n."uploadBatchId" left join mst_jabatan_fungsional_tendik t on t."kode" = n."jabatanFungsionalTendikKode" left join mst_jabatan_fungsi_umum_pelaksana u on u."kode" = n."jabatanFungsiUmumKode" where b."bulan" = 9 and b."tahun" = 2026 and b."status" <> 'Dibatalkan' and (n."jabatanFungsionalTendikKode" is not null or n."jabatanFungsiUmumKode" is not null) group by 1, 2 order by 3 desc limit 8`);
    console.log("Jabatan Tendik/Umum (KDS1 Sept):", jab.map((j) => `tendik="${j.t}" umum="${j.u}" x${j.n}`).join(" | "));
    const gol = await q<{ s: string; g: string | null; n: bigint }>(`select n."statusKepegawaianKode" as s, n."golonganKode" as g, count(*)::bigint as n from nominatif_bulanan n join upload_batch b on b."id" = n."uploadBatchId" where b."bulan" = 9 and b."tahun" = 2026 and b."status" <> 'Dibatalkan' and n."statusKepegawaianKode" in (select "kode" from mst_status_kepegawaian where "kategori" <> 'ASN') group by 1, 2 order by 3 desc limit 12`);
    console.log("Golongan Non-ASN (KDS1 Sept):", gol.map((g) => `${g.s}:${g.g ?? "kosong"} x${g.n}`).join(" | "));
  });
}
main().catch((e) => { console.error("Gagal:", String(e).slice(0, 300)); process.exit(1); });
