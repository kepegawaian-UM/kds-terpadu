import type { ReactNode } from "react";

/** Judul halaman dengan kontrol (filter, tombol unduh) di kanannya: satu baris yang ringkas, tanpa kalimat penjelasan. */
export function KepalaHalaman({ judul, children }: { judul: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <h1 className="text-xl font-semibold text-slate-900">{judul}</h1>
      {children && <div className="tanpa-cetak flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>}
    </div>
  );
}

export const tombolSekunder = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50";
export const tombolUtama = "rounded-md bg-sidebar px-3 py-1.5 text-sm font-medium text-white hover:bg-sidebar-lighter";
