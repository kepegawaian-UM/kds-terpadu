"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { pratinjauKoreksiAksi, simpanKoreksiAksi } from "@/app/(app)/koreksi-rekap/actions";
import type { BarisPratinjau } from "@/lib/koreksi/layanan";
import type { FormKoreksi, GalatKoreksi, KolomKoreksi } from "@/lib/koreksi/validasi";

const NAMA_BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const kotak = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

const LABEL_CAKUPAN: Record<string, [string, string]> = {
  penuh: ["Penuh", "bg-green-100 text-green-700"],
  angka: ["Angka manual", "bg-blue-100 text-blue-700"],
  digantikan: ["Digantikan koreksi angka", "bg-gray-100 text-gray-500"],
  sebagian: ["Sebagian - tidak diubah", "bg-yellow-100 text-yellow-700"],
};

type Pratinjau = { nama: string | null; baris: BarisPratinjau[]; form: FormKoreksi };

export function FormKoreksiRekap({ komponen, awal }: { komponen: { kode: string; nama: string }[]; awal: { jenis: string; nip: string; bulan: string; tahun: string } }) {
  const router = useRouter();
  const [nilai, setNilai] = useState<Record<KolomKoreksi, string>>({
    jenis: awal.jenis, nip: awal.nip, dari_komponen: "TK", ke_komponen: "TB", tanggal_mulai: "", tanggal_selesai: "", bulan: awal.bulan, tahun: awal.tahun, jumlah_hari: "", alasan: "", sumber: "",
  });
  const [galat, setGalat] = useState<GalatKoreksi>({});
  const [pesan, setPesan] = useState<{ jenis: "galat" | "ok"; teks: string } | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [sibuk, mulai] = useTransition();

  const ubah = (k: KolomKoreksi) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setNilai((n) => ({ ...n, [k]: e.target.value }));
    setPratinjau(null); // perubahan isian membatalkan pratinjau: harus dipratinjau ulang sebelum Simpan
  };

  const angka = nilai.jenis === "angka";
  const galatKolom = (k: KolomKoreksi) =>
    galat[k]?.length ? (
      <p role="alert" className="mt-1 text-xs text-red-700">
        {galat[k]!.join(" ")}
      </p>
    ) : null;
  const label = (k: KolomKoreksi, teks: string, wajib = false) => (
    <label htmlFor={`k-${k}`} className="block text-sm font-medium">
      {teks}
      {wajib && <span className="text-red-600"> *</span>}
    </label>
  );

  function pratinjauDampak() {
    setGalat({});
    setPesan(null);
    mulai(async () => {
      const h = await pratinjauKoreksiAksi(nilai);
      if (h.ok) setPratinjau({ nama: h.nama, baris: h.pratinjau, form: { ...nilai } });
      else {
        setPratinjau(null);
        setGalat(h.galat ?? {});
        setPesan({ jenis: "galat", teks: h.pesan ?? "Periksa isian yang bertanda merah." });
      }
    });
  }

  function simpan() {
    mulai(async () => {
      const h = await simpanKoreksiAksi(nilai);
      if (h.ok) {
        setPesan({ jenis: "ok", teks: h.pesan });
        setPratinjau(null);
        setNilai((n) => ({ ...n, nip: "", tanggal_mulai: "", tanggal_selesai: "", jumlah_hari: "", alasan: "", sumber: "" }));
        router.refresh();
      } else {
        setGalat(h.galat ?? {});
        setPesan({ jenis: "galat", teks: h.pesan ?? "Periksa isian yang bertanda merah." });
      }
    });
  }

  const namaKomp = (k: string | null) => (k ? `${k} - ${komponen.find((c) => c.kode === k)?.nama ?? k}` : "Tidak dihitung (dihapus)");

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6" aria-label="Tambah koreksi">
      <h2 className="text-sm font-semibold uppercase text-slate-500">Tambah Koreksi</h2>

      <fieldset>
        <legend className="text-sm font-medium">Jenis koreksi</legend>
        <div className="mt-1 flex flex-wrap gap-6 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input type="radio" name="k-jenis" value="periode" checked={!angka} onChange={ubah("jenis")} /> Periode tanggal (semua bulan yang seluruhnya masuk periode)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="k-jenis" value="angka" checked={angka} onChange={ubah("jenis")} /> Angka per bulan (pindahkan sejumlah hari pada satu bulan)
          </label>
        </div>
        {galatKolom("jenis")}
      </fieldset>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          {label("nip", "NIP", true)}
          <input id="k-nip" className={kotak} value={nilai.nip} onChange={ubah("nip")} maxLength={18} aria-invalid={!!galat.nip} />
          {galatKolom("nip")}
        </div>
        <div>
          {label("dari_komponen", "Pindahkan dari komponen", true)}
          <select id="k-dari_komponen" className={kotak} value={nilai.dari_komponen} onChange={ubah("dari_komponen")}>
            {komponen.map((c) => (
              <option key={c.kode} value={c.kode}>{c.kode} - {c.nama}</option>
            ))}
          </select>
          {galatKolom("dari_komponen")}
        </div>
        <div>
          {label("ke_komponen", "Ke komponen")}
          <select id="k-ke_komponen" className={kotak} value={nilai.ke_komponen} onChange={ubah("ke_komponen")}>
            <option value="">Tidak dihitung (dihapus) - untuk pensiun/resign/meninggal</option>
            {komponen.map((c) => (
              <option key={c.kode} value={c.kode}>{c.kode} - {c.nama}</option>
            ))}
          </select>
          {galatKolom("ke_komponen")}
        </div>

        {!angka && (
          <>
            <div>
              {label("tanggal_mulai", "Tanggal mulai", true)}
              <input id="k-tanggal_mulai" type="date" className={kotak} value={nilai.tanggal_mulai} onChange={ubah("tanggal_mulai")} aria-invalid={!!galat.tanggal_mulai} />
              {galatKolom("tanggal_mulai")}
            </div>
            <div>
              {label("tanggal_selesai", "Tanggal selesai (kosongkan jika belum ada batas)")}
              <input id="k-tanggal_selesai" type="date" className={kotak} value={nilai.tanggal_selesai} onChange={ubah("tanggal_selesai")} aria-invalid={!!galat.tanggal_selesai} />
              {galatKolom("tanggal_selesai")}
            </div>
          </>
        )}
        {angka && (
          <>
            <div>
              {label("bulan", "Bulan", true)}
              <select id="k-bulan" className={kotak} value={nilai.bulan} onChange={ubah("bulan")}>
                <option value="">-- Pilih --</option>
                {NAMA_BULAN.slice(1).map((n, i) => (
                  <option key={n} value={i + 1}>{n}</option>
                ))}
              </select>
              {galatKolom("bulan")}
            </div>
            <div>
              {label("tahun", "Tahun", true)}
              <input id="k-tahun" type="number" className={kotak} value={nilai.tahun} onChange={ubah("tahun")} />
              {galatKolom("tahun")}
            </div>
            <div>
              {label("jumlah_hari", "Jumlah hari yang dipindah", true)}
              <input id="k-jumlah_hari" type="number" min={1} max={31} className={kotak} value={nilai.jumlah_hari} onChange={ubah("jumlah_hari")} />
              {galatKolom("jumlah_hari")}
            </div>
          </>
        )}
        <div>
          {label("sumber", "Sumber (mis. SK perpanjangan)")}
          <input id="k-sumber" className={kotak} value={nilai.sumber} onChange={ubah("sumber")} maxLength={150} />
          {galatKolom("sumber")}
        </div>
        <div className="sm:col-span-3">
          {label("alasan", "Alasan", true)}
          <input id="k-alasan" className={kotak} value={nilai.alasan} onChange={ubah("alasan")} maxLength={255} aria-invalid={!!galat.alasan} />
          {galatKolom("alasan")}
        </div>
      </div>

      {pratinjau && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">
            Pratinjau dampak: {pratinjau.nama ?? "(nama tidak ditemukan)"} ({pratinjau.form.nip}), {namaKomp(pratinjau.form.dari_komponen ?? null)} &rarr; {namaKomp(pratinjau.form.ke_komponen || null)}
          </h3>
          {pratinjau.baris.length === 0 ? (
            <p className="text-sm text-slate-500">
              NIP ini belum punya Rekap Kehadiran pada bulan yang tercakup. Koreksi tetap bisa disimpan dan akan berlaku saat rekap bulan itu diunggah.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2">Bulan</th>
                    <th className="py-2">Cakupan</th>
                    <th className="py-2">{pratinjau.form.dari_komponen} sekarang &rarr; hasil</th>
                    <th className="py-2">{pratinjau.form.ke_komponen || "Tujuan"} sekarang &rarr; hasil</th>
                    <th className="py-2">Dipindah</th>
                  </tr>
                </thead>
                <tbody>
                  {pratinjau.baris.map((p) => {
                    const [teks, kelas] = LABEL_CAKUPAN[p.cakupan] ?? [p.cakupan, ""];
                    return (
                      <tr key={`${p.tahun}-${p.bulan}`} className="border-b last:border-0">
                        <td className="py-2">{NAMA_BULAN[p.bulan]} {p.tahun}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${kelas}`}>{teks}</span>
                          {p.kurang && <div className="mt-1 text-xs text-yellow-700">Hari tersedia kurang dari yang diminta, hanya {p.dipindah} hari yang dipindah.</div>}
                        </td>
                        <td className="py-2">{p.dariSekarang} &rarr; {p.dariHasil}</td>
                        <td className="py-2">{p.keSekarang === null ? "-" : `${p.keSekarang} → ${p.keHasil}`}</td>
                        <td className="py-2 font-semibold">{p.dipindah}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-slate-500">
                Bulan &quot;Sebagian&quot; (periode mulai/selesai di tengah bulan) sengaja tidak diubah karena sumber hanya punya total bulanan; gunakan koreksi jenis &quot;Angka per bulan&quot; untuk bulan itu.
                Bulan yang punya koreksi angka aktif tidak diubah oleh koreksi periode.
              </p>
            </>
          )}
        </div>
      )}

      {pesan && (
        <div role={pesan.jenis === "galat" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${pesan.jenis === "galat" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
          {pesan.teks}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={pratinjauDampak} disabled={sibuk} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          Pratinjau Dampak
        </button>
        {pratinjau && (
          <button type="button" onClick={simpan} disabled={sibuk} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50">
            {sibuk ? "Menyimpan…" : "Simpan & Terapkan"}
          </button>
        )}
      </div>
    </section>
  );
}
