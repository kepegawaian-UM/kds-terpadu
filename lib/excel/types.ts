export type RawNominatifRow = {
  nip: string;
  namaDenganGelar: string;
  namaTanpaGelar: string;
  jenisKelaminRaw: string;
  tanggalLahir: Date | null;
  agamaRaw: string;
  statusPegawaiRaw: string;
  jenisPegawaiRaw: string;
  kelompokJabatanRaw: string | null;
  golonganPangkatRaw: string;
  jabatanFungsionalRaw: string;
  jabatanTambahanRaw: string;
  pendidikanRaw: string;
  subagUnitKerjaRaw: string;
  unitKerjaIndukRaw: string;
  direktoratFakultasRaw: string;
  unitStatistikRaw: string;
  tanggalMasuk: Date | null;
  /** Cuma terisi di format tarikan SIMPEGA baru (REKAP_PEGAWAI, mulai Okt 2026) yang punya
   *  kolom "Unit Kerja Jabatan Tambahan" terpisah dari nama role-nya sendiri - string kosong
   *  di format lama. Dipakai sbg fallback tambahan di classify.ts, BUKAN pengganti ekstraksi
   *  dari teks gabungan (kolom ini kadang berisi unit kerja UTAMA orangnya, bukan target
   *  jabatan tambahan spesifik - mis. utk role Pembina Asrama).*/
  unitKerjaJabatanTambahanRaw: string;
};

export type ColumnMappingWarning = { pesan: string };

export type ParseRawNominatifResult = {
  rows: RawNominatifRow[];
  totalBarisSheet: number;
  petaKolomTerdeteksi: Record<string, number | null>;
};

export class ColumnMappingError extends Error {}
