"use client";

import { useState } from "react";

import { hitungPerTingkat, type Anomali, type TingkatAnomali } from "@/lib/impor/anomaliAbsensi";

const GAYA: Record<TingkatAnomali, { judul: string; lencana: string; baris: string }> = {
  penting: { judul: "Penting", lencana: "bg-red-600 text-white", baris: "text-red-800" },
  sedang: { judul: "Sedang", lencana: "bg-amber-500 text-white", baris: "text-amber-800" },
  info: { judul: "Info", lencana: "bg-slate-400 text-white", baris: "text-slate-600" },
};

export const perluKonfirmasi = (anomali: readonly Anomali[]): boolean => anomali.some((a) => a.tingkat === "penting");

function Tabel({ daftar, kelas }: { daftar: Anomali[]; kelas: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-1.5">Baris</th>
            <th className="px-3 py-1.5">NIP</th>
            <th className="px-3 py-1.5">Nama</th>
            <th className="px-3 py-1.5">Yang perlu dicek</th>
          </tr>
        </thead>
        <tbody>
          {daftar.map((a, i) => (
            <tr key={`${a.nip}-${a.kode}-${i}`} className="border-t align-top">
              <td className="px-3 py-1.5 tabular-nums">{a.nomorBaris}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{a.nip}</td>
              <td className="px-3 py-1.5">{a.nama || "-"}</td>
              <td className={`px-3 py-1.5 ${kelas}`}>{a.pesan}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Panel "Perlu dicek sebelum Simpan": peringatan anomali bertingkat, unduhan Excel, dan kotak centang konfirmasi untuk yang Penting. */
export function PanelAnomali({
  anomali,
  total,
  dikonfirmasi,
  saatKonfirmasi,
  namaBerkas,
}: {
  anomali: Anomali[];
  total: number;
  dikonfirmasi: boolean;
  saatKonfirmasi: (nilai: boolean) => void;
  namaBerkas: string;
}) {
  const [mengunduh, setMengunduh] = useState(false);
  if (anomali.length === 0) return null;
  const hitung = hitungPerTingkat(anomali);
  const perTingkat = (t: TingkatAnomali) => anomali.filter((a) => a.tingkat === t);

  async function unduh() {
    setMengunduh(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Perlu dicek");
      ws.addRow(["Tingkat", "Baris di berkas", "NIP", "Nama", "Yang perlu dicek"]).font = { bold: true };
      for (const a of anomali) ws.addRow([GAYA[a.tingkat].judul, a.nomorBaris, a.nip, a.nama, a.pesan]);
      ws.getColumn(3).numFmt = "@";
      [10, 16, 22, 34, 100].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Perlu dicek - ${namaBerkas.replace(/\.xlsx$/i, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setMengunduh(false);
    }
  }

  return (
    <section aria-label="Perlu dicek" className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Perlu dicek sebelum Simpan</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["penting", "sedang", "info"] as const).map((t) => (
            <span key={t} className={`rounded-full px-2 py-0.5 font-semibold ${hitung[t] > 0 ? GAYA[t].lencana : "bg-slate-200 text-slate-500"}`}>
              {hitung[t]} {GAYA[t].judul.toLowerCase()}
            </span>
          ))}
          <button type="button" onClick={unduh} disabled={mengunduh} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {mengunduh ? "Menyiapkan…" : "Unduh daftar (Excel)"}
          </button>
        </div>
      </div>

      {perTingkat("penting").length > 0 && <Tabel daftar={perTingkat("penting")} kelas={GAYA.penting.baris} />}
      {perTingkat("sedang").length > 0 && (
        <details open={perTingkat("penting").length === 0}>
          <summary className="cursor-pointer text-sm font-medium text-amber-800">Sedang ({hitung.sedang})</summary>
          <div className="mt-2">
            <Tabel daftar={perTingkat("sedang")} kelas={GAYA.sedang.baris} />
          </div>
        </details>
      )}
      {perTingkat("info").length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Info ({hitung.info})</summary>
          <div className="mt-2">
            <Tabel daftar={perTingkat("info")} kelas={GAYA.info.baris} />
          </div>
        </details>
      )}
      {total > anomali.length && <p className="text-xs text-slate-500">Menampilkan {anomali.length.toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} peringatan; yang tersisa bertingkat Info.</p>}

      {hitung.penting > 0 && (
        <label className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <input type="checkbox" checked={dikonfirmasi} onChange={(e) => saatKonfirmasi(e.target.checked)} className="mt-0.5" />
          <span>
            Saya sudah memeriksa <b>{hitung.penting}</b> peringatan penting di atas.
          </span>
        </label>
      )}
    </section>
  );
}
