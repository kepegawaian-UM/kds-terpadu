/** Bagian sisi-browser (tanpa dependensi server, bisa dites di Node): memotong berkas dan mengirimnya per potongan. */
import { UKURAN_POTONGAN } from "./konstanta";

export type HasilUnggah = { uploadId: string; totalPotongan: number; namaFile: string; ukuran: number };

export function jumlahPotongan(ukuran: number): number {
  return Math.max(1, Math.ceil(ukuran / UKURAN_POTONGAN));
}

/**
 * Mengirim berkas per potongan, berurutan, dengan percobaan ulang untuk galat jaringan/server.
 * Bila ada potongan yang akhirnya gagal, potongan yang sudah masuk dibuang dan galat berpesan Indonesia dilempar.
 */
export async function unggahBerkas(
  berkas: File,
  opsi: {
    url?: string;
    fetchFn?: typeof fetch;
    saatProgres?: (terkirim: number, total: number) => void;
    percobaan?: number;
  } = {},
): Promise<HasilUnggah> {
  const url = opsi.url ?? "/api/upload-chunk";
  const kirim = opsi.fetchFn ?? fetch;
  const percobaan = opsi.percobaan ?? 3;
  const total = jumlahPotongan(berkas.size);
  const uploadId = crypto.randomUUID();

  opsi.saatProgres?.(0, total);
  for (let i = 0; i < total; i++) {
    let pesan = "Gagal mengirim berkas.";
    let berhasil = false;
    for (let p = 1; p <= percobaan && !berhasil; p++) {
      try {
        const form = new FormData();
        form.set("uploadId", uploadId);
        form.set("chunkIndex", String(i));
        form.set("chunk", berkas.slice(i * UKURAN_POTONGAN, (i + 1) * UKURAN_POTONGAN), `potongan-${i}`);
        const res = await kirim(url, { method: "POST", body: form });
        if (res.ok) {
          berhasil = true;
        } else {
          const isi = (await res.json().catch(() => null)) as { error?: string } | null;
          pesan = isi?.error ?? pesan;
          if (res.status >= 400 && res.status < 500) break; // salah permintaan/sesi: mengulang tak berguna
        }
      } catch {
        pesan = "Koneksi terputus saat mengirim berkas.";
      }
    }
    if (!berhasil) {
      await kirim(`${url}?uploadId=${uploadId}`, { method: "DELETE" }).catch(() => undefined);
      throw new Error(pesan);
    }
    opsi.saatProgres?.(i + 1, total);
  }
  return { uploadId, totalPotongan: total, namaFile: berkas.name, ukuran: berkas.size };
}
