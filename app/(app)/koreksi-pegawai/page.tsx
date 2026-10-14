import { prisma } from "@/lib/db";
import { daftarKoreksiTmt } from "@/lib/koreksi/tanggalMulaiKerja";

import { FormTambahKoreksi, TombolHapusKoreksi } from "./FormKoreksi";

export const metadata = { title: "Koreksi Pegawai — KDS Terpadu" };

const tanggal = (d: Date) => new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" }).format(d);

export default async function KoreksiPegawaiPage() {
  const daftar = await daftarKoreksiTmt(prisma);
  const nama = new Map((await prisma.nominatifBulanan.findMany({ where: { pegawaiNip: { in: daftar.map((k) => k.nip) } }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }], distinct: ["pegawaiNip"], select: { pegawaiNip: true, nama: true } })).map((n) => [n.pegawaiNip, n.nama]));

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Koreksi Pegawai</h1>
        <p className="text-sm text-slate-500">
          Tanggal mulai kerja (TMT) yang benar menurut Anda tetapi berbeda dari berkas SIMPEGA. Setiap Standarisasi memakai tanggal ini untuk NIP tersebut, jadi koreksi manual tidak tertimpa lagi.
        </p>
      </div>

      <FormTambahKoreksi />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Koreksi yang berlaku</h2>
        {daftar.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada koreksi.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">NIP</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">TMT benar</th>
                  <th className="px-4 py-3">Alasan</th>
                  <th className="px-4 py-3">Dicatat oleh</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {daftar.map((k) => (
                  <tr key={k.id}>
                    <td className="px-4 py-3 font-mono text-xs">{k.nip}</td>
                    <td className="px-4 py-3">{nama.get(k.nip) ?? "-"}</td>
                    <td className="px-4 py-3 font-medium">{tanggal(k.tanggalMulaiKerja)}</td>
                    <td className="px-4 py-3 text-slate-600">{k.alasan}</td>
                    <td className="px-4 py-3 text-slate-500">{k.dibuatOlehNama}</td>
                    <td className="px-4 py-3 text-right"><TombolHapusKoreksi id={k.id} nip={k.nip} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
