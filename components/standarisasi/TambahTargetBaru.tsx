"use client";

import { useState } from "react";

import { tambahProgramStudi, tambahUnitAsal } from "@/app/(app)/standarisasi/[id]/review/[barisId]/actions";

export type TargetBaru = { tipe: "UNIT" | "PRODI"; kode: string; nama: string };

const JENJANG = ["S1", "S2", "S3", "D3", "D4", "Profesi"];

/**
 * Mini-form "tambah Unit/Program Studi baru" untuk target Jabatan Tambahan. Dipakai di SETIAP slot
 * (1-3) dgn state sendiri-sendiri - sebelumnya cuma ada di bawah slot 1 dan hasilnya otomatis
 * memilih unit baru di slot 1, sehingga admin yang menambah unit utk slot 2 tanpa sadar menimpa
 * isian slot 1 (kasus nyata: Sekretaris Departemen Sejarah tercatat di unit "Ilmu Sejarah").
 * Prodi sekarang masuk tabel Program Studi (bukan lagi dipaksa jadi Unit Asal).
 */
export function TambahTargetBaru({
  unitInduk,
  unitAsalFakultas,
  onCreated,
}: {
  unitInduk: { kode: string; nama: string }[];
  /** Kandidat induk utk prodi baru (fakultas/sekolah). */
  unitAsalFakultas: { kode: string; nama: string }[];
  onCreated: (hasil: TargetBaru) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [tipe, setTipe] = useState<"UNIT" | "PRODI">("UNIT");
  const [nama, setNama] = useState("");
  const [indukKode, setIndukKode] = useState("");
  const [jenjang, setJenjang] = useState("S1");
  const [fakultasKode, setFakultasKode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function simpan() {
    setError(null);
    if (!nama.trim()) return setError("Nama wajib diisi.");
    if (tipe === "UNIT" && !indukKode) return setError("Unit Induk wajib dipilih.");
    if (tipe === "PRODI" && !fakultasKode) return setError("Fakultas/sekolah induk prodi wajib dipilih.");
    setSaving(true);
    try {
      const dibuat =
        tipe === "UNIT"
          ? await tambahUnitAsal(nama, indukKode)
          : await tambahProgramStudi(nama, jenjang, fakultasKode);
      onCreated({ tipe, kode: dibuat.kode, nama: dibuat.nama });
      setBuka(false);
      setNama("");
      setIndukKode("");
      setFakultasKode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah data baru.");
    } finally {
      setSaving(false);
    }
  }

  if (!buka) {
    return (
      <button type="button" onClick={() => setBuka(true)} className="mt-1 text-xs text-sidebar hover:underline">
        + Unit/Program Studi tidak ada di daftar? Tambah baru
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex gap-4 text-xs text-slate-700">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={tipe === "UNIT"} onChange={() => setTipe("UNIT")} /> Unit
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={tipe === "PRODI"} onChange={() => setTipe("PRODI")} /> Program Studi
        </label>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">
          {tipe === "UNIT" ? "Nama Unit Baru" : "Nama Program Studi Baru (awali jenjang, mis. S1 Ilmu Sejarah)"}
        </label>
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {tipe === "UNIT" ? (
        <div>
          <label className="block text-xs font-medium text-slate-700">Unit Induk</label>
          <select
            value={indukKode}
            onChange={(e) => setIndukKode(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih unit induk...</option>
            {unitInduk.map((u) => (
              <option key={u.kode} value={u.kode}>
                {u.nama}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-700">Jenjang</label>
            <select
              value={jenjang}
              onChange={(e) => setJenjang(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {JENJANG.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Fakultas/Sekolah Induk</label>
            <select
              value={fakultasKode}
              onChange={(e) => setFakultasKode(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Pilih...</option>
              {unitAsalFakultas.map((u) => (
                <option key={u.kode} value={u.kode}>
                  {u.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={simpan}
          className="rounded-md bg-sidebar px-3 py-1.5 text-xs font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : tipe === "UNIT" ? "Simpan Unit Baru" : "Simpan Program Studi Baru"}
        </button>
        <button type="button" onClick={() => setBuka(false)} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
          Batal
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Data baru HANYA tersimpan di tool ini, ingat untuk menambahkannya juga ke master SIMPEGA/KDS2 kalau resmi.
      </p>
    </div>
  );
}
