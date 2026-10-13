"use client";

import { useRef, useState } from "react";

import { MAKS_UKURAN_BERKAS } from "@/lib/upload/konstanta";
import { type HasilUnggah, unggahBerkas } from "@/lib/upload/klien";

/**
 * Pemilih berkas .xlsx yang mengirim berkasnya per potongan ke /api/upload-chunk (batas body Vercel 4,5 MB),
 * lalu memberi tahu induknya lewat `saatSelesai` bahwa semua potongan sudah tersimpan di server.
 * Induk yang kemudian memanggil tahap Periksa/Simpan dengan uploadId ini.
 */
export function UnggahBerkas({
  saatSelesai,
  saatBatal,
  label = "Berkas Excel (.xlsx)",
  nonaktif = false,
}: {
  saatSelesai: (hasil: HasilUnggah) => void;
  saatBatal?: () => void;
  label?: string;
  nonaktif?: boolean;
}) {
  const [progres, setProgres] = useState<{ terkirim: number; total: number } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function saatDipilih(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = e.target.files?.[0];
    setGalat(null);
    if (!berkas) {
      saatBatal?.();
      return;
    }
    if (!berkas.name.toLowerCase().endsWith(".xlsx")) {
      setGalat("File harus berformat .xlsx.");
      if (input.current) input.current.value = "";
      return;
    }
    if (berkas.size > MAKS_UKURAN_BERKAS) {
      setGalat(`Berkas terlalu besar (maksimum ${MAKS_UKURAN_BERKAS / 1024 / 1024} MB).`);
      if (input.current) input.current.value = "";
      return;
    }
    try {
      const hasil = await unggahBerkas(berkas, { saatProgres: (terkirim, total) => setProgres({ terkirim, total }) });
      saatSelesai(hasil);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Gagal mengirim berkas.");
      if (input.current) input.current.value = "";
    } finally {
      setProgres(null);
    }
  }

  const sedangKirim = progres !== null;
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor="unggah-berkas">
        {label}
      </label>
      <input
        id="unggah-berkas"
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={saatDipilih}
        disabled={nonaktif || sedangKirim}
        className="mt-1 block w-full text-sm"
      />
      {sedangKirim && (
        <div className="mt-2" role="status">
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-2 bg-blue-600 transition-all"
              style={{ width: `${Math.round((progres.terkirim / progres.total) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Mengirim berkas… {progres.terkirim} dari {progres.total} bagian
          </p>
        </div>
      )}
      {galat && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {galat}
        </p>
      )}
    </div>
  );
}
