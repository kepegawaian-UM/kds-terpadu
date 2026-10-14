"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { type HasilKoreksiPegawai, hapusKoreksiTmtAksi, simpanKoreksiTmtAksi } from "./actions";

const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

export function FormTambahKoreksi() {
  const [hasil, aksi, sibuk] = useActionState<HasilKoreksiPegawai, FormData>(simpanKoreksiTmtAksi, null);
  return (
    <form action={aksi} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">Tambah atau ubah koreksi tanggal mulai kerja</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="kp-nip" className="block text-sm font-medium">NIP</label>
          <input id="kp-nip" name="nip" required inputMode="numeric" pattern="[0-9]{8,20}" className={kotak} />
        </div>
        <div>
          <label htmlFor="kp-tanggal" className="block text-sm font-medium">Tanggal mulai kerja yang benar</label>
          <input id="kp-tanggal" name="tanggal" type="date" required className={kotak} />
        </div>
      </div>
      <div>
        <label htmlFor="kp-alasan" className="block text-sm font-medium">Alasan</label>
        <input id="kp-alasan" name="alasan" required minLength={3} maxLength={300} placeholder="mis. TMT diangkat kembali, sesuai SK" className={kotak} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="terapkanKeSnapshot" />
        Ubah juga tanggal ini di semua snapshot Nominatif yang sudah ada untuk NIP ini
      </label>
      {hasil && (
        <p role={hasil.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${hasil.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {hasil.ok ? hasil.pesan : hasil.error}
        </p>
      )}
      <button type="submit" disabled={sibuk} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
        {sibuk ? "Menyimpan…" : "Simpan koreksi"}
      </button>
    </form>
  );
}

export function TombolHapusKoreksi({ id, nip }: { id: number; nip: string }) {
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={sibuk}
        onClick={() => {
          if (!confirm(`Hapus koreksi untuk NIP ${nip}? Standarisasi berikutnya kembali memakai tanggal dari berkas. Snapshot yang sudah diubah tidak dikembalikan.`)) return;
          mulai(async () => {
            const h = await hapusKoreksiTmtAksi(id);
            if (h.ok) router.refresh();
            else setGalat(h.error ?? "Gagal menghapus.");
          });
        }}
        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {sibuk ? "Menghapus…" : "Hapus"}
      </button>
      {galat && <p role="alert" className="mt-1 text-xs text-red-600">{galat}</p>}
    </div>
  );
}
