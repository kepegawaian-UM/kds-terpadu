/**
 * Menambah data master dari layar Review (role Jabatan Tambahan, Unit Asal, Program Studi baru). Port dari
 * masterDataActions KDS1. Master di sini TERPISAH dari master SIMPEGA resmi; penyelarasannya manual oleh admin.
 * Pencarian nama tanpa membedakan huruf besar/kecil: nama yang sudah ada dikembalikan, tidak dibuat ganda.
 */
import type { PrismaClient } from "@prisma/client";

/** Kode berikutnya dari pola `<awalan>-<angka>` (angka terbesar + 1, dengan lebar minimal `lebar`). */
function kodeBerikut(kodeAda: string[], awalan: string, lebar: number): string {
  const maks = kodeAda.reduce((m, k) => {
    const cocok = k.match(new RegExp(`^${awalan}-(\\d+)$`));
    return cocok ? Math.max(m, Number(cocok[1])) : m;
  }, 0);
  return `${awalan}-${String(maks + 1).padStart(lebar, "0")}`;
}

export async function tambahRoleJabatanTambahan(prisma: PrismaClient, namaRole: string, berlakuUntuk: "Dosen" | "Tendik") {
  const nama = namaRole.trim();
  if (!nama) throw new Error("Nama role tidak boleh kosong.");
  if (berlakuUntuk !== "Dosen" && berlakuUntuk !== "Tendik") throw new Error("Berlaku untuk harus Dosen atau Tendik.");
  const ada = await prisma.jabatanTambahanRole.findFirst({ where: { namaRole: { equals: nama, mode: "insensitive" } } });
  if (ada) return { kode: ada.kode, namaRole: ada.namaRole };
  const kode = kodeBerikut((await prisma.jabatanTambahanRole.findMany({ select: { kode: true } })).map((r) => r.kode), "JBT", 2);
  const baru = await prisma.jabatanTambahanRole.create({ data: { kode, namaRole: nama, berlakuUntuk } });
  return { kode: baru.kode, namaRole: baru.namaRole };
}

export async function tambahUnitAsalBaru(prisma: PrismaClient, nama: string, unitIndukKode: string) {
  const n = nama.trim();
  if (!n) throw new Error("Nama unit tidak boleh kosong.");
  if (!(await prisma.unitInduk.findUnique({ where: { kode: unitIndukKode } }))) throw new Error("Unit Induk tidak valid.");
  const ada = await prisma.unitAsal.findFirst({ where: { nama: { equals: n, mode: "insensitive" } } });
  if (ada) return { kode: ada.kode, nama: ada.nama };
  const kode = kodeBerikut((await prisma.unitAsal.findMany({ select: { kode: true } })).map((r) => r.kode), "UA", 3);
  const baru = await prisma.unitAsal.create({ data: { kode, nama: n, unitIndukKode } });
  return { kode: baru.kode, nama: baru.nama };
}

export async function tambahProgramStudiBaru(prisma: PrismaClient, nama: string, jenjang: string, unitAsalKode: string) {
  const n = nama.trim();
  if (!n) throw new Error("Nama program studi tidak boleh kosong.");
  if (!jenjang.trim()) throw new Error("Jenjang wajib dipilih.");
  if (!(await prisma.unitAsal.findUnique({ where: { kode: unitAsalKode } }))) throw new Error("Fakultas/unit induk prodi tidak valid.");
  const ada = await prisma.programStudi.findFirst({ where: { nama: { equals: n, mode: "insensitive" } } });
  if (ada) return { kode: ada.kode, nama: ada.nama };
  const kode = kodeBerikut((await prisma.programStudi.findMany({ select: { kode: true } })).map((r) => r.kode), "PRD", 3);
  const baru = await prisma.programStudi.create({ data: { kode, nama: n, jenjang: jenjang.trim(), unitAsalKode, statusValidasi: "Draft" } });
  return { kode: baru.kode, nama: baru.nama };
}
