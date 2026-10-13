"use client";

import { type ReactNode, useId, useState } from "react";

function DaftarTab<K extends string>({
  daftar,
  aktif,
  pilih,
  ukuran,
}: {
  daftar: { kode: K; label: string }[];
  aktif: K;
  pilih: (k: K) => void;
  ukuran: "besar" | "kecil";
}) {
  return (
    <div role="tablist" className="tanpa-cetak flex gap-2">
      {daftar.map((t) => (
        <button
          key={t.kode}
          type="button"
          role="tab"
          aria-selected={aktif === t.kode}
          onClick={() => pilih(t.kode)}
          className={
            ukuran === "besar"
              ? `rounded-lg border px-4 py-2 text-sm font-medium ${
                  aktif === t.kode ? "border-sidebar bg-sidebar text-white" : "border-slate-300 text-slate-600"
                }`
              : `rounded-lg border px-3 py-1.5 text-sm ${
                  aktif === t.kode ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 text-slate-500"
                }`
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Tab utama: Dashboard Pegawai / Dashboard Kinerja. Panel yang tidak aktif disembunyikan, bukan dibuang. */
export function TabUtama({
  tabAwal,
  panelPegawai,
  panelKinerja,
}: {
  tabAwal: "pegawai" | "kinerja";
  panelPegawai: ReactNode;
  panelKinerja: ReactNode;
}) {
  const [tab, setTab] = useState<"pegawai" | "kinerja">(tabAwal);
  return (
    <div className="space-y-4">
      <DaftarTab
        ukuran="besar"
        aktif={tab}
        pilih={setTab}
        daftar={[
          { kode: "pegawai", label: "Dashboard Pegawai" },
          { kode: "kinerja", label: "Dashboard Kinerja" },
        ]}
      />
      <div role="tabpanel" hidden={tab !== "pegawai"}>
        {panelPegawai}
      </div>
      <div role="tabpanel" hidden={tab !== "kinerja"}>
        {panelKinerja}
      </div>
    </div>
  );
}

/** Sub-tab per jenis pegawai (Dosen / Tendik / Akademisi Luar): tidak pernah dicampur dalam satu grafik. */
export function TabBertingkat({ tab }: { tab: { kode: string; label: string; isi: ReactNode }[] }) {
  const id = useId();
  const [aktif, setAktif] = useState(tab[0]?.kode ?? "");
  return (
    <div className="space-y-4" id={id}>
      <DaftarTab ukuran="kecil" aktif={aktif} pilih={setAktif} daftar={tab.map(({ kode, label }) => ({ kode, label }))} />
      {tab.map((t) => (
        <div key={t.kode} role="tabpanel" hidden={aktif !== t.kode} className="space-y-4">
          {t.isi}
        </div>
      ))}
    </div>
  );
}
