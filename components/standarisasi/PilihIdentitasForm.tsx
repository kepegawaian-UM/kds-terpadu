import type { KandidatIdentitas } from "@/lib/domain/identitasEksternal";

import { pilihIdentitasEksternal } from "@/app/(app)/standarisasi/[id]/review/[barisId]/actions";

export function PilihIdentitasForm({
  batchId,
  barisId,
  nama,
  nipPlaceholder,
  kandidat,
}: {
  batchId: number;
  barisId: string;
  nama: string;
  nipPlaceholder: string;
  kandidat: KandidatIdentitas[];
}) {
  const action = pilihIdentitasEksternal.bind(null, batchId, barisId);

  return (
    <div className="space-y-5 rounded-lg border border-amber-200 bg-amber-50 p-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Verifikasi Identitas — {nama}</h2>
        <p className="mt-1 text-xs text-slate-600">
          NIP <code className="rounded bg-white px-1 py-0.5">{nipPlaceholder}</code> ini dibuat
          otomatis oleh SIMPEGA sendiri (bukan NIP pemerintah asli) untuk Akademisi Luar UM, dan{" "}
          <strong>tidak stabil antar bulan</strong> — orang yang sama bisa mendapat NIP berbeda
          tiap kali data ditarik ulang dari SIMPEGA. Konfirmasi dulu identitasnya di bawah supaya
          riwayat orang ini tidak terputus-putus tiap bulan.
        </p>
      </div>

      {kandidat.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700">
            Kandidat orang yang sama (dari riwayat Akademisi Luar UM sebelumnya):
          </p>
          <ul className="mt-2 space-y-2">
            {kandidat.map((k) => (
              <li
                key={k.nip}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm"
              >
                <span>
                  {k.nama}{" "}
                  <span className="text-xs text-slate-400">
                    (NIP {k.nip}, kemiripan nama {Math.round(k.skor * 100)}%)
                  </span>
                </span>
                <form action={action}>
                  <input type="hidden" name="nipTerpilih" value={k.nip} />
                  <button
                    type="submit"
                    className="shrink-0 rounded-md bg-sidebar px-3 py-1.5 text-xs font-medium text-white hover:bg-sidebar-lighter"
                  >
                    Ini orang yang sama
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-amber-200 pt-4">
        <form action={action} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-700">
              Atau masukkan NIP lama secara manual (kalau tahu, tapi tidak ada di kandidat di atas)
            </label>
            <input
              name="nipTerpilih"
              placeholder="NIP lama..."
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Gunakan NIP ini
          </button>
        </form>
      </div>

      <div className="border-t border-amber-200 pt-4">
        <form action={action}>
          <input type="hidden" name="nipTerpilih" value={nipPlaceholder} />
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ini benar pegawai baru (gunakan NIP {nipPlaceholder} sebagai identitas permanen)
          </button>
        </form>
      </div>
    </div>
  );
}
