import { DaftarKoreksi, type BarisDaftarKoreksi } from "@/components/koreksi/DaftarKoreksi";
import { FormKoreksiRekap } from "@/components/koreksi/FormKoreksiRekap";
import { ImporKoreksi } from "@/components/koreksi/ImporKoreksi";
import { TerapkanUlang } from "@/components/koreksi/TerapkanUlang";
import { FormOtomatis } from "@/components/laporan/FormOtomatis";
import { tombolSekunder } from "@/components/laporan/KepalaHalaman";
import { prisma } from "@/lib/db";
import { komponenTersedia, tujuanTersedia } from "@/lib/koreksi/layanan";
import { ambilKoreksi, angkaDalamRentang, teksTanggal } from "@/lib/koreksi/laporan";
import { bulanTahunSekarang, NAMA_BULAN } from "@/lib/laporan/periode";

export const maxDuration = 300;

const waktuWib = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KoreksiRekapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [bulanIni, tahunIni] = bulanTahunSekarang(new Date());
  // filter daftar (nama parameter berawalan f_ agar tidak bentrok dengan nip/bulan/tahun yang mengisi formulir dari tautan laporan)
  const fTahun = angkaDalamRentang(satu(sp.f_tahun), 2000, 2100);
  const fBulan = fTahun ? angkaDalamRentang(satu(sp.f_bulan), 1, 12) : null;
  const fUnit = (satu(sp.f_unit) ?? "").trim();
  const fCari = (satu(sp.f_q) ?? "").trim().slice(0, 100);
  const [komponen, tujuan, koreksi, semuaKoreksi, daftarUnitInduk] = await Promise.all([
    komponenTersedia(prisma),
    tujuanTersedia(prisma),
    ambilKoreksi(prisma, { tahun: fTahun, bulan: fBulan, unitIndukKode: fUnit || null, cari: fCari }),
    prisma.koreksiRekap.findMany({ select: { tahun: true, tanggalMulai: true, tanggalSelesai: true } }),
    prisma.unitInduk.findMany({ orderBy: { nama: "asc" }, select: { kode: true, nama: true } }),
  ]);
  const daftarTahun = [
    ...new Set([tahunIni, ...semuaKoreksi.flatMap((k) => [k.tahun, k.tanggalMulai.getUTCFullYear(), k.tanggalSelesai?.getUTCFullYear()]).filter((t): t is number => typeof t === "number")]),
  ].sort((a, b) => b - a);

  const baris: BarisDaftarKoreksi[] = koreksi.map((k) => ({
    id: k.id, nip: k.nip, nama: k.nama, dari: k.dari, ke: k.ke, jenis: k.jenis, jumlahHari: k.jumlahHari, bulan: k.bulan, tahun: k.tahun,
    mulai: teksTanggal(k.mulai), selesai: teksTanggal(k.selesai), alasan: k.alasan, sumber: k.sumber, dibuatPada: waktuWib(k.dibuatPada), dibuatOleh: k.dibuatOleh, dibatalkan: k.dibatalkan,
  }));
  const kueriUnduh = new URLSearchParams();
  if (fTahun) kueriUnduh.set("f_tahun", String(fTahun));
  if (fBulan) kueriUnduh.set("f_bulan", String(fBulan));
  if (fUnit) kueriUnduh.set("f_unit", fUnit);
  if (fCari) kueriUnduh.set("f_q", fCari);
  const kotak = "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800";

  // tautan "Koreksi" dari laporan mengisi nip/bulan/tahun/jenis lewat query string
  const awal = {
    jenis: satu(sp.jenis) === "angka" ? "angka" : "periode",
    nip: satu(sp.nip) ?? "",
    bulan: satu(sp.bulan) ?? "",
    tahun: satu(sp.tahun) ?? String(tahunIni),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Koreksi Absensi</h1>
      </div>
      <FormKoreksiRekap komponen={komponen} tujuan={tujuan} awal={awal} />
      <ImporKoreksi />
      <TerapkanUlang bulanAwal={bulanIni} tahunAwal={tahunIni} />
      <FormOtomatis>
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          Tahun
          <select name="f_tahun" defaultValue={fTahun ? String(fTahun) : ""} className={kotak}>
            <option value="">Semua</option>
            {daftarTahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          Bulan
          <select name="f_bulan" defaultValue={fBulan ? String(fBulan) : ""} className={kotak}>
            <option value="">Semua</option>
            {NAMA_BULAN.slice(1).map((nama, i) => (
              <option key={nama} value={i + 1}>
                {nama}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          Unit Induk
          <select name="f_unit" defaultValue={fUnit} className={`${kotak} max-w-56`}>
            <option value="">Semua unit induk</option>
            {daftarUnitInduk.map((u) => (
              <option key={u.kode} value={u.kode}>
                {u.nama}
              </option>
            ))}
          </select>
        </label>
        <input type="search" name="f_q" defaultValue={fCari} placeholder="Cari NIP atau nama" aria-label="Cari NIP atau nama" className={`${kotak} w-48`} />
        <a href={`/koreksi-rekap/export${kueriUnduh.size > 0 ? `?${kueriUnduh.toString()}` : ""}`} download className={tombolSekunder}>
          Unduh Excel
        </a>
      </FormOtomatis>
      <DaftarKoreksi baris={baris} />
    </div>
  );
}
