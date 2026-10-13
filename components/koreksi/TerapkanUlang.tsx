"use client";

import { useState, useTransition } from "react";

import { terapkanUlangAksi } from "@/app/(app)/koreksi-rekap/actions";

const NAMA_BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function TerapkanUlang({ bulanAwal, tahunAwal }: { bulanAwal: number; tahunAwal: number }) {
  const [bulan, setBulan] = useState(bulanAwal);
  const [tahun, setTahun] = useState(tahunAwal);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [sibuk, mulai] = useTransition();

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6" aria-label="Terapkan ulang">
      <h2 className="text-sm font-semibold uppercase text-slate-500">Terapkan Ulang ke Satu Bulan</h2>
      <div className="grid max-w-lg grid-cols-3 items-end gap-4">
        <div>
          <label htmlFor="tu-bulan" className="block text-sm font-medium">Bulan</label>
          <select id="tu-bulan" className={kotak} value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
            {NAMA_BULAN.slice(1).map((n, i) => (
              <option key={n} value={i + 1}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tu-tahun" className="block text-sm font-medium">Tahun</label>
          <input id="tu-tahun" type="number" className={kotak} value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
        </div>
        <button
          type="button"
          disabled={sibuk}
          onClick={() => mulai(async () => setPesan(await terapkanUlangAksi(bulan, tahun).then((h) => ({ ok: h.ok, teks: h.pesan }))))}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {sibuk ? "Menerapkan…" : "Terapkan Ulang"}
        </button>
      </div>
      {pesan && (
        <div role={pesan.ok ? "status" : "alert"} className={`rounded-lg border p-3 text-sm ${pesan.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {pesan.teks}
        </div>
      )}
      <p className="text-xs text-slate-500">Koreksi sudah otomatis diterapkan setelah tiap upload Rekap Kehadiran. Tombol ini hanya untuk berjaga-jaga.</p>
    </section>
  );
}
