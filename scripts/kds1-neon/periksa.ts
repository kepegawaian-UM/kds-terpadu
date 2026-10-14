/** Pemeriksaan BACA-SAJA Neon KDS1: daftar tabel, jumlah baris, dan kolom tabel yang akan dimigrasikan. Tidak mencetak isi data. */
import { denganKds1 } from "./sambung";

const TABEL_RINCI = ["kamus_koreksi", "catatan_perubahan_batch", "upload_batch"];

async function main() {
  await denganKds1(async (q) => {
    const tabel = await q<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1");
    for (const t of tabel) {
      const [{ n }] = await q<{ n: bigint }>(`select count(*)::bigint as n from "${t.table_name}"`);
      console.log(`${t.table_name}: ${n}`);
    }
    for (const t of TABEL_RINCI) {
      const kolom = await q<{ column_name: string; data_type: string }>("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position", t);
      console.log(`\n[${t}] ${kolom.map((k) => `${k.column_name}:${k.data_type}`).join(", ")}`);
    }
    const [{ jumlah }] = await q<{ jumlah: bigint }>("select count(*)::bigint as jumlah from kamus_koreksi");
    const perJenis = await q<{ jenis_field: string; n: bigint }>('select "jenisField" as jenis_field, count(*)::bigint as n from kamus_koreksi group by 1 order by 2 desc');
    console.log(`\nkamus_koreksi per jenis (total ${jumlah}):`, perJenis.map((p) => `${p.jenis_field}=${p.n}`).join(", "));
    const batch = await q<{ status: string; n: bigint; tahun_min: number; tahun_maks: number }>("select status, count(*)::bigint as n, min(tahun) as tahun_min, max(tahun) as tahun_maks from upload_batch group by 1");
    console.log("upload_batch per status:", batch.map((b) => `${b.status}=${b.n} (${b.tahun_min}-${b.tahun_maks})`).join(", "));
  });
}

main().catch((e) => {
  console.error("Gagal:", e instanceof Error ? e.message.split("\n").slice(-3).join(" ").slice(0, 300) : e);
  process.exit(1);
});
