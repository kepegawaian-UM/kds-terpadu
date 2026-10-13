/**
 * Tabel Statistik Dosen dan Tendik (komponen server, tanpa JavaScript klien): header bertingkat dengan
 * kolom pertama dan header yang menempel saat digulir, seperti view KDS2. Sel baris biasa menampilkan "-"
 * untuk 0; baris total menampilkan angka apa adanya.
 */
import {
  type BarisStatistik,
  GOLONGAN_TENDIK,
  type KolomJabatanGolongan,
  PENDIDIKAN_DOSEN,
  PENDIDIKAN_TENDIK,
  STATUS_TENDIK,
} from "@/lib/laporan/statistik";

const strip = (n: string | number | undefined) => (Number(n) ? n : "-");
const garis = "border-l border-slate-200";
const sel = "px-2 py-2 text-center";
const judulKecil = "text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400";

function Bungkus({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="max-h-[75vh] overflow-auto">
        <table className="whitespace-nowrap text-sm">{children}</table>
      </div>
    </div>
  );
}

// ---- Dosen ----------------------------------------------------------------------------------

export function TabelStatistikDosen({
  laporan,
  total,
  kolom,
  jabatanGroups,
}: {
  laporan: { subtotal: BarisStatistik; jurusan: BarisStatistik[] }[];
  total: BarisStatistik;
  kolom: KolomJabatanGolongan[];
  jabatanGroups: Record<string, number>;
}) {
  const lebarKolom = 2 + kolom.length * 2 + PENDIDIKAN_DOSEN.length + 1;
  const isiBaris = (b: BarisStatistik, mentah: boolean) => {
    const nilai = (k: string) => (mentah ? b[k] : strip(b[k]));
    return (
      <>
        {kolom.map((_, i) => (
          <FragmenSel key={i}>
            <td className={`${sel} ${garis}`}>{nilai(`kol_${i}_L`)}</td>
            <td className={sel}>{nilai(`kol_${i}_P`)}</td>
          </FragmenSel>
        ))}
        <td className={`${sel} px-3`}>{b.jumlah}</td>
        {PENDIDIKAN_DOSEN.map((p) => (
          <td key={p} className={`${sel} ${garis}`}>
            {nilai(`pend_${p}`)}
          </td>
        ))}
        <td className={sel}>{nilai("pend_none")}</td>
      </>
    );
  };

  return (
    <Bungkus>
      <thead className="sticky top-0 z-20 bg-slate-50">
        <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <th rowSpan={3} className="sticky left-0 z-30 bg-slate-50 px-3 py-2 align-bottom">
            <div className="w-44 whitespace-normal">Fakultas / Jurusan</div>
          </th>
          {Object.entries(jabatanGroups).map(([nama, jumlah]) => (
            <th key={nama} colSpan={jumlah * 2} className={`${garis} px-3 py-2 text-center`}>
              {nama}
            </th>
          ))}
          <th rowSpan={3} className="px-3 py-2 text-center align-bottom">
            Jumlah
          </th>
          <th colSpan={PENDIDIKAN_DOSEN.length + 1} className={`${garis} px-3 py-2 text-center`}>
            Pendidikan Terakhir
          </th>
        </tr>
        <tr className={judulKecil}>
          {kolom.map((k, i) => (
            <th key={i} colSpan={2} className={`${garis} px-2 py-1.5`}>
              {k.golongan ?? "-"}
            </th>
          ))}
          {PENDIDIKAN_DOSEN.map((p) => (
            <th key={p} rowSpan={2} className={`${garis} px-2 py-1.5 align-bottom`}>
              {p}
            </th>
          ))}
          <th rowSpan={2} className="px-2 py-1.5 align-bottom">
            -
          </th>
        </tr>
        <tr className={judulKecil}>
          {kolom.map((_, i) => (
            <FragmenSel key={i}>
              <th className={`${garis} px-2 py-1.5`}>L</th>
              <th className="px-2 py-1.5">P</th>
            </FragmenSel>
          ))}
        </tr>
      </thead>
      <tbody>
        {laporan.length === 0 && (
          <tr>
            <td colSpan={lebarKolom} className="px-4 py-6 text-center text-slate-500">
              Belum ada data Dosen untuk bulan/tahun ini.
            </td>
          </tr>
        )}
        {laporan.map((f) => (
          <FragmenSel key={f.subtotal.unit}>
            <tr className="border-t bg-slate-50 font-semibold">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2">
                <div className="w-44 whitespace-normal">{f.subtotal.unit}</div>
              </td>
              {isiBaris(f.subtotal, false)}
            </tr>
            {f.jurusan.map((j) => (
              <tr key={j.unit} className="border-t hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 pl-6">
                  <div className="w-44 whitespace-normal text-slate-600">{j.unit}</div>
                </td>
                {isiBaris(j, false)}
              </tr>
            ))}
          </FragmenSel>
        ))}
      </tbody>
      {laporan.length > 0 && (
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
            <td className="sticky left-0 z-10 bg-slate-100 px-3 py-2">{total.unit}</td>
            {isiBaris(total, true)}
          </tr>
        </tfoot>
      )}
    </Bungkus>
  );
}

/** Pembungkus tanpa elemen DOM (Fragment) agar key bisa dipasang pada pasangan sel/baris. */
function FragmenSel({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ---- Tendik ---------------------------------------------------------------------------------

export function TabelStatistikTendik({ statistik, total }: { statistik: BarisStatistik[]; total: BarisStatistik }) {
  const lebarKolom = 2 + STATUS_TENDIK.length * 2 + GOLONGAN_TENDIK.length + 1 + PENDIDIKAN_TENDIK.length + 1;
  const isiBaris = (b: BarisStatistik, mentah: boolean) => {
    const nilai = (k: string) => (mentah ? b[k] : strip(b[k]));
    return (
      <>
        {STATUS_TENDIK.map((s) => (
          <FragmenSel key={s}>
            <td className={`${sel} ${garis}`}>{nilai(`status_${s}_L`)}</td>
            <td className={sel}>{nilai(`status_${s}_P`)}</td>
          </FragmenSel>
        ))}
        {GOLONGAN_TENDIK.map((g) => (
          <td key={g} className={`${sel} ${garis}`}>
            {nilai(`gol_${g}`)}
          </td>
        ))}
        <td className={sel}>{nilai("gol_none")}</td>
        {PENDIDIKAN_TENDIK.map((p) => (
          <td key={p} className={`${sel} ${garis}`}>
            {nilai(`pend_${p}`)}
          </td>
        ))}
        <td className={sel}>{nilai("pend_none")}</td>
      </>
    );
  };

  return (
    <Bungkus>
      <thead className="sticky top-0 z-20 bg-slate-50">
        <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <th rowSpan={2} className="sticky left-0 z-30 bg-slate-50 px-3 py-2 align-bottom">
            <div className="w-44 whitespace-normal">Unit Kerja</div>
          </th>
          <th rowSpan={2} className="px-3 py-2 text-center">
            Jumlah
          </th>
          {STATUS_TENDIK.map((s) => (
            <th key={s} colSpan={2} className={`${garis} px-3 py-2 text-center`}>
              {s}
            </th>
          ))}
          <th colSpan={GOLONGAN_TENDIK.length + 1} className={`${garis} px-3 py-2 text-center`}>
            Golongan
          </th>
          <th colSpan={PENDIDIKAN_TENDIK.length + 1} className={`${garis} px-3 py-2 text-center`}>
            Pendidikan Terakhir
          </th>
        </tr>
        <tr className={judulKecil}>
          {STATUS_TENDIK.map((s) => (
            <FragmenSel key={s}>
              <th className={`${garis} px-2 py-1.5`}>L</th>
              <th className="px-2 py-1.5">P</th>
            </FragmenSel>
          ))}
          {GOLONGAN_TENDIK.map((g) => (
            <th key={g} className={`${garis} px-2 py-1.5`}>
              {g}
            </th>
          ))}
          <th className="px-2 py-1.5">-</th>
          {PENDIDIKAN_TENDIK.map((p) => (
            <th key={p} className={`${garis} px-2 py-1.5`}>
              {p}
            </th>
          ))}
          <th className="px-2 py-1.5">-</th>
        </tr>
      </thead>
      <tbody>
        {statistik.length === 0 && (
          <tr>
            <td colSpan={lebarKolom} className="px-4 py-6 text-center text-slate-500">
              Belum ada data Tendik untuk bulan/tahun ini.
            </td>
          </tr>
        )}
        {statistik.map((b) => (
          <tr key={b.unit} className="border-t hover:bg-slate-50">
            <td className="sticky left-0 z-10 bg-white px-3 py-2">
              <div className="w-44 whitespace-normal">{b.unit}</div>
            </td>
            <td className="px-3 py-2 text-center font-medium">{b.jumlah}</td>
            {isiBaris(b, false)}
          </tr>
        ))}
      </tbody>
      {statistik.length > 0 && (
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2">
              <div className="w-44 whitespace-normal">{total.unit}</div>
            </td>
            <td className="px-3 py-2 text-center">{total.jumlah}</td>
            {isiBaris(total, true)}
          </tr>
        </tfoot>
      )}
    </Bungkus>
  );
}
