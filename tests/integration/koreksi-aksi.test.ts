/**
 * Aksi server halaman Koreksi Rekap (F4.2b/c) terhadap kds_test: login wajib, validasi per kolom, pratinjau tanpa menulis,
 * simpan + terapkan (dengan audit), batalkan, terapkan ulang, serta alur impor Excel (unggah -> periksa -> simpan) dan template.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { POST as kirimPotongan } from "@/app/api/upload-chunk/route";
import {
  batalkanImporKoreksi, batalkanKoreksiAksi, periksaImporKoreksi, pratinjauKoreksiAksi, simpanImporKoreksi, simpanKoreksiAksi, terapkanUlangAksi,
} from "@/app/(app)/koreksi-rekap/actions";
import { GET as unduhTemplate } from "@/app/(app)/koreksi-rekap/template/route";
import { HEADER_KOREKSI } from "@/lib/koreksi/impor";
import { unggahBerkas } from "@/lib/upload/klien";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const sesi = vi.hoisted(() => ({ user: { id: "u1", name: "Admin Uji" } as { id: string; name: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (sesi.user ? { user: sesi.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const NIP = "900000000000000001";

const form = { jenis: "periode", nip: NIP, dari_komponen: "TK", ke_komponen: "TB", tanggal_mulai: "2026-09-01", tanggal_selesai: "", alasan: "Tugas belajar" };
const kirim = async (berkas: File) =>
  unggahBerkas(berkas, { fetchFn: (async (url: string, init?: RequestInit) => kirimPotongan(new Request(`http://localhost${url}`, init))) as unknown as typeof fetch });

async function berkas(rows: (string | number | null)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Koreksi");
  ws.addRow(HEADER_KOREKSI);
  rows.forEach((r) => ws.addRow(r));
  return new File([new Uint8Array(await wb.xlsx.writeBuffer())], "koreksi.xlsx");
}

describe.skipIf(!ada)("Aksi Koreksi Rekap", () => {
  beforeEach(async () => {
    sesi.user = { id: "u1", name: "Admin Uji" };
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.uploadChunk.deleteMany();
    await muatKeadaan(prisma, {
      nominatif: [{ nip: NIP, bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" }],
      rekap: [{ nip: NIP, bulan: 9, tahun: 2026, komponen: { SIGMA_HARI: "30", TK: "6" } }, { nip: NIP, bulan: 10, tahun: 2026, komponen: { SIGMA_HARI: "31", TK: "2" } }],
    });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.uploadChunk.deleteMany();
    await prisma.$disconnect();
  });

  const nilaiTK = async (bulan: number) => (await prisma.rekapKehadiranDetail.findFirstOrThrow({ where: { komponenKode: "TK", rekap: { nip: NIP, bulan, tahun: 2026 } } })).nilai;

  it("semua aksi menolak tanpa login dan tidak mengubah apa pun", async () => {
    sesi.user = null;
    for (const h of [await pratinjauKoreksiAksi(form), await simpanKoreksiAksi(form), await batalkanKoreksiAksi(1), await terapkanUlangAksi(9, 2026)]) {
      expect(h).toMatchObject({ ok: false });
      expect(JSON.stringify(h)).toMatch(/login/);
    }
    expect(await periksaImporKoreksi({ uploadId: "x", totalPotongan: 1, namaFile: "a.xlsx" })).toMatchObject({ ok: false });
    expect(await prisma.koreksiRekap.count()).toBe(0);
    expect(await nilaiTK(9)).toBe("6");
  });

  it("pratinjau menampilkan dampak dan nama, tidak menulis; galat per kolom bila isian salah", async () => {
    const p = await pratinjauKoreksiAksi(form);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.pratinjau.map((b) => [b.bulan, b.cakupan, b.dariSekarang, b.dipindah])).toEqual([[9, "penuh", 6, 6], [10, "penuh", 2, 2]]);
    expect(p.nama).toBe(`Pegawai ${NIP}`);
    expect(await prisma.koreksiRekap.count()).toBe(0);
    expect(await nilaiTK(9)).toBe("6");

    const salah = await pratinjauKoreksiAksi({ ...form, nip: "123", ke_komponen: "TK", alasan: "" });
    expect(salah).toMatchObject({ ok: false });
    if (!salah.ok) expect(Object.keys(salah.galat ?? {}).sort()).toEqual(["alasan", "ke_komponen", "nip"]);
  });

  it("simpan menerapkan koreksi, melaporkan ringkasan, dan mencatat audit; batalkan tidak mengembalikan angka", async () => {
    const s = await simpanKoreksiAksi(form);
    expect(s).toMatchObject({ ok: true, pesan: "Koreksi disimpan dan diterapkan: 2 baris absensi diubah, 8 hari dipindah." });
    expect(await nilaiTK(9)).toBe("0");
    expect(await prisma.auditLog.count({ where: { namaTabel: "koreksi_rekap", fieldDiubah: "nip" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { namaTabel: "rekap_kehadiran_detail" } })).toBeGreaterThan(2);

    const id = (await prisma.koreksiRekap.findFirstOrThrow()).id;
    expect(await batalkanKoreksiAksi(id)).toMatchObject({ ok: true });
    expect((await prisma.koreksiRekap.findUniqueOrThrow({ where: { id } })).dibatalkanPada).not.toBeNull();
    expect(await nilaiTK(9)).toBe("0");
    expect(await batalkanKoreksiAksi(999999)).toMatchObject({ ok: false });
  });

  it("terapkan ulang: memvalidasi bulan/tahun dan menerapkan koreksi aktif", async () => {
    expect(await terapkanUlangAksi(13, 2026)).toMatchObject({ ok: false });
    expect(await terapkanUlangAksi(9, 1999)).toMatchObject({ ok: false });
    await prisma.koreksiRekap.create({ data: { nip: NIP, jenis: "periode", dariKomponen: "TK", keKomponen: "TB", tanggalMulai: new Date("2026-09-01T00:00:00Z"), alasan: "lama", dibuatOleh: "t", dibuatPada: new Date() } });
    expect(await terapkanUlangAksi(9, 2026)).toMatchObject({ ok: true, pesan: "Koreksi diterapkan ulang: 1 baris absensi diubah, 6 hari dipindah." });
    expect(await nilaiTK(9)).toBe("0");
  });

  it("template: perlu login, header sesuai, dan petunjuk memuat komponen", async () => {
    sesi.user = null;
    expect((await unduhTemplate()).status).toBe(401);
    sesi.user = { id: "u1", name: "Admin Uji" };
    const res = await unduhTemplate();
    expect(res.headers.get("content-disposition")).toContain("Template_Impor_Koreksi_Absensi.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Koreksi", "Petunjuk"]);
    expect((wb.getWorksheet("Koreksi")!.getRow(1).values as string[]).slice(1)).toEqual(HEADER_KOREKSI);
    expect(String(wb.getWorksheet("Petunjuk")!.getRow(4).getCell(2).value)).toContain("TK = Tanpa Keterangan");
  });

  it("impor Excel: unggah -> periksa (tanpa menulis) -> simpan (transaksi) -> potongan dibuang", async () => {
    const u = await kirim(await berkas([[NIP, "", "TK", "TB", "2026-09-01", "", "", "", "", "Impor", ""], [NIP, "angka", "TK", "CTH", "", "", 10, 2026, 1, "Angka", ""], [NIP, "", "XX", "", "2026-09-01", "", "", "", "", "salah", ""]]));
    const masukan = { uploadId: u.uploadId, totalPotongan: u.totalPotongan, namaFile: u.namaFile };

    const p = await periksaImporKoreksi(masukan);
    expect(p).toMatchObject({ ok: true, ringkasan: { total: 3, valid: 2, gagal: 1, duplikat: 0 } });
    expect(await prisma.koreksiRekap.count()).toBe(0);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(1);

    const s = await simpanImporKoreksi(masukan);
    expect(s).toMatchObject({ ok: true });
    if (s.ok) expect(s.pesan).toMatch(/Impor selesai: 2 koreksi disimpan/);
    expect(await prisma.koreksiRekap.count()).toBe(2);
    expect(await nilaiTK(9)).toBe("0");
    expect(await prisma.uploadChunk.count({ where: { uploadId: u.uploadId } })).toBe(0);

    // unggah ulang berkas yang sama: semua duplikat
    const u2 = await kirim(await berkas([[NIP, "", "TK", "TB", "2026-09-01", "", "", "", "", "Impor", ""]]));
    expect(await periksaImporKoreksi({ uploadId: u2.uploadId, totalPotongan: u2.totalPotongan, namaFile: u2.namaFile })).toMatchObject({ ok: true, ringkasan: { valid: 0, duplikat: 1 } });
    await batalkanImporKoreksi(u2.uploadId);
    expect(await prisma.uploadChunk.count({ where: { uploadId: u2.uploadId } })).toBe(0);
  });

  it("impor: header wajib hilang, berkas rusak, bukan xlsx, dan unggahan tidak lengkap ditolak dengan pesan jelas", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("K").addRow(["A", "B"]);
    const tanpaHeader = await kirim(new File([new Uint8Array(await wb.xlsx.writeBuffer())], "x.xlsx"));
    expect(await periksaImporKoreksi({ uploadId: tanpaHeader.uploadId, totalPotongan: tanpaHeader.totalPotongan, namaFile: "x.xlsx" })).toMatchObject({ ok: false, pesan: expect.stringMatching(/Header wajib tidak ditemukan/) });
    const rusak = await kirim(new File([new Uint8Array([1, 2, 3, 4])], "rusak.xlsx"));
    expect(await periksaImporKoreksi({ uploadId: rusak.uploadId, totalPotongan: 1, namaFile: "rusak.xlsx" })).toMatchObject({ ok: false, pesan: expect.stringMatching(/tidak bisa dibaca/) });
    expect(await periksaImporKoreksi({ uploadId: rusak.uploadId, totalPotongan: 1, namaFile: "data.csv" })).toMatchObject({ ok: false, pesan: expect.stringMatching(/\.xlsx/) });
    expect(await periksaImporKoreksi({ uploadId: rusak.uploadId, totalPotongan: 3, namaFile: "rusak.xlsx" })).toMatchObject({ ok: false, pesan: expect.stringMatching(/tidak lengkap/) });
    expect(await simpanImporKoreksi({ uploadId: "bukan-uuid", totalPotongan: 1, namaFile: "x.xlsx" })).toMatchObject({ ok: false });
    expect(await prisma.koreksiRekap.count()).toBe(0);
  });

  it("impor: kegagalan di tengah penyimpanan membatalkan SEMUA koreksi dan perubahan rekap", async () => {
    // baris kedua memakai komponen tujuan valid; paksa gagal dengan menghapus pegawai setelah parse tidak mungkin, jadi
    // gunakan transaksi langsung: simpanKoreksiImpor dengan NIP yang dihapus di tengah.
    const { parseKoreksi, simpanKoreksiImpor, bacaBarisKoreksi } = await import("@/lib/koreksi/impor");
    const f = await berkas([[NIP, "", "TK", "TB", "2026-09-01", "", "", "", "", "A", ""], [NIP, "", "I", "S", "2026-09-01", "", "", "", "", "B", ""]]);
    const h = await parseKoreksi(prisma, await bacaBarisKoreksi(Buffer.from(await f.arrayBuffer())));
    h.baris[1].data.nip = "tidak-ada-di-pegawai"; // pelanggaran kunci asing pada baris kedua
    await expect(simpanKoreksiImpor(prisma, h.baris, "Admin Uji")).rejects.toThrow();
    expect(await prisma.koreksiRekap.count()).toBe(0);
    expect(await nilaiTK(9)).toBe("6");
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
