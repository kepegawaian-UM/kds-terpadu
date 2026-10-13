/**
 * Formulir periode + filter laporan. Dikirim sebagai GET (tanpa JavaScript) sehingga alamat
 * halaman memuat semua pilihan dan bisa dibagikan/disimpan - sama dengan KDS2.
 * Komponen server: tidak memakai state, hanya markup.
 */
import type { ReactNode } from "react";

import { type Keaktifan, PILIHAN_KEAKTIFAN } from "@/lib/laporan/filter";
import { NAMA_BULAN } from "@/lib/laporan/periode";

const kotak = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const label = "block text-xs font-medium text-slate-600";

export function FormLaporan({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} className="tanpa-cetak flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {children}
      <button type="submit" className="rounded-md bg-sidebar px-4 py-1.5 text-sm font-medium text-white hover:bg-sidebar-lighter">
        Terapkan
      </button>
    </form>
  );
}

/** Pilihan bulan (opsional) dan tahun. Tahun terpilih selalu ada di daftar. */
export function BidangPeriode({
  bulan,
  tahun,
  tahunTersedia,
}: {
  bulan?: number;
  tahun: number;
  tahunTersedia: number[];
}) {
  const daftarTahun = [...new Set([...tahunTersedia, tahun])].sort((a, b) => b - a);
  return (
    <>
      {bulan !== undefined && (
        <div>
          <label htmlFor="f-bulan" className={label}>
            Bulan
          </label>
          <select id="f-bulan" name="bulan" defaultValue={String(bulan)} className={kotak}>
            {NAMA_BULAN.slice(1).map((nama, i) => (
              <option key={nama} value={i + 1}>
                {nama}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="f-tahun" className={label}>
          Tahun
        </label>
        <select id="f-tahun" name="tahun" defaultValue={String(tahun)} className={kotak}>
          {daftarTahun.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** Filter Jenis (Dosen/Tendik), Status Kepegawaian, dan Keaktifan untuk laporan Rekap. */
export function BidangFilterRekap({
  jenis,
  status,
  keaktifan,
  daftarStatus,
}: {
  jenis: string[];
  status: string[];
  keaktifan: Keaktifan;
  daftarStatus: { kode: string; nama: string }[];
}) {
  return (
    <>
      <fieldset>
        <legend className={label}>Jenis Pegawai</legend>
        <div className="flex gap-3 pt-1.5 text-sm">
          {[
            ["DSN", "Dosen"],
            ["TDK", "Tendik"],
          ].map(([kode, nama]) => (
            <label key={kode} className="flex items-center gap-1.5">
              <input type="checkbox" name="jenis" value={kode} defaultChecked={jenis.includes(kode)} />
              {nama}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={label}>Status Kepegawaian</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-sm">
          {daftarStatus.map((s) => (
            <label key={s.kode} className="flex items-center gap-1.5">
              <input type="checkbox" name="status" value={s.kode} defaultChecked={status.includes(s.kode)} />
              {s.nama}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="f-keaktifan" className={label}>
          Keaktifan
        </label>
        <select id="f-keaktifan" name="keaktifan" defaultValue={keaktifan} className={kotak}>
          {Object.entries(PILIHAN_KEAKTIFAN).map(([nilai, nama]) => (
            <option key={nilai} value={nilai}>
              {nama}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
