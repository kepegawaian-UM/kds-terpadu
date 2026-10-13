"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { HasilTindakan } from "@/lib/standarisasi/tindakan";

/** Tombol aksi server dengan konfirmasi; menampilkan galat/pesan di tempat dan menyegarkan halaman. */
function useTindakan() {
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  function jalankan(fn: () => Promise<HasilTindakan>) {
    mulai(async () => {
      const h = await fn();
      setPesan(h.ok ? (h.pesan ? { ok: true, teks: h.pesan } : null) : { ok: false, teks: h.error });
      router.refresh();
    });
  }
  return { sibuk, pesan, jalankan };
}

function Pesan({ p }: { p: { ok: boolean; teks: string } | null }) {
  if (!p) return null;
  return (
    <p role={p.ok ? "status" : "alert"} className={`mt-1 text-xs ${p.ok ? "text-emerald-600" : "text-red-600"}`}>
      {p.teks}
    </p>
  );
}

export function TombolKecualikan({ aksi, nip }: { aksi: (permanen: boolean) => Promise<HasilTindakan>; nip: string }) {
  const { sibuk, pesan, jalankan } = useTindakan();
  const [permanen, setPermanen] = useState(false);
  function kirim() {
    const tanya = permanen
      ? `Kecualikan NIP ${nip} PERMANEN? NIP ini akan otomatis dilewati (tidak masuk arsip maupun Review) di SEMUA Standarisasi bulan berikutnya. Pakai ini bila memang sudah pensiun/data sampah. Bisa dibatalkan lewat halaman Kamus Koreksi.`
      : `Kecualikan baris NIP ${nip} dari arsip bulan ini? Tidak bisa dibatalkan (pakai bila baris benar-benar tidak bisa diselesaikan).`;
    if (confirm(tanya)) jalankan(() => aksi(permanen));
  }
  return (
    <div className="inline-flex flex-col items-end">
      <div className="inline-flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={permanen} onChange={(e) => setPermanen(e.target.checked)} />
          Permanen (pensiun/sampah)
        </label>
        <button type="button" onClick={kirim} disabled={sibuk} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          {sibuk ? "Memproses…" : "Kecualikan"}
        </button>
      </div>
      <Pesan p={pesan} />
    </div>
  );
}

export function TombolHapus({ aksi, tanya, label = "Hapus" }: { aksi: () => Promise<HasilTindakan>; tanya: string; label?: string }) {
  const { sibuk, pesan, jalankan } = useTindakan();
  return (
    <div>
      <button type="button" disabled={sibuk} onClick={() => confirm(tanya) && jalankan(aksi)} className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
        {sibuk ? "Menghapus…" : label}
      </button>
      <Pesan p={pesan} />
    </div>
  );
}
