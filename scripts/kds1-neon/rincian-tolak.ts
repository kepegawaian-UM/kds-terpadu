/** Rincian BACA-SAJA untuk entri kamus yang ditolak: nama master (bukan data pegawai) dan bentuk target jabatan tambahan. */
import { denganKds1 } from "./sambung";

async function main() {
  await denganKds1(async (q) => {
    const unit = await q<{ kode: string; nama: string; unitIndukKode: string }>(`select "kode", "nama", "unitIndukKode" from mst_unit_asal where "kode" in ('UA-206','UA-207','UA-208','UA-209','UA-210','UA-211','UA-212','UA-213','UA-214','UA-215','UA-216','UA-217','UA-218','UA-219','UA-220') order by 1`);
    console.log("Unit kerja hanya di KDS1:", unit.map((u) => `${u.kode}=${u.nama} (induk ${u.unitIndukKode})`).join(" | "));
    const dsn = await q<{ kode: string; nama: string }>(`select "kode", "nama" from mst_jabatan_fungsional_dosen order by 1`);
    console.log("Jabatan dosen KDS1:", dsn.map((d) => `${d.kode}=${d.nama}`).join(" | "));
    const tk = await q<{ nilaiResolusi: string }>(`select "nilaiResolusi" from kamus_koreksi where "jenisField" = 'JabatanTambahan' and "nilaiResolusi" not like '%UNIT:%' and "nilaiResolusi" not like '%PRODI:%'`);
    console.log("Bentuk target tak dikenal:", tk.map((t) => t.nilaiResolusi.slice(0, 80)).join(" || "));
  });
}
main().catch((e) => { console.error("Gagal:", String(e).slice(0, 300)); process.exit(1); });
