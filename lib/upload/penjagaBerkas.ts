/**
 * Pemeriksaan murah SEBELUM berkas Excel dibaca penuh (padanan PemeriksaFileExcel KDS2): memuat seluruh
 * workbook kerja (belasan sheet, puluhan ribu baris, rumus lintas-sheet) menghabiskan memori. Di sini hanya
 * daftar sheet dan jumlah baris tiap sheet (dari elemen <dimension>) yang dibaca, tanpa mengurai isi sel.
 */
import JSZip from "jszip";

import { KesalahanUpload, MAKS_BARIS, MAKS_SHEET, MAKS_UKURAN_BERKAS } from "./konstanta";

export type InfoSheet = { nama: string; totalBaris: number };

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const atribut = (tag: string, nama: string) => {
  const m = new RegExp(`\\s${nama}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : undefined;
};

const PESAN_RUSAK = "File Excel tidak bisa dibaca. Pastikan formatnya .xlsx dan tidak rusak.";

export async function daftarSheet(berkas: Uint8Array): Promise<InfoSheet[]> {
  if (berkas.length > MAKS_UKURAN_BERKAS) {
    throw new KesalahanUpload(`Berkas terlalu besar (maksimum ${MAKS_UKURAN_BERKAS / 1024 / 1024} MB).`);
  }
  // .xlsx adalah arsip ZIP: harus diawali "PK\x03\x04".
  if (berkas.length < 4 || berkas[0] !== 0x50 || berkas[1] !== 0x4b || berkas[2] !== 0x03 || berkas[3] !== 0x04) {
    throw new KesalahanUpload(PESAN_RUSAK);
  }
  try {
    const zip = await JSZip.loadAsync(berkas);
    const wb = await zip.file("xl/workbook.xml")?.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    if (!wb || !rels) throw new Error("bukan workbook");

    const target = new Map<string, string>();
    for (const t of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
      const id = atribut(t, "Id");
      const tujuan = atribut(t, "Target");
      if (id && tujuan) target.set(id, tujuan);
    }

    const hasil: InfoSheet[] = [];
    for (const t of wb.match(/<sheet\b[^>]*>/g) ?? []) {
      const nama = atribut(t, "name");
      const rid = /\sr:id="([^"]*)"/.exec(t)?.[1];
      const tujuan = rid ? target.get(rid) : undefined;
      if (!nama || !tujuan) continue;
      const jalur = tujuan.startsWith("/") ? tujuan.slice(1) : `xl/${tujuan}`;
      const xml = await zip.file(jalur)?.async("string");
      // <dimension ref="A1:V2801"/> (atau satu sel "A1"): baris terakhir yang berisi/berformat.
      const ref = xml ? /<dimension\s+ref="([^"]*)"/.exec(xml)?.[1] : undefined;
      const akhir = ref ? ref.split(":").pop() : undefined;
      const baris = akhir ? Number(/\d+$/.exec(akhir)?.[0] ?? 0) : 0;
      hasil.push({ nama, totalBaris: baris });
    }
    if (hasil.length === 0) throw new Error("tanpa sheet");
    return hasil;
  } catch (e) {
    if (e instanceof KesalahanUpload) throw e;
    throw new KesalahanUpload(PESAN_RUSAK);
  }
}

const angka = (n: number) => n.toLocaleString("id-ID");

function periksaBaris(s: InfoSheet) {
  if (s.totalBaris > MAKS_BARIS) {
    throw new KesalahanUpload(
      `Sheet "${s.nama}" memuat ${angka(s.totalBaris)} baris - terlalu besar untuk data satu bulan. Pastikan sheet hanya berisi data pegawai bulan ini dan hapus baris kosong/format di bawah data.`,
    );
  }
}

/**
 * @param namaSheet bila diisi, hanya sheet itu yang akan dibaca (berkas boleh banyak sheet)
 * @returns nama sheet persis seperti di berkas (huruf besar/kecil dinormalkan), atau null bila namaSheet kosong
 */
export async function periksaBerkas(berkas: Uint8Array, namaSheet?: string | null): Promise<string | null> {
  const info = await daftarSheet(berkas);
  const diminta = (namaSheet ?? "").trim();

  if (diminta !== "") {
    const cocok = info.find((s) => s.nama.trim().toLowerCase() === diminta.toLowerCase());
    if (!cocok) {
      throw new KesalahanUpload(
        `Sheet "${diminta}" tidak ditemukan di file. Sheet yang ada: ${info.map((s) => `"${s.nama}"`).join(", ")}.`,
        "nama_sheet",
      );
    }
    periksaBaris(cocok);
    return cocok.nama;
  }

  if (info.length > MAKS_SHEET) {
    throw new KesalahanUpload(
      `File ini berisi ${info.length} sheet (${info
        .slice(0, 3)
        .map((s) => `"${s.nama}"`)
        .join(", ")}, ...) - tampaknya workbook kerja lengkap. Isi kolom "Nama sheet" dengan sheet yang berisi data, atau salin sheet datanya ke file baru.`,
    );
  }
  info.forEach(periksaBaris);
  return null;
}
