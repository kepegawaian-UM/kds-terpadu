import { FormTambahPegawai } from "@/components/nominatif/FormTambahPegawai";
import { prisma } from "@/lib/db";
import { bulanTahunSekarang, namaBulan } from "@/lib/laporan/periode";


export default async function TambahPegawaiPage() {
  const [bulan, tahun] = bulanTahunSekarang(new Date());
  const [jenis, status, golongan, dosen, tendik, umum, akl, unit] = await Promise.all([
    prisma.jenisPegawai.findMany({ orderBy: { nama: "asc" } }),
    prisma.statusKepegawaian.findMany({ orderBy: { nama: "asc" } }),
    prisma.golongan.findMany({ orderBy: { kode: "asc" } }),
    prisma.jabatanFungsionalDosen.findMany({ orderBy: { urutanJenjang: "asc" } }),
    prisma.jabatanFungsionalTendik.findMany({ orderBy: [{ jabatanPokok: "asc" }, { jenjang: "asc" }] }),
    prisma.jabatanFungsiUmumPelaksana.findMany({ orderBy: { nama: "asc" } }),
    prisma.kategoriAkademisiLuar.findMany({ orderBy: { nama: "asc" } }),
    prisma.unitAsal.findMany({ orderBy: { nama: "asc" } }),
  ]);
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tambah Pegawai (Manual)</h1>
        <p className="text-sm text-slate-500">Menyisipkan langsung ke snapshot Nominatif bulan berjalan, untuk kasus mendesak.</p>
      </div>
      <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Untuk pegawai baru sebelum berkas Nominatif Bulanan resmi siap. Data masuk sebagai snapshot bulan berjalan (<b>{namaBulan(bulan)} {tahun}</b>).
        Bila berkas resmi bulan ini nanti diunggah, barisnya akan tertimpa. Penambahan ini tercatat di audit log.
      </p>
      <FormTambahPegawai
        opsi={{
          jenis: jenis.map((x) => ({ kode: x.kode, label: x.nama })),
          status: status.map((x) => ({ kode: x.kode, label: `${x.nama} (${x.kategori})` })),
          golongan: golongan.map((x) => ({ kode: x.kode, label: x.kode })),
          dosen: dosen.map((x) => ({ kode: x.kode, label: x.nama })),
          tendik: tendik.map((x) => ({ kode: x.kode, label: `${x.jabatanPokok} ${x.jenjang}` })),
          umum: umum.map((x) => ({ kode: x.kode, label: x.nama })),
          akl: akl.map((x) => ({ kode: x.kode, label: x.nama })),
          unit: unit.map((x) => ({ kode: x.kode, label: x.nama })),
        }}
      />
    </div>
  );
}
