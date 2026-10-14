/**
 * Koreksi tanggal mulai kerja (TMT) per pegawai. Dipakai Standarisasi: bila NIP punya koreksi, TMT dari berkas SIMPEGA diganti dengan
 * tanggal koreksi (supaya perbaikan manual tidak tertimpa tiap bulan). Perubahan dicatat di audit_log (per kolom, seperti perubahan manual lain).
 * Fungsi murni terhadap klien Prisma (mudah dites). Tidak berlaku untuk Upload Nominatif berbasis template (tanggal dari berkasnya sendiri).
 */
import type { PrismaClient } from "@prisma/client";

export type Pengguna = { nama: string };
export type Hasil<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const sekarang = () => new Date();

/** Teks yyyy-mm-dd menjadi tanggal murni (UTC tengah malam); null bila bukan tanggal yang ada di kalender. */
export function bacaTanggalIso(teks: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks.trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const tgl = new Date(Date.UTC(y, mo - 1, d));
  return tgl.getUTCFullYear() === y && tgl.getUTCMonth() === mo - 1 && tgl.getUTCDate() === d ? tgl : null;
}

const isoTanggal = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function daftarKoreksiTmt(prisma: PrismaClient) {
  return prisma.koreksiTanggalMulaiKerja.findMany({ orderBy: { dibuatPada: "desc" } });
}

/** Peta NIP -> TMT koreksi, dibaca Standarisasi sekali per berkas. */
export async function petaKoreksiTmt(prisma: Pick<PrismaClient, "koreksiTanggalMulaiKerja">): Promise<Map<string, Date>> {
  return new Map((await prisma.koreksiTanggalMulaiKerja.findMany({ select: { nip: true, tanggalMulaiKerja: true } })).map((k) => [k.nip, k.tanggalMulaiKerja]));
}

export type MasukanKoreksi = { nip: string; tanggal: string; alasan: string; terapkanKeSnapshot: boolean };

/**
 * Simpan (baru atau ubah) koreksi TMT satu pegawai. Bila `terapkanKeSnapshot`, TMT di SEMUA snapshot Nominatif pegawai itu ikut diganti
 * (tiap perubahan dicatat di audit_log); bila tidak, hanya Standarisasi berikutnya yang memakainya.
 */
export async function simpanKoreksiTmt(prisma: PrismaClient, m: MasukanKoreksi, pengguna: Pengguna): Promise<Hasil<{ snapshotDiubah: number }>> {
  const nip = m.nip.trim();
  const alasan = m.alasan.trim();
  const tanggal = bacaTanggalIso(m.tanggal);
  if (!/^\d{8,20}$/.test(nip)) return { ok: false, error: "NIP harus berupa angka (8 sampai 20 digit)." };
  if (!tanggal) return { ok: false, error: "Tanggal tidak valid (pakai tahun-bulan-tanggal, tanggal harus ada di kalender)." };
  if (tanggal.getUTCFullYear() < 1950 || tanggal.getTime() > Date.now() + 366 * 86_400_000) return { ok: false, error: "Tanggal di luar kewajaran (1950 sampai satu tahun ke depan)." };
  if (alasan.length < 3 || alasan.length > 300) return { ok: false, error: "Alasan wajib diisi (3 sampai 300 karakter)." };
  if (!(await prisma.pegawai.findUnique({ where: { nip }, select: { nip: true } }))) return { ok: false, error: "NIP ini belum pernah tercatat di data pegawai." };

  let diubah = 0;
  await prisma.$transaction(async (tx) => {
    const lama = await tx.koreksiTanggalMulaiKerja.findUnique({ where: { nip } });
    const baris = await tx.koreksiTanggalMulaiKerja.upsert({
      where: { nip },
      create: { nip, tanggalMulaiKerja: tanggal, alasan, dibuatOlehNama: pengguna.nama },
      update: { tanggalMulaiKerja: tanggal, alasan, dibuatOlehNama: pengguna.nama },
    });
    await tx.auditLog.create({
      data: { namaTabel: "koreksi_tanggal_mulai_kerja", idRecord: String(baris.id), fieldDiubah: "tanggal_mulai_kerja", nilaiLama: isoTanggal(lama?.tanggalMulaiKerja), nilaiBaru: isoTanggal(tanggal), diubahOleh: pengguna.nama, diubahPada: sekarang(), aksi: lama ? "UPDATE" : "INSERT" },
    });
    if (m.terapkanKeSnapshot) {
      for (const s of await tx.nominatifBulanan.findMany({ where: { pegawaiNip: nip }, select: { id: true, tanggalMulaiKerja: true } })) {
        if (isoTanggal(s.tanggalMulaiKerja) === isoTanggal(tanggal)) continue;
        await tx.nominatifBulanan.update({ where: { id: s.id }, data: { tanggalMulaiKerja: tanggal } });
        await tx.auditLog.create({
          data: { namaTabel: "nominatif_bulanan", idRecord: String(s.id), fieldDiubah: "tanggal_mulai_kerja", nilaiLama: isoTanggal(s.tanggalMulaiKerja), nilaiBaru: isoTanggal(tanggal), diubahOleh: pengguna.nama, diubahPada: sekarang(), aksi: "UPDATE" },
        });
        diubah++;
      }
    }
  });
  return { ok: true, snapshotDiubah: diubah };
}

/** Hapus koreksi: Standarisasi berikutnya kembali memakai TMT dari berkas. Snapshot yang sudah diubah tidak dikembalikan. */
export async function hapusKoreksiTmt(prisma: PrismaClient, id: number, pengguna: Pengguna): Promise<Hasil> {
  const k = await prisma.koreksiTanggalMulaiKerja.findUnique({ where: { id } });
  if (!k) return { ok: false, error: "Koreksi tidak ditemukan." };
  await prisma.$transaction([
    prisma.koreksiTanggalMulaiKerja.delete({ where: { id } }),
    prisma.auditLog.create({
      data: { namaTabel: "koreksi_tanggal_mulai_kerja", idRecord: String(id), fieldDiubah: "tanggal_mulai_kerja", nilaiLama: isoTanggal(k.tanggalMulaiKerja), nilaiBaru: null, diubahOleh: pengguna.nama, diubahPada: sekarang(), aksi: "DELETE" },
    }),
  ]);
  return { ok: true };
}
