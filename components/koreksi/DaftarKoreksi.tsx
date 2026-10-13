"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { batalkanKoreksiAksi } from "@/app/(app)/koreksi-rekap/actions";

const NAMA_BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export type BarisDaftarKoreksi = {
  id: number; nip: string; nama: string | null; dari: string; ke: string | null; jenis: string; jumlahHari: number | null; bulan: number | null; tahun: number | null;
  mulai: string | null; selesai: string | null; alasan: string; sumber: string | null; dibuatPada: string; dibuatOleh: string; dibatalkan: boolean;
};

export function DaftarKoreksi({ baris }: { baris: BarisDaftarKoreksi[] }) {
  const router = useRouter();
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  function batalkan(id: number) {
    if (!window.confirm("Batalkan koreksi ini? Angka yang sudah terlanjur dikoreksi tidak dikembalikan otomatis.")) return;
    mulai(async () => {
      const h = await batalkanKoreksiAksi(id);
      setPesan(h.pesan);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" aria-label="Daftar koreksi">
      <h2 className="text-sm font-semibold uppercase text-slate-500">Daftar Koreksi</h2>
      {pesan && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{pesan}</div>}
      {baris.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada koreksi.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">NIP / Nama</th>
                <th className="py-2 pr-3">Perubahan</th>
                <th className="py-2 pr-3">Periode</th>
                <th className="py-2 pr-3">Alasan / Sumber</th>
                <th className="py-2 pr-3">Dibuat</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {baris.map((k) => (
                <tr key={k.id} className="border-b align-top last:border-0">
                  <td className="py-2 pr-3"><div className="font-medium">{k.nama ?? "-"}</div><div className="text-xs text-slate-500">{k.nip}</div></td>
                  <td className="whitespace-nowrap py-2 pr-3">{k.dari} &rarr; {k.ke ?? "dihapus"}{k.jenis === "angka" && ` (${k.jumlahHari} hari)`}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {k.jenis === "angka" && k.bulan ? <>{NAMA_BULAN[k.bulan]} {k.tahun} <span className="text-xs text-slate-500">(angka)</span></> : <>{k.mulai} s.d. {k.selesai ?? "tanpa batas"}</>}
                  </td>
                  <td className="py-2 pr-3"><div>{k.alasan}</div><div className="text-xs text-slate-500">{k.sumber}</div></td>
                  <td className="whitespace-nowrap py-2 pr-3"><div>{k.dibuatPada}</div><div className="text-xs text-slate-500">{k.dibuatOleh}</div></td>
                  <td className="py-2 pr-3">
                    {k.dibatalkan ? (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-500">Dibatalkan</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Aktif</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!k.dibatalkan && (
                      <button type="button" onClick={() => batalkan(k.id)} disabled={sibuk} className="text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50">
                        Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
