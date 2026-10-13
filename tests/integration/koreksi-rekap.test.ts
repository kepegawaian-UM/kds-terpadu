/** Koreksi Rekap (F4.2a): sifat transaksi dan pengaman di luar paritas data. Data sintetis di kds_test. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { batalkanKoreksi, buatDataKoreksi, simpanDanTerapkanKoreksi } from "@/lib/koreksi/layanan";

import { kosongkanDomain } from "../../scripts/migrasi/migrasi";
import { muatKeadaan } from "../support/keadaan";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
const NIP = "900000000000000001";

const input = (o: Partial<Parameters<typeof buatDataKoreksi>[0]> = {}) =>
  buatDataKoreksi({ jenis: "periode", nip: NIP, dariKomponen: "TK", keKomponen: "TB", tanggalMulai: "2026-09-01", tanggalSelesai: null, alasan: "uji", ...o });

describe.skipIf(!ada)("Koreksi Rekap (transaksi)", () => {
  beforeEach(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await muatKeadaan(prisma, { nominatif: [{ nip: NIP, bulan: 8, tahun: 2026, jenis: "DSN", tmt: "2018-01-01" }], rekap: [{ nip: NIP, bulan: 9, tahun: 2026, komponen: { SIGMA_HARI: "30", TK: "6" } }] });
  });
  afterAll(async () => {
    await kosongkanDomain(prisma);
    await prisma.auditLog.deleteMany();
    await prisma.$disconnect();
  });

  it("menyimpan koreksi dan menerapkannya sekaligus, lengkap dengan jejak audit", async () => {
    const { koreksi, hasil } = await simpanDanTerapkanKoreksi(prisma, input(), "Admin");
    expect(hasil).toMatchObject({ barisDiubah: 1, hariDipindah: 6 });
    const nilai = Object.fromEntries((await prisma.rekapKehadiranDetail.findMany()).map((d) => [d.komponenKode, d.nilai]));
    expect(nilai).toMatchObject({ TK: "0", TB: "6" });
    const audit = await prisma.auditLog.findMany({ where: { namaTabel: "koreksi_rekap", idRecord: String(koreksi.id) } });
    expect(audit.map((a) => a.fieldDiubah)).toEqual(["nip", "jenis", "dari_komponen", "ke_komponen", "tanggal_mulai", "alasan", "dibuat_oleh", "dibuat_pada"]);
    expect(await prisma.auditLog.count({ where: { namaTabel: "rekap_kehadiran_detail", diubahOleh: `Admin (koreksi #${koreksi.id})` } })).toBe(2);
  });

  it("bila penerapan gagal di tengah, koreksi, perubahan angka, dan audit ikut dibatalkan", async () => {
    // komponen tujuan tidak ada di master -> pelanggaran kunci asing saat membuat detail tujuan
    await expect(simpanDanTerapkanKoreksi(prisma, input({ keKomponen: "XYZ" }), "Admin")).rejects.toThrow();
    expect(await prisma.koreksiRekap.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
    expect((await prisma.rekapKehadiranDetail.findFirstOrThrow({ where: { komponenKode: "TK" } })).nilai).toBe("6");
  });

  it("membatalkan koreksi mencatat audit satu kali; membatalkan lagi tidak mengubah apa pun", async () => {
    const { koreksi } = await simpanDanTerapkanKoreksi(prisma, input(), "Admin");
    await batalkanKoreksi(prisma, koreksi.id, "Admin");
    const sebelum = await prisma.koreksiRekap.findUniqueOrThrow({ where: { id: koreksi.id } });
    expect(sebelum.dibatalkanPada).not.toBeNull();
    const jumlah = await prisma.auditLog.count({ where: { fieldDiubah: "dibatalkan_pada" } });
    expect(jumlah).toBe(1);
    await batalkanKoreksi(prisma, koreksi.id, "Admin");
    expect((await prisma.koreksiRekap.findUniqueOrThrow({ where: { id: koreksi.id } })).dibatalkanPada).toEqual(sebelum.dibatalkanPada);
    expect(await prisma.auditLog.count({ where: { fieldDiubah: "dibatalkan_pada" } })).toBe(1);
    // angka yang sudah terlanjur dikoreksi TIDAK dikembalikan
    expect((await prisma.rekapKehadiranDetail.findFirstOrThrow({ where: { komponenKode: "TB" } })).nilai).toBe("6");
  });
});
