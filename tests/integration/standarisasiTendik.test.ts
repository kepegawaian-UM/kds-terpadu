/**
 * Beda sengaja dari KDS1 (keputusan pengguna 14 Okt 2026): jabatan Tendik tanpa jenjang yang juga ada di Fungsi Umum Pelaksana
 * ("Pelaksana", "Laboran") dicatat sebagai Fungsi Umum, seperti riwayat KDS2. Bukti: berkas SIMPEGA September 2026 (767 + 66 orang).
 * Master dari kds_test (sama dengan master KDS2).
 */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { kunciJabatan, resolveJabatan } from "@/lib/domain/classify";
import { loadMasterCache } from "@/lib/domain/masterCache";
import type { RawNominatifRow } from "@/lib/excel/types";

const ada = Boolean(process.env.TEST_DATABASE_URL);
const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

const baris = (jabatan: string): RawNominatifRow => ({ nip: "198001012005011001", jabatanFungsionalRaw: jabatan } as unknown as RawNominatifRow);
const terdaftar = new Set<string>(["198001012005011001"]);
const barisAg = (jabatan: string, ag: string): RawNominatifRow => ({ ...baris(jabatan), jabatanRemunerasiRaw: ag });

describe.skipIf(!ada)("Jabatan Tendik tanpa jenjang yang sepadan Fungsi Umum", () => {
  it("Pelaksana dan Laboran menjadi Fungsi Umum; jabatan Tendik bernjenjang tidak berubah; Dosen tidak terpengaruh", async () => {
    const master = await loadMasterCache(prisma);
    const umumPelaksana = master.jabatanFungsiUmumPelaksana.find((j) => j.nama === "Pelaksana")!;
    const teknisiLab = master.jabatanFungsiUmumPelaksana.find((j) => j.nama === "Teknisi Laboratorium")!;
    expect(umumPelaksana && teknisiLab).toBeTruthy();

    for (const [mentah, umum] of [["Pelaksana", umumPelaksana], ["pelaksana ", umumPelaksana], ["Laboran", teknisiLab], ["LABORAN", teknisiLab]] as const) {
      expect(resolveJabatan(baris(mentah), master, new Map(), "Tendik", terdaftar), mentah).toEqual({ jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: umum.kode });
    }

    const bernjenjang = master.jabatanFungsionalTendik.find((j) => j.jenjang.trim() !== "-")!;
    const r = resolveJabatan(baris(`${bernjenjang.jabatanPokok} ${bernjenjang.jenjang}`), master, new Map(), "Tendik", terdaftar);
    expect(r).toMatchObject({ jabatanFungsionalTendikKode: bernjenjang.kode, jabatanFungsiUmumKode: null });

    // Dosen yang kebetulan menulis "Pelaksana" tidak diubah oleh aturan ini (dosen punya jalur sendiri)
    expect(resolveJabatan(baris("Pelaksana"), master, new Map(), "Dosen", terdaftar)).not.toMatchObject({ jabatanFungsiUmumKode: umumPelaksana.kode });
  });

  it("pilihan eksplisit admin di Kamus (Jabatan Fungsional Tendik) tetap menang atas aturan ini", async () => {
    const master = await loadMasterCache(prisma);
    const tendikPelaksana = master.jabatanFungsionalTendik.find((j) => j.jabatanPokok.trim().toLowerCase() === "pelaksana" && j.jenjang.trim() === "-")!;
    expect(tendikPelaksana).toBeTruthy();
    const row = baris("Pelaksana");
    const kamus = new Map([[`JabatanFungsionalTendik::${kunciJabatan(row)}`, tendikPelaksana.kode]]);
    expect(resolveJabatan(row, master, kamus, "Tendik", terdaftar)).toMatchObject({ jabatanFungsionalTendikKode: tendikPelaksana.kode, jabatanFungsiUmumKode: null });
  });

  it("Jabatan Remunerasi (AG) menggantikan Jabatan Fungsional yang generik; JF spesifik, struktural, kosong, dan pilihan Kamus tidak berubah; Dosen tidak terpengaruh", async () => {
    const master = await loadMasterCache(prisma);
    const umum = (nama: string) => master.jabatanFungsiUmumPelaksana.find((j) => j.nama === nama)!.kode;
    const hasil = (jf: string, ag: string, kelompok: "Tendik" | "Dosen" = "Tendik", kamus = new Map<string, string>()) => resolveJabatan(barisAg(jf, ag), master, kamus, kelompok, terdaftar);

    // generik "Pelaksana"/"Laboran" -> jabatan spesifik dari AG (termasuk akhiran sampah ## dan huruf kecil)
    for (const [jf, ag, nama] of [["Pelaksana", "Pengolah Data dan Informasi", "Pengolah Data dan Informasi"], ["Pelaksana", "Pengadministrasi Perkantoran", "Pengadministrasi Perkantoran"],
      ["Pelaksana", "Pengelola Layanan Operasional##", "Pengelola Layanan Operasional"], ["Pelaksana", "dokter pertama", "Dokter Pertama"], ["Pelaksana", "Penata Layanan Kesehatan", "Penata Layanan Kesehatan"], ["Laboran", "Teknisi Laboratorium", "Teknisi Laboratorium"]] as const) {
      expect(hasil(jf, ag), `${jf} -> ${ag}`).toEqual({ jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: umum(nama) });
    }
    // AG tidak dikenal master (jabatan struktural / belum ada di master) atau kosong -> perilaku lama (Pelaksana tetap Fungsi Umum "Pelaksana")
    for (const ag of ["Koordinator Tata Usaha, FT", "Kepala Seksi Humas, Direktorat Perencanaan", "", "Belum Diketahui (Perlu Verifikasi Manual)"]) {
      expect(hasil("Pelaksana", ag), ag).toMatchObject({ jabatanFungsiUmumKode: umum("Pelaksana") });
    }
    // JF fungsional spesifik tetap dari JF walau AG berisi nama lain (termasuk yang kebetulan ada di Fungsi Umum)
    const plp = master.jabatanFungsionalTendik.find((j) => j.jabatanPokok === "PLP" && j.jenjang === "Madya")!;
    expect(hasil("PLP Madya", "Pranata Laboratorium Pendidikan Madya")).toMatchObject({ jabatanFungsionalTendikKode: plp.kode, jabatanFungsiUmumKode: null });
    expect(hasil("PLP Madya", "Pengolah Data dan Informasi")).toMatchObject({ jabatanFungsionalTendikKode: plp.kode, jabatanFungsiUmumKode: null });
    // pilihan eksplisit admin di Kamus menang atas AG
    const row = barisAg("Pelaksana", "Pengolah Data dan Informasi");
    const tendikPelaksana = master.jabatanFungsionalTendik.find((j) => j.jabatanPokok === "Pelaksana")!;
    expect(resolveJabatan(row, master, new Map([[`JabatanFungsionalTendik::${kunciJabatan(row)}`, tendikPelaksana.kode]]), "Tendik", terdaftar)).toMatchObject({ jabatanFungsionalTendikKode: tendikPelaksana.kode });
    // JF tidak dikenali: tanpa Kamus AG dipakai; dengan pilihan Kamus (Fungsi Umum) pilihan admin yang menang
    const aneh = barisAg("Jabatan Tidak Dikenal", "Pengolah Data dan Informasi");
    expect(resolveJabatan(aneh, master, new Map(), "Tendik", terdaftar)).toMatchObject({ jabatanFungsiUmumKode: umum("Pengolah Data dan Informasi") });
    expect(resolveJabatan(aneh, master, new Map([[`FungsiUmumPelaksana::${kunciJabatan(aneh)}`, umum("Bendahara Penerimaan")]]), "Tendik", terdaftar)).toMatchObject({ jabatanFungsiUmumKode: umum("Bendahara Penerimaan") });
    // Dosen tidak memakai AG
    expect(hasil("Lektor", "Pengolah Data dan Informasi", "Dosen")).toMatchObject({ jabatanFungsiUmumKode: null });
    // berkas tanpa kolom AG (undefined) berperilaku seperti sebelumnya
    expect(resolveJabatan(baris("Pelaksana"), master, new Map(), "Tendik", terdaftar)).toMatchObject({ jabatanFungsiUmumKode: umum("Pelaksana") });
  });
});
