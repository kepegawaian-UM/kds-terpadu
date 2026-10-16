"use client";

/**
 * Membersihkan berkas tarikan SIMPEGA (REKAP_PEGAWAI) DI BROWSER: berkas dibaca dan dipangkas di memori peramban ini, TIDAK dikirim ke server mana pun
 * (komponen ini tidak memanggil fetch/XHR). Hasilnya diunduh sebagai berkas "_bersih" (hanya kolom daftar putih). Logikanya sama dengan `npm run bersihkan`
 * (lib/simpega/pembersih.ts), sehingga bisa dipakai dari komputer mana pun tanpa memasang apa pun.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { LaporanPembersihan } from "@/lib/simpega/pembersih";

const MAKS_MB = 40;

type Tahap =
  | { jenis: "diam" }
  | { jenis: "proses"; nama: string }
  | { jenis: "selesai"; nama: string; namaKeluar: string; url: string; ukuranKb: number; laporan: LaporanPembersihan; baris: number }
  | { jenis: "gagal"; pesan: string };

export function BersihkanBerkas() {
  const [tahap, setTahap] = useState<Tahap>({ jenis: "diam" });
  const urlAktif = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlAktif.current) URL.revokeObjectURL(urlAktif.current);
    },
    [],
  );

  async function proses(berkas: File | undefined) {
    if (urlAktif.current) {
      URL.revokeObjectURL(urlAktif.current);
      urlAktif.current = null;
    }
    if (!berkas) return setTahap({ jenis: "diam" });
    if (!/\.xlsx$/i.test(berkas.name)) return setTahap({ jenis: "gagal", pesan: "Berkas harus berformat .xlsx." });
    if (berkas.size > MAKS_MB * 1024 * 1024) return setTahap({ jenis: "gagal", pesan: `Berkas terlalu besar (maks ${MAKS_MB} MB).` });

    setTahap({ jenis: "proses", nama: berkas.name });
    try {
      const asli = new Uint8Array(await berkas.arrayBuffer());
      const { bersihkanRekapPegawai, hasilBacaIdentik, BerkasBukanRekapPegawai } = await import("@/lib/simpega/pembersih");
      try {
        const { buffer, laporan } = await bersihkanRekapPegawai(asli);
        const bukti = await hasilBacaIdentik(asli, buffer);
        if (!bukti.identik) throw new Error("Hasil baca berkas bersih berbeda dari berkas asli (tidak seharusnya terjadi). Berkas tidak dibuat.");
        const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        urlAktif.current = url;
        setTahap({
          jenis: "selesai",
          nama: berkas.name,
          namaKeluar: berkas.name.replace(/\.xlsx$/i, "") + "_bersih.xlsx",
          url,
          ukuranKb: Math.round(buffer.length / 1024),
          laporan,
          baris: bukti.barisBersih,
        });
      } catch (e) {
        if (e instanceof BerkasBukanRekapPegawai) return setTahap({ jenis: "gagal", pesan: e.message });
        throw e;
      }
    } catch (e) {
      setTahap({ jenis: "gagal", pesan: e instanceof Error ? e.message : "Berkas tidak bisa dibaca." });
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="block text-sm font-medium text-slate-700" htmlFor="berkas-simpega">
          Berkas Rekap Pegawai dari SIMPEGA (.xlsx)
        </label>
        <input
          id="berkas-simpega"
          type="file"
          accept=".xlsx"
          onChange={(e) => proses(e.target.files?.[0])}
          className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-50"
        />
        <p className="mt-2 text-xs text-slate-500">Diproses di browser ini saja; tidak ada yang dikirim ke server.</p>
      </div>

      {tahap.jenis === "proses" && <p className="text-sm text-slate-600">Membersihkan {tahap.nama}…</p>}

      {tahap.jenis === "gagal" && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {tahap.pesan}
        </div>
      )}

      {tahap.jenis === "selesai" && (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold text-sidebar">{tahap.baris.toLocaleString("id-ID")}</div>
              <div className="text-xs text-slate-500">baris pegawai</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-sidebar">{tahap.laporan.kolomDipertahankan.length}</div>
              <div className="text-xs text-slate-500">kolom dipertahankan</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{tahap.laporan.kolomDibuang.length}</div>
              <div className="text-xs text-slate-500">kolom dibuang</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={tahap.url}
              download={tahap.namaKeluar}
              className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter"
            >
              Unduh {tahap.namaKeluar} ({tahap.ukuranKb.toLocaleString("id-ID")} KB)
            </a>
            <Link href="/standarisasi" className="text-sm text-blue-700 underline">
              Lanjut ke Standarisasi
            </Link>
          </div>

          <details className="text-sm text-slate-600">
            <summary className="cursor-pointer text-slate-700">Rincian kolom</summary>
            <p className="mt-2">
              <strong>Dipertahankan:</strong> {tahap.laporan.kolomDipertahankan.join(", ")}
            </p>
            <p className="mt-2">
              <strong>Dibuang:</strong> {tahap.laporan.kolomDibuang.join(", ") || "-"}
            </p>
            <p className="mt-2 text-xs text-slate-500">Hasil baca berkas bersih sudah dicek identik dengan berkas asli. Unggah hanya berkas _bersih; berkas asli tidak berubah.</p>
          </details>
        </div>
      )}
    </div>
  );
}
