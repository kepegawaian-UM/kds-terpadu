/**
 * Membersihkan berkas tarikan SIMPEGA (REKAP_PEGAWAI) di KOMPUTER ANDA sebelum diunggah ke aplikasi: membuat berkas baru yang hanya memuat
 * kolom yang dipakai aplikasi, membuang kolom sensitif (NIK, nama ibu kandung, alamat, email, rekening, dst.). Berkas asli TIDAK diubah dan
 * TIDAK dihapus; unggah hanya berkas "_bersih". Hanya NAMA kolom yang dicetak, tidak pernah isinya.
 *
 *   npm run bersihkan -- "C:\jalur\REKAP_PEGAWAI.xlsx"            -> menulis C:\jalur\REKAP_PEGAWAI_bersih.xlsx
 *   npm run bersihkan -- "<berkas.xlsx>" "<keluaran.xlsx>" [--timpa]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { BerkasBukanRekapPegawai, bersihkanRekapPegawai, hasilBacaIdentik } from "../lib/simpega/pembersih";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const timpa = process.argv.includes("--timpa");

async function main() {
  const masuk = args[0];
  if (!masuk) throw new Error('Pakai: npm run bersihkan -- "<berkas REKAP_PEGAWAI.xlsx>" ["<berkas keluaran.xlsx>"] [--timpa]');
  if (!existsSync(masuk)) throw new Error(`Berkas tidak ditemukan: ${masuk}`);
  if (extname(masuk).toLowerCase() !== ".xlsx") throw new Error("Berkas harus berformat .xlsx.");
  const keluar = args[1] ?? join(dirname(masuk), `${basename(masuk, extname(masuk))}_bersih.xlsx`);
  if (keluar === masuk) throw new Error("Berkas keluaran tidak boleh sama dengan berkas asli.");
  if (existsSync(keluar) && !timpa) throw new Error(`Berkas keluaran sudah ada: ${keluar}\nPakai --timpa untuk menggantinya, atau beri nama keluaran lain.`);

  const asli = readFileSync(masuk);
  console.log(`Membaca ${basename(masuk)} (${(asli.length / 1024 / 1024).toFixed(1)} MB)…`);
  const { buffer, laporan } = await bersihkanRekapPegawai(asli);
  const bukti = await hasilBacaIdentik(asli, buffer);
  if (!bukti.identik) throw new Error("Pembersihan dibatalkan: hasil baca berkas bersih berbeda dari berkas asli (tidak seharusnya terjadi). Berkas tidak ditulis.");

  writeFileSync(keluar, buffer);
  console.log(`\nKolom di berkas asli : ${laporan.kolomAsli}`);
  console.log(`Kolom dipertahankan  : ${laporan.kolomDipertahankan.length}  (${laporan.kolomDipertahankan.join(", ")})`);
  console.log(`Kolom DIBUANG        : ${laporan.kolomDibuang.length}  (${laporan.kolomDibuang.join(", ")})`);
  console.log(`Baris pegawai        : ${laporan.jumlahBaris}`);
  console.log(`Verifikasi           : hasil baca berkas bersih IDENTIK dengan berkas asli (${bukti.barisBersih} baris).`);
  console.log(`\nBerkas bersih: ${keluar} (${(buffer.length / 1024).toFixed(0)} KB)`);
  console.log("Unggah HANYA berkas _bersih ini ke halaman Standarisasi. Berkas asli jangan diunggah.");
}

main().catch((e) => {
  console.error(e instanceof BerkasBukanRekapPegawai ? `Gagal: ${e.message}` : `Gagal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
