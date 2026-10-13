"use client";

/**
 * Tabel laporan umum (pengganti DataTables di KDS2): cari (semua kata harus cocok), urut per
 * kolom, jumlah per halaman, serta tombol Salin / CSV / Excel (unduhan server) / Cetak.
 *
 * Perilaku mengikuti KDS2:
 *  - tanpa urutan awal: urutan baris = urutan dari server (mis. TK terbanyak, nama);
 *  - kolom nomor tetap mengikuti urutan data asal, bukan urutan tampilan;
 *  - ekspor (Salin/CSV) memuat SEMUA baris hasil pencarian menurut urutan tampil, lintas halaman,
 *    tanpa kolom bertanda `tanpaEkspor` (mis. Aksi);
 *  - Excel adalah unduhan dari server (isi sama dengan ekspor KDS2 menurut filter, bukan hasil cari);
 *  - Cetak menampilkan semua baris, bukan hanya halaman aktif.
 */
import {
  type ColumnDef,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingFn,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { flushSync } from "react-dom";

import { keCsv, keTsv, MIME_CSV } from "@/lib/laporan/ekspor";
import { bandingkanNama } from "@/lib/laporan/urutNama";

export type KolomLaporan<T> = {
  id: string;
  header: string;
  /** Nilai teks/angka untuk pencarian, pengurutan, dan ekspor. */
  nilai: (baris: T) => string | number | null;
  /** Tampilan sel (bawaan: nilai). */
  render?: (baris: T) => ReactNode;
  /** Diurutkan sebagai angka dan rata kanan (kecuali rata = "tengah"). */
  numerik?: boolean;
  rata?: "tengah";
  /** Tidak ikut dicari dan diekspor (mis. kolom Aksi). */
  tanpaEkspor?: boolean;
  className?: string;
  /** Keterangan yang muncul saat kursor di judul kolom. */
  tooltip?: string;
  /** Kelas tambahan dan keterangan (title) per sel, mis. sel hasil koreksi berwarna. */
  kelasSel?: (baris: T) => string;
  judulSel?: (baris: T) => string | undefined;
};

type Props<T> = {
  kolom: KolomLaporan<T>[];
  data: T[];
  kunciBaris: (baris: T) => string | number;
  /** Nama file unduhan CSV (tanpa ekstensi), sesuai tab + filter. */
  namaFile: string;
  /** Tautan unduhan Excel dari server; tanpa ini tombol Excel tidak tampil. */
  urlExcel?: string;
  ukuranHalamanAwal?: number;
  kelasBaris?: (baris: T) => string;
  /** Teks tambahan di bawah kontrol (mis. keterangan filter). */
  keterangan?: ReactNode;
};

const PILIHAN_UKURAN = ["10", "25", "50", "100", "semua"] as const;
const angka = (n: number) => n.toLocaleString("id-ID");

export function TabelLaporan<T>({
  kolom,
  data,
  kunciBaris,
  namaFile,
  urlExcel,
  ukuranHalamanAwal = 10,
  kelasBaris,
  keterangan,
}: Props<T>) {
  const idCari = useId();
  const idUkuran = useId();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [cari, setCari] = useState("");
  const [ukuran, setUkuran] = useState<string>(String(ukuranHalamanAwal));
  const [halaman, setHalaman] = useState(0);
  const [sedangCetak, setSedangCetak] = useState(false);
  const [pesan, setPesan] = useState("");

  const nomorAsal = useMemo(() => new Map(data.map((b, i) => [b, i + 1])), [data]);
  const kolomEkspor = useMemo(() => kolom.filter((k) => !k.tanpaEkspor), [kolom]);

  const kolomTabel = useMemo<ColumnDef<T>[]>(() => {
    const urutFn =
      (k: KolomLaporan<T>): SortingFn<T> =>
      (a, b, id) => {
        const x = a.getValue(id) as string | number | null;
        const y = b.getValue(id) as string | number | null;
        if (k.numerik) return (Number(x) || 0) - (Number(y) || 0);
        return bandingkanNama(String(x ?? ""), String(y ?? ""));
      };
    return [
      {
        id: "__nomor",
        header: "No",
        enableSorting: false,
        cell: ({ row }) => nomorAsal.get(row.original),
      },
      ...kolom.map<ColumnDef<T>>((k) => ({
        id: k.id,
        header: k.header,
        accessorFn: (b) => k.nilai(b),
        sortingFn: urutFn(k),
        cell: ({ row }) => (k.render ? k.render(row.original) : (k.nilai(row.original) ?? "")),
      })),
    ];
  }, [kolom, nomorAsal]);

  // Pencarian ala DataTables: setiap kata harus muncul (tidak peka huruf besar/kecil) di salah satu
  // kolom yang diekspor.
  const filterGlobal = useMemo<FilterFn<T>>(
    () => (row, _id, nilai) => {
      const kata = String(nilai).toLowerCase().split(/\s+/).filter(Boolean);
      if (kata.length === 0) return true;
      const teks = kolomEkspor.map((k) => String(k.nilai(row.original) ?? "")).join(" ").toLowerCase();
      return kata.every((t) => teks.includes(t));
    },
    [kolomEkspor]
  );

  const semuaBaris = Math.max(1, data.length);
  const ukuranEfektif = sedangCetak || ukuran === "semua" ? semuaBaris : Number(ukuran);
  const pagination: PaginationState = { pageIndex: halaman, pageSize: ukuranEfektif };

  // useReactTable mengembalikan fungsi yang tidak aman dimemoize oleh React Compiler (keterbatasan
  // TanStack Table v8 yang diketahui); komponen ini sengaja tidak dimemoize otomatis.
  // eslint-disable-next-line react-hooks/incompatible-library
  const tabel = useReactTable<T>({
    data,
    columns: kolomTabel,
    state: { sorting, globalFilter: cari, pagination },
    onSortingChange: setSorting,
    onPaginationChange: (u) => {
      const next = typeof u === "function" ? u(pagination) : u;
      setHalaman(next.pageIndex);
    },
    globalFilterFn: filterGlobal,
    enableSortingRemoval: false,
    sortDescFirst: false, // klik pertama selalu naik, seperti DataTables
    autoResetPageIndex: false,
    getRowId: (b) => String(kunciBaris(b)),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Kembali ke halaman pertama bila pencarian/ukuran berubah.
  useEffect(() => setHalaman(0), [cari, ukuran]);

  // Cetak lewat Ctrl+P juga harus memuat semua baris.
  useEffect(() => {
    const sebelum = () => flushSync(() => setSedangCetak(true));
    const sesudah = () => setSedangCetak(false);
    window.addEventListener("beforeprint", sebelum);
    window.addEventListener("afterprint", sesudah);
    return () => {
      window.removeEventListener("beforeprint", sebelum);
      window.removeEventListener("afterprint", sesudah);
    };
  }, []);

  const terfilter = tabel.getPrePaginationRowModel().rows;
  const jumlahTerfilter = terfilter.length;
  const jumlahHalaman = Math.max(1, Math.ceil(jumlahTerfilter / ukuranEfektif));
  const mulai = jumlahTerfilter === 0 ? 0 : halaman * ukuranEfektif + 1;
  const sampai = Math.min(jumlahTerfilter, (halaman + 1) * ukuranEfektif);

  const barisEkspor = () => terfilter.map((r) => kolomEkspor.map((k) => k.nilai(r.original)));
  const judulEkspor = kolomEkspor.map((k) => k.header);

  function unduhCsv() {
    const blob = new Blob([keCsv(judulEkspor, barisEkspor())], { type: MIME_CSV });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${namaFile}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function salin() {
    await navigator.clipboard.writeText(keTsv(judulEkspor, barisEkspor()));
    setPesan(`Tersalin: ${angka(jumlahTerfilter)} baris`);
    setTimeout(() => setPesan(""), 2500);
  }

  function cetak() {
    flushSync(() => setSedangCetak(true));
    window.print();
    setSedangCetak(false);
  }

  const tombol =
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

  return (
    <div className="space-y-3">
      <div className="tanpa-cetak flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={tombol} onClick={salin}>
            Salin
          </button>
          <button type="button" className={tombol} onClick={unduhCsv}>
            CSV
          </button>
          {urlExcel && (
            <a href={urlExcel} className={tombol} download>
              Excel
            </a>
          )}
          <button type="button" className={tombol} onClick={cetak}>
            Cetak
          </button>
          {pesan && (
            <span role="status" className="text-xs text-accent-green">
              {pesan}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-2">
            <label htmlFor={idUkuran}>Tampilkan</label>
            <select
              id={idUkuran}
              value={ukuran}
              onChange={(e) => setUkuran(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {PILIHAN_UKURAN.map((p) => (
                <option key={p} value={p}>
                  {p === "semua" ? "Semua" : p}
                </option>
              ))}
            </select>
            <span>baris</span>
          </span>
          <span className="flex items-center gap-2">
            <label htmlFor={idCari}>Cari:</label>
            <input
              id={idCari}
              type="search"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </span>
        </div>
      </div>

      {keterangan && <div className="tanpa-cetak text-xs text-slate-500">{keterangan}</div>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            {tabel.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => {
                  const k = kolom.find((x) => x.id === h.column.id);
                  const urut = h.column.getIsSorted();
                  return (
                    <th key={h.id} title={k?.tooltip} className={`px-3 py-3 ${k?.rata === "tengah" ? "text-center" : k?.numerik ? "text-right" : ""} ${k?.className ?? ""}`}>
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 uppercase hover:text-slate-900"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden="true" className="text-[10px]">
                            {urut === "asc" ? "▲" : urut === "desc" ? "▼" : ""}
                          </span>
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tabel.getRowModel().rows.map((r) => (
              <tr key={r.id} className={kelasBaris?.(r.original) ?? ""}>
                {r.getVisibleCells().map((c) => {
                  const k = kolom.find((x) => x.id === c.column.id);
                  return (
                    <td
                      key={c.id}
                      title={k?.judulSel?.(r.original)}
                      className={`px-3 py-2 ${k?.rata === "tengah" ? "text-center tabular-nums" : k?.numerik ? "text-right tabular-nums" : ""} ${k?.className ?? ""} ${k?.kelasSel?.(r.original) ?? ""}`}
                    >
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {jumlahTerfilter === 0 && (
              <tr>
                <td colSpan={kolom.length + 1} className="px-3 py-8 text-center text-slate-500">
                  {data.length === 0 ? "Tidak ada data." : "Tidak ada data yang cocok dengan pencarian."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="tanpa-cetak flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>
          {jumlahTerfilter > 0 &&
            `Menampilkan ${angka(mulai)}–${angka(sampai)} dari ${angka(jumlahTerfilter)} baris`}
          {jumlahTerfilter !== data.length && data.length > 0 && ` (difilter dari ${angka(data.length)})`}
        </span>
        <span className="flex items-center gap-3">
          <span>
            Halaman {angka(halaman + 1)} dari {angka(jumlahHalaman)}
          </span>
          <button type="button" className={tombol} disabled={halaman === 0} onClick={() => setHalaman(halaman - 1)}>
            Sebelumnya
          </button>
          <button
            type="button"
            className={tombol}
            disabled={halaman >= jumlahHalaman - 1}
            onClick={() => setHalaman(halaman + 1)}
          >
            Berikutnya
          </button>
        </span>
      </div>
    </div>
  );
}
