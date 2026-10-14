/**
 * Mengurai dan memvalidasi formulir "Selesaikan baris" (layar Review) menjadi masukan `selesaikanBaris`.
 * Port dari aksi resolveBarisBermasalah KDS1; dipisah dari aksi server supaya bisa dites tanpa sesi login.
 */
import type { PrismaClient } from "@prisma/client";

import type { JabatanTambahanSlot, ResolvedNominatif } from "@/lib/domain/classify";

import type { IngatFlags } from "./resolve";

type Kelompok = "Dosen" | "Tendik" | "Akademisi Luar UM";
export type HasilUrai = { ok: false; error: string } | { ok: true; kelompok: Kelompok; data: ResolvedNominatif; ingat: IngatFlags };

function tanggal(v: FormDataEntryValue | null): Date | null {
  if (typeof v !== "string" || !v) return null;
  // Isian <input type="date"> berbentuk yyyy-mm-dd: dibaca sebagai UTC supaya tidak bergeser sehari (sama dengan pembaca berkas).
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function slot(roleKode: string, targetKode: string, status: string): JabatanTambahanSlot {
  const [tipe, id] = targetKode.split(":");
  return { jabatanTambahanRoleKode: roleKode, unitAsalKode: tipe === "UNIT" ? id : null, programStudiKode: tipe === "PRODI" ? id : null, statusPengangkatan: status };
}

export async function uraiFormResolve(prisma: PrismaClient, f: FormData): Promise<HasilUrai> {
  const k = f.get("kelompok");
  if (k !== "Dosen" && k !== "Tendik" && k !== "Akademisi Luar UM") return { ok: false, error: "Kelompok pegawai wajib dipilih." };
  const kelompok: Kelompok = k;

  const nama = teks(f, "nama");
  const jk = f.get("jenisKelamin");
  if (jk !== "L" && jk !== "P") return { ok: false, error: "Jenis kelamin wajib L/P." };
  const tanggalMulaiKerja = tanggal(f.get("tanggalMulaiKerja"));
  const statusKepegawaianKode = teks(f, "statusKepegawaianKode");
  const unitAsalKode = teks(f, "unitAsalKode");
  const kategori = teks(f, "kategoriAkademisiLuarKode") || null;
  const jabatanPilihan = teks(f, "jabatanPilihan");

  if (!nama) return { ok: false, error: "Nama wajib diisi." };
  if (!tanggalMulaiKerja) return { ok: false, error: "Tanggal mulai kerja (TMT) tidak valid." };
  // Akademisi Luar UM tidak punya kolom status di formulir (otomatis PTT); wajib hanya untuk Dosen/Tendik.
  if (kelompok !== "Akademisi Luar UM" && !statusKepegawaianKode) return { ok: false, error: "Status kepegawaian wajib dipilih." };
  if (!unitAsalKode) return { ok: false, error: "Unit kerja wajib dipilih." };
  if (kelompok === "Akademisi Luar UM" && !kategori) return { ok: false, error: "Kategori Akademisi Luar wajib dipilih untuk kelompok Akademisi Luar UM." };

  let dosen: string | null = null;
  let tendik: string | null = null;
  let umum: string | null = null;
  if (jabatanPilihan) {
    const [tipe, kode] = jabatanPilihan.split(":");
    if (tipe === "DOSEN") dosen = kode;
    else if (tipe === "TENDIK") tendik = kode;
    else if (tipe === "UMUM") umum = kode;
  } else if (kelompok !== "Akademisi Luar UM") {
    return { ok: false, error: "Jabatan fungsional/fungsi wajib dipilih." };
  }

  const jabatanTambahan: JabatanTambahanSlot[] = [];
  if (kelompok !== "Akademisi Luar UM" && f.get("adaJabatanTambahan") === "on") {
    const role = teks(f, "jabatanTambahanRoleKode");
    const target = teks(f, "jabatanTambahanTargetKode");
    const status = teks(f, "statusPengangkatan");
    if (!role || !target || !status) return { ok: false, error: "Jabatan Tambahan dicentang tapi role/unit-prodi/status pengangkatan belum lengkap dipilih." };
    jabatanTambahan.push(slot(role, target, status));
    // Slot 2 dan 3 hanya berarti bila slot sebelumnya dicentang juga.
    for (const [n, namaSlot, centang] of [[2, "Kedua", "adaJabatanTambahanKedua"], [3, "Ketiga", "adaJabatanTambahanKetiga"]] as const) {
      if (f.get(centang) !== "on") break;
      const r = teks(f, `jabatanTambahanRoleKode${n}`);
      const t = teks(f, `jabatanTambahanTargetKode${n}`);
      const s = teks(f, `statusPengangkatan${n}`);
      if (!r || !t || !s) return { ok: false, error: `Jabatan Tambahan ${namaSlot} dicentang tapi role/unit-prodi/status pengangkatan belum lengkap dipilih.` };
      jabatanTambahan.push(slot(r, t, s));
    }
  }

  const jenisPegawai = await prisma.jenisPegawai.findFirst({ where: { nama: kelompok } });
  if (!jenisPegawai) return { ok: false, error: `Master Jenis Pegawai untuk "${kelompok}" tidak ditemukan.` };

  const akl = kelompok === "Akademisi Luar UM";
  const data: ResolvedNominatif = {
    nama,
    jenisKelamin: jk,
    tanggalLahir: tanggal(f.get("tanggalLahir")),
    tanggalMulaiKerja,
    pendidikanTerakhir: teks(f, "pendidikanTerakhir") || null,
    jenisPegawaiKode: jenisPegawai.kode,
    statusKepegawaianKode: akl ? "PTT" : statusKepegawaianKode,
    golonganKode: akl ? null : teks(f, "golonganKode") || null,
    jabatanFungsionalDosenKode: dosen,
    jabatanFungsionalTendikKode: tendik,
    jabatanFungsiUmumKode: umum,
    kategoriAkademisiLuarKode: akl ? kategori : null,
    unitAsalKode,
    jabatanTambahan,
  };
  const ingat: IngatFlags = {
    klasifikasi: f.get("ingatKlasifikasi") === "on",
    kategoriAkademisiLuar: f.get("ingatKategori") === "on",
    statusKepegawaian: f.get("ingatStatus") === "on",
    golongan: f.get("ingatGolongan") === "on",
    jabatan: f.get("ingatJabatan") === "on",
    unitKerja: f.get("ingatUnit") === "on",
    jabatanTambahan: f.get("ingatJabatanTambahan") === "on",
  };
  return { ok: true, kelompok, data, ingat };
}
