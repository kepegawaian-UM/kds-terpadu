import { DaftarKoreksi, type BarisDaftarKoreksi } from "@/components/koreksi/DaftarKoreksi";
import { FormKoreksiRekap } from "@/components/koreksi/FormKoreksiRekap";
import { ImporKoreksi } from "@/components/koreksi/ImporKoreksi";
import { TerapkanUlang } from "@/components/koreksi/TerapkanUlang";
import { prisma } from "@/lib/db";
import { komponenTersedia } from "@/lib/koreksi/layanan";
import { bulanTahunSekarang } from "@/lib/laporan/periode";

export const maxDuration = 300;

const teksTanggal = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}` : null);
const waktuWib = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KoreksiRekapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [bulanIni, tahunIni] = bulanTahunSekarang(new Date());
  const [komponen, koreksi] = await Promise.all([komponenTersedia(prisma), prisma.koreksiRekap.findMany({ orderBy: { id: "desc" } })]);

  // nama dari snapshot Nominatif terbaru per NIP (KDS2: pluck terakhir menimpa)
  const nips = [...new Set(koreksi.map((k) => k.nip))];
  const nama = new Map<string, string>();
  if (nips.length > 0) {
    for (const n of await prisma.nominatifBulanan.findMany({ where: { pegawaiNip: { in: nips } }, orderBy: [{ tahun: "asc" }, { bulan: "asc" }], select: { pegawaiNip: true, nama: true } })) nama.set(n.pegawaiNip, n.nama);
  }

  const baris: BarisDaftarKoreksi[] = koreksi.map((k) => ({
    id: k.id, nip: k.nip, nama: nama.get(k.nip) ?? null, dari: k.dariKomponen, ke: k.keKomponen, jenis: k.jenis, jumlahHari: k.jumlahHari, bulan: k.bulan, tahun: k.tahun,
    mulai: teksTanggal(k.tanggalMulai), selesai: teksTanggal(k.tanggalSelesai), alasan: k.alasan, sumber: k.sumber, dibuatPada: waktuWib(k.dibuatPada), dibuatOleh: k.dibuatOleh, dibatalkan: k.dibatalkanPada !== null,
  }));

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
        <p className="text-sm text-slate-500">
          Koreksi manual absensi per pegawai yang tetap berlaku walau bulan itu di-upload ulang (mis. TK yang sebenarnya Tugas Belajar).
        </p>
      </div>
      <FormKoreksiRekap komponen={komponen} awal={awal} />
      <ImporKoreksi />
      <TerapkanUlang bulanAwal={bulanIni} tahunAwal={tahunIni} />
      <DaftarKoreksi baris={baris} />
    </div>
  );
}
