/**
 * Filter laporan yang langsung diterapkan saat dipilih (lihat FormOtomatis): pilihan masuk ke alamat halaman (query string) sehingga hasilnya bisa dibagikan/disimpan.
 */
import type { ReactNode } from "react";

import { type Keaktifan, PILIHAN_KEAKTIFAN } from "@/lib/laporan/filter";
import { NAMA_BULAN } from "@/lib/laporan/periode";

import { DropdownCentang, FormOtomatis } from "./FormOtomatis";

const kotak = "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800";
const bungkus = "flex items-center gap-1.5 text-sm text-slate-500";

export function FormLaporan({ children, action }: { children: ReactNode; action?: string }) {
  return <FormOtomatis action={action}>{children}</FormOtomatis>;
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
        <label className={bungkus}>
          Bulan
          <select name="bulan" defaultValue={String(bulan)} className={kotak}>
            {NAMA_BULAN.slice(1).map((nama, i) => (
              <option key={nama} value={i + 1}>
                {nama}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={bungkus}>
        Tahun
        <select name="tahun" defaultValue={String(tahun)} className={kotak}>
          {daftarTahun.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Filter Jenis (Dosen/Tendik), Status Kepegawaian, dan Keaktifan: Jenis dan Status berupa dropdown centang. */
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
      <DropdownCentang
        key={`jenis-${jenis.join()}`}
        nama="jenis"
        judul="Jenis"
        pilihan={[
          { kode: "DSN", nama: "Dosen" },
          { kode: "TDK", nama: "Tendik" },
        ]}
        terpilih={jenis}
      />
      <DropdownCentang key={`status-${status.join()}`} nama="status" judul="Status" pilihan={daftarStatus} terpilih={status} />
      <label className={bungkus}>
        Keaktifan
        <select name="keaktifan" defaultValue={keaktifan} className={kotak}>
          {Object.entries(PILIHAN_KEAKTIFAN).map(([nilai, nama]) => (
            <option key={nilai} value={nilai}>
              {nama}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
