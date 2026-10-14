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
});
