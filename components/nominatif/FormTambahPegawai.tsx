"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { tambahPegawai } from "@/app/(app)/nominatif/baru/actions";
import type { GalatTambah, InputTambahPegawai, KolomTambah } from "@/lib/nominatif/tambahManual";

type Pilihan = { kode: string; label: string };
export type OpsiForm = { jenis: Pilihan[]; status: Pilihan[]; golongan: Pilihan[]; dosen: Pilihan[]; tendik: Pilihan[]; umum: Pilihan[]; akl: Pilihan[]; unit: Pilihan[] };

const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function FormTambahPegawai({ opsi }: { opsi: OpsiForm }) {
  const router = useRouter();
  const [nilai, setNilai] = useState<Record<KolomTambah, string>>({
    nip: "", nama: "", jenis_kelamin: "", tanggal_lahir: "", pendidikan_terakhir: "", agama: "", jenis_pegawai_kode: "", status_kepegawaian_kode: "",
    golongan_kode: "", jabatan_fungsional_dosen_kode: "", jabatan_fungsional_tendik_kode: "", jabatan_fungsi_umum_kode: "", kategori_akademisi_luar_kode: "",
    unit_asal_kode: "", tanggal_mulai_kerja: "",
  });
  const [galat, setGalat] = useState<GalatTambah>({});
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  const ubah = (k: KolomTambah) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setNilai((n) => ({ ...n, [k]: e.target.value }));

  function kirim(e: React.FormEvent) {
    e.preventDefault();
    setGalat({});
    setPesan(null);
    mulai(async () => {
      const h = await tambahPegawai(nilai as InputTambahPegawai);
      if (h.ok) router.push(`/nominatif/${h.id}`);
      else {
        setGalat(h.galat);
        setPesan(h.pesan ?? (Object.keys(h.galat).length > 0 ? "Periksa isian yang bertanda merah." : null));
      }
    });
  }

  const galatKolom = (k: KolomTambah) =>
    galat[k]?.length ? (
      <p role="alert" className="mt-1 text-xs text-red-700">
        {galat[k]!.join(" ")}
      </p>
    ) : null;

  const teks = (k: KolomTambah, label: string, o: { tipe?: string; maks?: number; wajib?: boolean } = {}) => (
    <div>
      <label htmlFor={`f-${k}`} className="block text-sm font-medium">
        {label}
        {o.wajib && <span className="text-red-600"> *</span>}
      </label>
      <input id={`f-${k}`} type={o.tipe ?? "text"} className={kotak} value={nilai[k]} onChange={ubah(k)} maxLength={o.maks} aria-invalid={!!galat[k]} />
      {galatKolom(k)}
    </div>
  );

  const pilih = (k: KolomTambah, label: string, daftar: Pilihan[], o: { wajib?: boolean; kosong?: string } = {}) => (
    <div>
      <label htmlFor={`f-${k}`} className="block text-sm font-medium">
        {label}
        {o.wajib && <span className="text-red-600"> *</span>}
      </label>
      <select id={`f-${k}`} className={kotak} value={nilai[k]} onChange={ubah(k)} aria-invalid={!!galat[k]}>
        <option value="">{o.kosong ?? "-- Pilih --"}</option>
        {daftar.map((p) => (
          <option key={p.kode} value={p.kode}>
            {p.label}
          </option>
        ))}
      </select>
      {galatKolom(k)}
    </div>
  );

  const jenis = nilai.jenis_pegawai_kode;
  return (
    <form onSubmit={kirim} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {teks("nip", "NIP", { maks: 18, wajib: true })}
        {teks("nama", "Nama", { maks: 150, wajib: true })}
        <div>
          <label htmlFor="f-jenis_kelamin" className="block text-sm font-medium">
            Jenis Kelamin<span className="text-red-600"> *</span>
          </label>
          <select id="f-jenis_kelamin" className={kotak} value={nilai.jenis_kelamin} onChange={ubah("jenis_kelamin")} aria-invalid={!!galat.jenis_kelamin}>
            <option value="">-- Pilih --</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
          {galatKolom("jenis_kelamin")}
        </div>
        {teks("tanggal_lahir", "Tanggal Lahir", { tipe: "date" })}
        {teks("pendidikan_terakhir", "Pendidikan Terakhir", { maks: 100 })}
        {teks("agama", "Agama", { maks: 20 })}
        {teks("tanggal_mulai_kerja", "Tanggal Mulai Kerja (TMT)", { tipe: "date", wajib: true })}
        {pilih("unit_asal_kode", "Unit Kerja", opsi.unit, { wajib: true, kosong: "-- Pilih Unit --" })}
      </div>

      <hr />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {pilih("jenis_pegawai_kode", "Jenis Pegawai", opsi.jenis, { wajib: true })}
        {pilih("status_kepegawaian_kode", "Status Kepegawaian", opsi.status, { wajib: true })}
        {pilih("golongan_kode", "Golongan (wajib untuk ASN, opsional untuk Non-ASN)", opsi.golongan, { kosong: "-- Tidak ada --" })}
      </div>

      {jenis === "DSN" && <div className="border-l-4 border-slate-200 pl-4">{pilih("jabatan_fungsional_dosen_kode", "Jabatan Fungsional Dosen", opsi.dosen, { wajib: true })}</div>}
      {jenis === "TDK" && (
        <div className="space-y-4 border-l-4 border-slate-200 pl-4">
          <p className="text-sm text-slate-600">Isi salah satu saja: Jabatan Fungsional Tendik ATAU Jabatan Fungsi Umum Pelaksana.</p>
          {pilih("jabatan_fungsional_tendik_kode", "Jabatan Fungsional Tendik", opsi.tendik, { kosong: "-- Tidak ada --" })}
          {pilih("jabatan_fungsi_umum_kode", "Jabatan Fungsi Umum Pelaksana", opsi.umum, { kosong: "-- Tidak ada --" })}
        </div>
      )}
      {jenis === "AKL" && <div className="border-l-4 border-slate-200 pl-4">{pilih("kategori_akademisi_luar_kode", "Kategori Akademisi Luar", opsi.akl, { wajib: true })}</div>}

      {pesan && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {pesan}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={sibuk} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>
        <Link href="/nominatif" className="text-sm text-slate-600 underline">
          Batal
        </Link>
      </div>
    </form>
  );
}
