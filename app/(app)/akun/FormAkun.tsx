"use client";

import { useActionState } from "react";

import { type HasilAkun, simpanNama, simpanSandi } from "./actions";

const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

function Hasil({ h }: { h: HasilAkun }) {
  if (!h) return null;
  return (
    <p role={h.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${h.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
      {h.ok ? h.pesan : h.error}
    </p>
  );
}

export function FormNama({ namaAwal }: { namaAwal: string }) {
  const [hasil, aksi, sibuk] = useActionState(simpanNama, null);
  return (
    <form action={aksi} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">Nama tampilan</h2>
      <div>
        <label htmlFor="akun-nama" className="block text-sm font-medium">Nama</label>
        <input id="akun-nama" name="nama" defaultValue={namaAwal} required minLength={2} maxLength={100} className={kotak} />
      </div>
      <Hasil h={hasil} />
      <button type="submit" disabled={sibuk} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
        {sibuk ? "Menyimpan…" : "Simpan nama"}
      </button>
    </form>
  );
}

export function FormSandi() {
  const [hasil, aksi, sibuk] = useActionState(simpanSandi, null);
  return (
    <form action={aksi} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6" key={hasil?.ok ? "selesai" : "isi"}>
      <h2 className="text-base font-semibold text-slate-900">Ganti kata sandi</h2>
      <p className="text-sm text-slate-500">
        Minimal 12 karakter, memuat huruf dan angka, tidak memuat bagian email, dan berbeda dari yang lama. Simpan di pengelola kata sandi, bukan di berkas atau chat.
      </p>
      <div>
        <label htmlFor="akun-lama" className="block text-sm font-medium">Kata sandi saat ini</label>
        <input id="akun-lama" name="lama" type="password" required autoComplete="current-password" className={kotak} />
      </div>
      <div>
        <label htmlFor="akun-baru" className="block text-sm font-medium">Kata sandi baru</label>
        <input id="akun-baru" name="baru" type="password" required minLength={12} autoComplete="new-password" className={kotak} />
      </div>
      <div>
        <label htmlFor="akun-konfirmasi" className="block text-sm font-medium">Ulangi kata sandi baru</label>
        <input id="akun-konfirmasi" name="konfirmasi" type="password" required minLength={12} autoComplete="new-password" className={kotak} />
      </div>
      <Hasil h={hasil} />
      <button type="submit" disabled={sibuk} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
        {sibuk ? "Menyimpan…" : "Ganti kata sandi"}
      </button>
    </form>
  );
}
