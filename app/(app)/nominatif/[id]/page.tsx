import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { detailNominatif } from "@/lib/laporan/nominatif";

function Kartu({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold uppercase text-slate-500">{judul}</h3>
      {children}
    </section>
  );
}

function Isian({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export default async function DetailNominatifPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const d = await detailNominatif(prisma, Number(id));
  if (!d) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {d.nama} <span className="font-normal text-slate-400">({d.nip})</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Snapshot bulan {d.periodeLabel}</p>
      </div>

      <Kartu judul="Data Diri">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Isian label="Jenis Kelamin">{d.jenisKelamin}</Isian>
          <Isian label="Tanggal Lahir">{d.tanggalLahir}</Isian>
          <Isian label="Pendidikan Terakhir">{d.pendidikan}</Isian>
          <Isian label="Tanggal Mulai Kerja">{d.tmt}</Isian>
          <Isian label="Unit Kerja">
            {d.unit} <span className="text-slate-400">({d.unitInduk})</span>
          </Isian>
        </dl>
      </Kartu>

      <Kartu judul="Kepegawaian (snapshot bulan ini)">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Isian label="Jenis Pegawai">{d.jenisPegawai}</Isian>
          <Isian label="Status Kepegawaian">{d.status}</Isian>
          <Isian label="Golongan">{d.golongan}</Isian>
          {d.jabatan.map(([label, nilai]) => (
            <Isian key={label} label={label}>
              {nilai}
            </Isian>
          ))}
          <Isian label="Dasar Remunerasi">
            {d.dasarRemunerasi ? (
              <>
                {d.dasarRemunerasi.nama}{" "}
                <span className="text-xs text-slate-400">(dari {d.dasarRemunerasi.sumber})</span>
              </>
            ) : (
              <span className="text-slate-400">-</span>
            )}
          </Isian>
        </dl>
      </Kartu>

      <Kartu judul="Jabatan Tambahan (bulan ini)">
        {d.jabatanTambahan.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada jabatan tambahan bulan ini.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">Role</th>
                <th className="py-2">Unit / Prodi</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.jabatanTambahan.map((jt, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{jt.role}</td>
                  <td className="py-2">{jt.tempat}</td>
                  <td className="py-2">{jt.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Kartu>

    </div>
  );
}
