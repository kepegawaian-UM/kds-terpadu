/**
 * Pembersih berkas SIMPEGA (lib/simpega/pembersih.ts): berkas sintetis dengan kolom sensitif palsu bernilai penanda unik. Pembuktian utama: tidak satu pun
 * penanda sensitif tersisa di SELURUH isi berkas hasil (semua bagian zip: sheet, sharedStrings, properti dokumen), dan hasil baca aplikasi identik.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { parseRawNominatif } from "@/lib/excel/parseRawNominatif";
import { KOLOM_DIIZINKAN, KOLOM_WAJIB_REKAP } from "@/lib/excel/parseRekapPegawai";
import { BerkasBukanRekapPegawai, bersihkanRekapPegawai, hasilBacaIdentik } from "@/lib/simpega/pembersih";

const ZW = String.fromCharCode(0x200c);
const SENSITIF = ["NIK", "No KK", "NPWP", "Nama Ibu Kandung", "No HP", "Email Resmi", "No Rekening", "Alamat KTP", "Nama Pasangan", "Gaji Pokok", "Agama"];
const penanda = (kolom: string, i: number) => `RAHASIA-${kolom.replace(/\W/g, "")}-${i}`;

/** Berkas mirip tarikan SIMPEGA: kolom wajib + kolom sensitif di antaranya, nilai teks berawalan U+200C, dua sheet, properti pembuat. */
async function buatBerkas(opsi: { jumlah?: number; tanpaKolomWajib?: string; denganRemunerasi?: boolean } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PEMBUAT-RAHASIA";
  wb.lastModifiedBy = "PENGUBAH-RAHASIA";
  const ws = wb.addWorksheet("Worksheet");
  const wajib = KOLOM_WAJIB_REKAP.filter((k) => k !== opsi.tanpaKolomWajib);
  const kolom = [SENSITIF[0], SENSITIF[1], ...wajib.slice(0, 4), ...SENSITIF.slice(2, 6), ...wajib.slice(4), "Tanggal Lahir", ...(opsi.denganRemunerasi ? ["Jabatan Remunerasi"] : []), ...SENSITIF.slice(6)];
  ws.addRow(kolom.map((k) => `${ZW}${k}`));
  for (let i = 0; i < (opsi.jumlah ?? 5); i++) {
    ws.addRow(
      kolom.map((k) => {
        if (SENSITIF.includes(k)) return `${ZW}${penanda(k, i)}`;
        if (k === "NIP") return `${ZW}19900101202001${String(1000 + i)}`;
        if (k === "Tanggal Masuk") return `${ZW}2015-04-01`;
        if (k === "Tanggal Lahir") return `${ZW}1990-01-02`;
        if (k === "Jenis Kelamin") return `${ZW}${i % 2 ? "Perempuan" : "Laki-laki"}`;
        return `${ZW}${k} ${i}`;
      }),
    );
  }
  ws.getCell("A1").note = "CATATAN-RAHASIA";
  const tersembunyi = wb.addWorksheet("Rahasia");
  tersembunyi.state = "hidden";
  tersembunyi.addRow(["SHEET-TERSEMBUNYI-RAHASIA"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function semuaIsi(berkas: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(berkas);
  const bagian = await Promise.all(Object.values(zip.files).filter((f) => !f.dir).map((f) => f.async("string")));
  return bagian.join("\n");
}

describe("bersihkanRekapPegawai", () => {
  it("hanya kolom daftar putih yang tersisa; semua penanda sensitif, catatan, sheet tersembunyi, dan nama pembuat hilang dari seluruh isi berkas", async () => {
    const asli = await buatBerkas();
    expect(await semuaIsi(asli)).toContain("RAHASIA-NIK-0"); // berkas uji memang memuatnya
    expect(await semuaIsi(asli)).toContain("PEMBUAT-RAHASIA");

    const { buffer, laporan } = await bersihkanRekapPegawai(asli);
    const isi = await semuaIsi(buffer);
    expect(isi).not.toMatch(/RAHASIA/);
    expect(isi).not.toMatch(/CATATAN|TERSEMBUNYI/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Worksheet"]);
    const header = (wb.worksheets[0].getRow(1).values as string[]).slice(1);
    expect(header.every((h) => KOLOM_DIIZINKAN.includes(h))).toBe(true);
    expect(header).toHaveLength(KOLOM_WAJIB_REKAP.length + 1); // wajib + Tanggal Lahir
    expect(wb.creator).toBe("pembersih KDS Terpadu");

    expect(laporan).toMatchObject({ namaSheet: "Worksheet", jumlahBaris: 5 });
    expect(laporan.kolomDibuang.sort()).toEqual([...SENSITIF].sort());
    expect(laporan.kolomDipertahankan).toHaveLength(header.length);
    expect(laporan.kolomAsli).toBe(laporan.kolomDibuang.length + laporan.kolomDipertahankan.length);
  });

  it("hasil baca aplikasi identik dengan berkas asli, termasuk NIP tetap teks 18 digit dan tanggal", async () => {
    const asli = await buatBerkas({ jumlah: 12 });
    const { buffer } = await bersihkanRekapPegawai(asli);
    expect(await hasilBacaIdentik(asli, buffer)).toEqual({ identik: true, barisAsli: 12, barisBersih: 12 });
    const baca = await parseRawNominatif(buffer);
    expect(baca.rows[3].nip).toBe("199001012020011003");
    expect(baca.rows[3].tanggalMasuk?.toISOString()).toBe("2015-04-01T00:00:00.000Z");
  });

  it("kolom Jabatan Remunerasi (AG) dipertahankan dan terbaca; berkas tanpa kolom itu tetap diterima", async () => {
    const { buffer, laporan } = await bersihkanRekapPegawai(await buatBerkas({ denganRemunerasi: true }));
    expect(laporan.kolomDipertahankan).toContain("Jabatan Remunerasi");
    expect(laporan.kolomDibuang.sort()).toEqual([...SENSITIF].sort());
    const baca = await parseRawNominatif(buffer, { tolakKolomLain: true });
    expect(baca.rows[2].jabatanRemunerasiRaw).toBe("Jabatan Remunerasi 2");
    const tanpa = await parseRawNominatif((await bersihkanRekapPegawai(await buatBerkas())).buffer, { tolakKolomLain: true });
    expect(tanpa.rows[2]).not.toHaveProperty("jabatanRemunerasiRaw");
  });

  it("baris tanpa NIP digit (catatan kaki) tidak dibawa; berkas yang bukan REKAP_PEGAWAI ditolak dengan pesan jelas", async () => {
    const asli = await buatBerkas({ jumlah: 3 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(asli as unknown as ExcelJS.Buffer);
    wb.worksheets[0].addRow(["Catatan kaki: dicetak oleh PETUGAS-RAHASIA"]);
    const denganCatatan = Buffer.from(await wb.xlsx.writeBuffer());
    const { buffer, laporan } = await bersihkanRekapPegawai(denganCatatan);
    expect(laporan.jumlahBaris).toBe(3);
    expect(await semuaIsi(buffer)).not.toMatch(/PETUGAS-RAHASIA/);

    await expect(bersihkanRekapPegawai(await buatBerkas({ tanpaKolomWajib: "Unit Kerja" }))).rejects.toBeInstanceOf(BerkasBukanRekapPegawai);
    await expect(bersihkanRekapPegawai(Buffer.from("bukan xlsx"))).rejects.toThrow();
  });

  it("membersihkan berkas yang sudah bersih tidak mengubah apa pun (idempoten)", async () => {
    const { buffer } = await bersihkanRekapPegawai(await buatBerkas());
    const lagi = await bersihkanRekapPegawai(buffer);
    expect(lagi.laporan.kolomDibuang).toEqual([]);
    expect(await hasilBacaIdentik(buffer, lagi.buffer)).toMatchObject({ identik: true });
  });
});

describe("penjaga mode ketat (tolakKolomLain)", () => {
  it("berkas mentah dengan kolom sensitif ditolak dan nama kolom disebut (tanpa isinya); berkas bersih diterima", async () => {
    const asli = await buatBerkas();
    const galat = await parseRawNominatif(asli, { tolakKolomLain: true }).catch((e: Error) => e);
    expect(galat).toBeInstanceOf(Error);
    const pesan = (galat as Error).message;
    expect(pesan).toMatch(/masih memuat 11 kolom/);
    expect(pesan).toMatch(/NIK/);
    expect(pesan).toMatch(/npm run bersihkan/);
    expect(pesan).not.toMatch(/RAHASIA/); // isi sel tidak pernah masuk pesan
    expect((galat as { kolom?: string[] }).kolom?.sort()).toEqual([...SENSITIF].sort());

    const { buffer } = await bersihkanRekapPegawai(asli);
    expect((await parseRawNominatif(buffer, { tolakKolomLain: true })).rows).toHaveLength(5);
  });

  it("tanpa opsi, berkas mentah tetap bisa dibaca (jalur skrip lokal dan tes paritas); satu kolom lain saja sudah cukup untuk menolak", async () => {
    const asli = await buatBerkas();
    expect((await parseRawNominatif(asli)).rows).toHaveLength(5);
    const { buffer } = await bersihkanRekapPegawai(asli);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    wb.worksheets[0].getCell(1, 40).value = "Email Resmi";
    const satuKolomLebih = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(parseRawNominatif(satuKolomLebih, { tolakKolomLain: true })).rejects.toThrow(/masih memuat 1 kolom/);
  });

  it("berkas format Nominatif lama ditolak di mode ketat", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Nominatif");
    ws.addRow(["#", "NIP"]);
    await expect(parseRawNominatif(Buffer.from(await wb.xlsx.writeBuffer()), { tolakKolomLain: true })).rejects.toThrow(/format Nominatif lama/);
  });
});
