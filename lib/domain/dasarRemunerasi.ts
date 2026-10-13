/**
 * Dasar Remunerasi dihitung PER SNAPSHOT BULANAN (tidak disimpan). Prioritas:
 * Jabatan Tambahan di bulan itu (slot pertama = id terkecil) -> Jabatan Fungsional (Dosen untuk DSN,
 * Tendik untuk TDK) -> Jabatan Fungsi Umum Pelaksana (hanya TDK). Akademisi Luar: tidak ada.
 * Port dari App\Services\DasarRemunerasiResolver (KDS2).
 */
export type SnapshotDasarRemunerasi = {
  jenisPegawaiKode: string;
  jabatanTambahan: { id: number; role: { namaRole: string } | null }[];
  jabatanFungsionalDosen: { nama: string } | null;
  jabatanFungsionalTendik: { jabatanPokok: string; jenjang: string } | null;
  jabatanFungsiUmum: { nama: string } | null;
};

export type DasarRemunerasi = { sumber: string; nama: string | null } | null;

export function dasarRemunerasi(s: SnapshotDasarRemunerasi): DasarRemunerasi {
  const pertama = [...s.jabatanTambahan].sort((a, b) => a.id - b.id)[0];
  if (pertama) return { sumber: "Jabatan Tambahan", nama: pertama.role?.namaRole ?? null };

  if (s.jenisPegawaiKode === "DSN" && s.jabatanFungsionalDosen) {
    return { sumber: "Jabatan Fungsional", nama: s.jabatanFungsionalDosen.nama };
  }
  if (s.jenisPegawaiKode === "TDK" && s.jabatanFungsionalTendik) {
    return {
      sumber: "Jabatan Fungsional",
      nama: `${s.jabatanFungsionalTendik.jabatanPokok} (${s.jabatanFungsionalTendik.jenjang})`,
    };
  }
  if (s.jenisPegawaiKode === "TDK" && s.jabatanFungsiUmum) {
    return { sumber: "Jabatan Fungsi Umum Pelaksana", nama: s.jabatanFungsiUmum.nama };
  }
  return null;
}
