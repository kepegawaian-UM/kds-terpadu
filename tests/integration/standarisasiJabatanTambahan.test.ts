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
});
