/**
 * Perencanaan koreksi riwayat golongan Non-ASN (keputusan pengguna 14 Okt 2026): golongan di KDS2 salah (satu tingkat lebih rendah atau kosong),
 * sedangkan riwayat KDS1 cocok dengan SIMPEGA. Fungsi murni: menerima baris KDS1 dan baris target, mengembalikan rencana perubahan tanpa menulis.
 * Aturan hati-hati: hanya baris Non-ASN, hanya bila status kepegawaian di kedua sisi SAMA (golongan mengikuti status), hanya bila nilai KDS1 ada
 * dan sah di master Golongan; selain itu dilewati dan dihitung per alasan, bukan ditebak.
 */

export type BarisKds1 = { nip: string; bulan: number; tahun: number; status: string; golongan: string | null };
export type BarisTarget = { id: number; nip: string; bulan: number; tahun: number; status: string; golongan: string | null };

export type Perubahan = { id: number; bulan: number; tahun: number; lama: string | null; baru: string };
export type RencanaGolongan = {
  perubahan: Perubahan[];
  /** baris target yang sudah sama dengan KDS1 */
  sudahSama: number;
  dilewati: Map<string, number>;
  perBulan: Map<string, { diubah: number; kosongMenjadiIsi: number }>;
  pasangan: Map<string, number>;
};

const kunciBulan = (tahun: number, bulan: number) => `${tahun}-${String(bulan).padStart(2, "0")}`;

export function rencanakanKoreksiGolongan(
  kds1: BarisKds1[],
  target: BarisTarget[],
  ctx: { kategoriStatus: Map<string, string>; golonganMaster: Set<string> },
): RencanaGolongan {
  const sumber = new Map(kds1.map((r) => [`${r.tahun}-${r.bulan}-${r.nip}`, r]));
  const hasil: RencanaGolongan = { perubahan: [], sudahSama: 0, dilewati: new Map(), perBulan: new Map(), pasangan: new Map() };
  const lewati = (alasan: string) => hasil.dilewati.set(alasan, (hasil.dilewati.get(alasan) ?? 0) + 1);

  for (const t of target) {
    if (ctx.kategoriStatus.get(t.status) !== "Non-ASN") continue; // ASN dan Akademisi Luar tidak disentuh
    const s = sumber.get(`${t.tahun}-${t.bulan}-${t.nip}`);
    if (!s) {
      lewati("tidak ada di KDS1 untuk bulan itu");
      continue;
    }
    if ((s.golongan ?? null) === (t.golongan ?? null)) {
      hasil.sudahSama++;
      continue;
    }
    if (s.status !== t.status) {
      lewati("status kepegawaian beda antara KDS1 dan target");
      continue;
    }
    if (s.golongan === null || s.golongan.trim() === "") {
      lewati("golongan KDS1 kosong (target tidak dikosongkan)");
      continue;
    }
    if (!ctx.golonganMaster.has(s.golongan)) {
      lewati("golongan KDS1 tidak ada di master");
      continue;
    }
    hasil.perubahan.push({ id: t.id, bulan: t.bulan, tahun: t.tahun, lama: t.golongan ?? null, baru: s.golongan });
    const b = hasil.perBulan.get(kunciBulan(t.tahun, t.bulan)) ?? { diubah: 0, kosongMenjadiIsi: 0 };
    b.diubah++;
    if (t.golongan === null) b.kosongMenjadiIsi++;
    hasil.perBulan.set(kunciBulan(t.tahun, t.bulan), b);
    const p = `${t.golongan ?? "kosong"} -> ${s.golongan}`;
    hasil.pasangan.set(p, (hasil.pasangan.get(p) ?? 0) + 1);
  }
  return hasil;
}
