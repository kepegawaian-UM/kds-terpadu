/**
 * Beda sengaja dari KDS1 (ditemukan pada uji berkas SIMPEGA asli, 14 Okt 2026): teks Jabatan Tambahan yang PERSIS sama dengan satu nama role
 * di master dan kebetulan diawali nama role lain ("Sekretaris merangkap Bendahara Tim Pengelola Sertifikasi Dosen" = JBT-81) tetap SATU
 * jabatan, tidak dipecah menjadi dua. Master dari kds_test (sama dengan master KDS2).
 */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { resolveJabatanTambahan } from "@/lib/domain/classify";
import { loadMasterCache } from "@/lib/domain/masterCache";
import type { RawNominatifRow } from "@/lib/excel/types";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

const baris = (jabatanTambahan: string): RawNominatifRow => ({ nip: "198001012005011001", jabatanTambahanRaw: jabatanTambahan, subagUnitKerjaRaw: "", unitKerjaIndukRaw: "", direktoratFakultasRaw: "" } as unknown as RawNominatifRow);

describe.skipIf(!ada)("Jabatan Tambahan: kecocokan persis menang atas pemecahan 'merangkap'", () => {
  it("nama role master yang memuat 'merangkap' dan diawali nama role lain menjadi satu slot", async () => {
    const master = await loadMasterCache(prisma);
    const gabungan = master.jabatanTambahanRole.find((r) => r.kode === "JBT-81")!;
    expect(gabungan.namaRole).toBe("Sekretaris merangkap Bendahara Tim Pengelola Sertifikasi Dosen");
    for (const teks of [gabungan.namaRole, `  ${gabungan.namaRole.toUpperCase()}  `]) {
      const h = resolveJabatanTambahan(baris(teks), master, new Map(), "Dosen");
      expect(h, teks).toEqual({ slots: [expect.objectContaining({ jabatanTambahanRoleKode: "JBT-81", unitAsalKode: null, programStudiKode: null })] });
    }
  });

  it("teks yang memuat dua jabatan sungguhan tetap dipecah (perilaku KDS1 tidak berubah)", async () => {
    const master = await loadMasterCache(prisma);
    const unitA = master.unitAsal[0];
    const unitB = master.unitAsal[1];
    const sekretaris = master.jabatanTambahanRole.find((r) => r.namaRole === "Sekretaris")!;
    const bendahara = master.jabatanTambahanRole.find((r) => r.namaRole === "Bendahara")!;
    const h = resolveJabatanTambahan(baris(`${sekretaris.namaRole} ${unitA.nama} merangkap ${bendahara.namaRole} ${unitB.nama}`), master, new Map(), "Tendik");
    expect("slots" in h && h.slots.map((s) => s.jabatanTambahanRoleKode)).toEqual([sekretaris.kode, bendahara.kode]);
  });

  it("koma di antara kata role pada teks sumber diabaikan: role panjang master menang atas role pendek (kasus Kepala Seksi Kinerja, 16 Okt 2026)", async () => {
    const master = await loadMasterCache(prisma);
    const panjang = master.jabatanTambahanRole.find((r) => r.namaRole === "Kepala Seksi Kinerja Disiplin dan Sistem Informasi Sumber Daya Manusia")!;
    const direktorat = master.unitAsal.find((u) => u.nama === "Direktorat Sumber Daya Manusia dan Keuangan")!;
    expect(panjang && direktorat).toBeTruthy();
    const dgnKoma = "Kepala Seksi Kinerja, Disiplin, dan Sistem Informasi Sumber Daya Manusia, Direktorat Sumber Daya Manusia, dan Keuangan";
    const tanpaKoma = "Kepala Seksi Kinerja Disiplin dan Sistem Informasi Sumber Daya Manusia Direktorat Sumber Daya Manusia dan Keuangan";
    for (const teks of [dgnKoma, tanpaKoma]) {
      expect(resolveJabatanTambahan(baris(teks), master, new Map(), "Tendik"), teks).toEqual({
        slots: [{ jabatanTambahanRoleKode: panjang.kode, unitAsalKode: direktorat.kode, programStudiKode: null, statusPengangkatan: "Definitif" }],
      });
    }
    // role pendek yang memang dimaksud tetap dikenali (tanpa sisa koma yang menyesatkan)
    const pendek = master.jabatanTambahanRole.find((r) => r.namaRole === "Kepala Seksi Kinerja")!;
    const h = resolveJabatanTambahan(baris("Kepala Seksi Kinerja, Direktorat Sumber Daya Manusia dan Keuangan"), master, new Map(), "Tendik");
    expect("slots" in h && h.slots[0].jabatanTambahanRoleKode).toBe(pendek.kode);
  });

  it("role bertanda ':' (Pembina Asrama ...: <asrama>) tidak ikut toleransi koma: tetap role umum + unit asrama", async () => {
    const master = await loadMasterCache(prisma);
    const umum = master.jabatanTambahanRole.find((r) => r.namaRole === "Pembina Asrama")!;
    const panjang = master.jabatanTambahanRole.find((r) => r.namaRole.startsWith("Pembina Asrama Putra: Asrama Mawar"));
    if (!panjang) return; // master tes tanpa role ini: tidak ada yang dibandingkan
    const h = resolveJabatanTambahan(baris("Pembina Asrama Putra: Asrama Mawar, Kampus III UM"), master, new Map(), "Tendik");
    if ("slots" in h) expect(h.slots[0].jabatanTambahanRoleKode).not.toBe(panjang.kode);
    else expect(h).toHaveProperty("issue"); // unit asrama hanya ada di salinan kerja lokal, bukan di master tes: tidak boleh berpindah ke role panjang
    expect(umum).toBeTruthy();
  });
});
