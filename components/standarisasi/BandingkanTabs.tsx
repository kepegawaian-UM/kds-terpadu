"use client";

import { useState } from "react";

import type { PegawaiRingkas } from "@/lib/domain/bandingkanBatch";
import { nipUtamaAnomali } from "@/lib/domain/bandingkanBatch";
import type { AnomaliTampil } from "@/lib/standarisasi/bandingkan";

import { simpanCatatanPerubahan } from "@/app/(app)/bandingkan/actions";

export type { AnomaliTampil };

const SARAN_ALASAN: Record<"Baru" | "Hilang" | "Anomali", string[]> = {
  Baru: ["Pegawai baru", "Mutasi masuk", "Alih status kepegawaian"],
  Hilang: ["Pensiun", "Resign / mengundurkan diri", "Meninggal dunia", "Mutasi keluar", "Habis kontrak"],
  Anomali: [
    "Duplikat - NIP placeholder SIMPEGA berubah",
    "Duplikat - orang sama tercatat >1x dalam 1 bulan",
    "NIP benar-benar berubah (bukan duplikat)",
  ],
};

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition-colors ${
        active ? "border-b-2 border-sidebar text-sidebar" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function CatatanInput({
  batchAId,
  batchBId,
  kategori,
  nipUtama,
  nama,
  nipTerkait,
  existingAlasan,
}: {
  batchAId: number;
  batchBId: number;
  kategori: "Baru" | "Hilang" | "Anomali";
  nipUtama: string;
  nama: string;
  nipTerkait?: string[];
  existingAlasan?: string;
}) {
  return (
    <form action={simpanCatatanPerubahan} className="flex items-center gap-1.5">
      <input type="hidden" name="uploadBatchAId" value={batchAId} />
      <input type="hidden" name="uploadBatchBId" value={batchBId} />
      <input type="hidden" name="kategori" value={kategori} />
      <input type="hidden" name="nipUtama" value={nipUtama} />
      <input type="hidden" name="nama" value={nama} />
      {nipTerkait && <input type="hidden" name="nipTerkait" value={JSON.stringify(nipTerkait)} />}
      <input
        name="alasan"
        list={`saran-${kategori}`}
        defaultValue={existingAlasan ?? ""}
        placeholder="Isi alasan..."
        className="w-56 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md bg-sidebar px-2 py-1 text-xs font-medium text-white hover:bg-sidebar-lighter"
      >
        Simpan
      </button>
    </form>
  );
}

function TabelPegawai({
  data,
  labelKosong,
  batchAId,
  batchBId,
  kategori,
  catatanMap,
}: {
  data: PegawaiRingkas[];
  labelKosong: string;
  batchAId: number;
  batchBId: number;
  kategori: "Baru" | "Hilang";
  catatanMap: Map<string, string>;
}) {
  if (data.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">{labelKosong}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">NIP</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Jenis Pegawai</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Unit Kerja</th>
            <th className="px-4 py-3">Alasan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((p) => (
            <tr key={p.nip}>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.nip}</td>
              <td className="px-4 py-3 text-slate-900">{p.nama}</td>
              <td className="px-4 py-3 text-slate-600">{p.jenisPegawai}</td>
              <td className="px-4 py-3 text-slate-600">{p.status}</td>
              <td className="px-4 py-3 text-slate-600">{p.unitKerja}</td>
              <td className="px-4 py-3">
                <CatatanInput
                  batchAId={batchAId}
                  batchBId={batchBId}
                  kategori={kategori}
                  nipUtama={p.nip}
                  nama={p.nama}
                  existingAlasan={catatanMap.get(`${kategori}::${p.nip}`)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelAnomali({
  data,
  batchAId,
  batchBId,
  catatanMap,
}: {
  data: AnomaliTampil[];
  batchAId: number;
  batchBId: number;
  catatanMap: Map<string, string>;
}) {
  if (data.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-slate-500">
        Tidak ada anomali NIP terdeteksi (duplikat dalam 1 batch, atau NIP berubah antar batch dgn kemiripan nama ≥ 70%).
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">NIP yang Terlibat</th>
            <th className="px-4 py-3">Sumber</th>
            <th className="px-4 py-3">Keterangan</th>
            <th className="px-4 py-3">Alasan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((a) => {
            const nipUtama = nipUtamaAnomali(a);
            const nipTerkait = a.anggota.map((x) => x.nip).filter((n) => n !== nipUtama);
            return (
              <tr key={nipUtama}>
                <td className="px-4 py-3 text-slate-900">{a.nama}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    {a.anggota.map((x) => (
                      <span key={x.nip} className="font-mono text-xs text-slate-600">
                        {x.nip}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {a.sumber === "DalamBatch" ? "Duplikat dalam 1 batch" : `NIP berubah antar batch (${Math.round((a.skor ?? 0) * 100)}%)`}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.polaPlaceholder && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        NIP placeholder SIMPEGA
                      </span>
                    )}
                    {a.sudahTercatat ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        Sudah distabilkan di Kamus
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Belum tercatat di Kamus
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <CatatanInput
                    batchAId={batchAId}
                    batchBId={batchBId}
                    kategori="Anomali"
                    nipUtama={nipUtama}
                    nama={a.nama}
                    nipTerkait={nipTerkait}
                    existingAlasan={catatanMap.get(`Anomali::${nipUtama}`)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BandingkanTabs({
  batchAId,
  batchBId,
  orangBaru,
  orangHilang,
  nipAnomali,
  catatanTersimpan,
}: {
  batchAId: number;
  batchBId: number;
  orangBaru: PegawaiRingkas[];
  orangHilang: PegawaiRingkas[];
  nipAnomali: AnomaliTampil[];
  catatanTersimpan: { kategori: string; nipUtama: string; alasan: string }[];
}) {
  const [tab, setTab] = useState<"baru" | "hilang" | "anomali">("baru");

  const catatanMap = new Map(catatanTersimpan.map((c) => [`${c.kategori}::${c.nipUtama}`, c.alasan]));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <datalist id="saran-Baru">
        {SARAN_ALASAN.Baru.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="saran-Hilang">
        {SARAN_ALASAN.Hilang.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="saran-Anomali">
        {SARAN_ALASAN.Anomali.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="flex border-b border-slate-200">
        <TabButton active={tab === "baru"} onClick={() => setTab("baru")} label={`Orang Baru (${orangBaru.length})`} />
        <TabButton
          active={tab === "hilang"}
          onClick={() => setTab("hilang")}
          label={`Orang Hilang (${orangHilang.length})`}
        />
        <TabButton
          active={tab === "anomali"}
          onClick={() => setTab("anomali")}
          label={`NIP Anomali (${nipAnomali.length})`}
        />
      </div>
      {tab === "baru" && (
        <TabelPegawai
          data={orangBaru}
          labelKosong="Tidak ada pegawai baru."
          batchAId={batchAId}
          batchBId={batchBId}
          kategori="Baru"
          catatanMap={catatanMap}
        />
      )}
      {tab === "hilang" && (
        <TabelPegawai
          data={orangHilang}
          labelKosong="Tidak ada pegawai hilang."
          batchAId={batchAId}
          batchBId={batchBId}
          kategori="Hilang"
          catatanMap={catatanMap}
        />
      )}
      {tab === "anomali" && (
        <TabelAnomali data={nipAnomali} batchAId={batchAId} batchBId={batchBId} catatanMap={catatanMap} />
      )}
    </div>
  );
}
