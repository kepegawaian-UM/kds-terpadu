import Link from "next/link";
import { notFound } from "next/navigation";

import { TombolHapus } from "@/components/standarisasi/TombolTindakan";
import { ALASAN_LABEL, type AlasanBarisBermasalah } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { namaBulan } from "@/lib/laporan/periode";

import { hapusPegawaiBulanAksi } from "../actions";


const waktuWib = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export default async function DetailStandarisasiPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const batch = await prisma.uploadBatch.findFirst({ where: { id: Number(id), jenis: "standarisasi_nominatif" } });
  if (!batch || !batch.bulan || !batch.tahun) notFound();
  const kataKunci = ((await searchParams).q ?? "").trim().slice(0, 100);

  const [rincian, hasil] = await Promise.all([
    prisma.barisBermasalah.groupBy({ by: ["alasanUtama"], where: { uploadBatchId: batch.id, status: "Menunggu" }, _count: { _all: true }, orderBy: { _count: { alasanUtama: "desc" } } }),
    kataKunci
      ? prisma.nominatifBulanan.findMany({
          where: { uploadBatchId: batch.id, OR: [{ pegawaiNip: { contains: kataKunci } }, { nama: { contains: kataKunci, mode: "insensitive" } }] },
          orderBy: { nama: "asc" },
          take: 20,
          select: { id: true, pegawaiNip: true, nama: true },
        })
      : Promise.resolve([]),
  ]);
  const sisaMenunggu = rincian.reduce((j, r) => j + r._count._all, 0);
  const peta = (batch.petaKolomTerdeteksi ?? null) as Record<string, number | null> | null;
  const periode = `${namaBulan(batch.bulan)} ${batch.tahun}`;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <p className="text-sm"><Link href="/standarisasi" className="text-blue-700 underline">← Standarisasi</Link></p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Hasil Standarisasi — {periode}</h1>
        <p className="text-sm text-slate-500">
          {batch.namaFileAsli} · diunggah {batch.diunggahOlehNama}, {waktuWib(batch.diunggahPada)} WIB · status: <b>{batch.status === "MenungguReview" ? "Menunggu review" : batch.status}</b>
        </p>
      </div>

      {batch.status === "Dibatalkan" && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Batch ini sudah digantikan oleh unggahan lain untuk bulan yang sama; datanya tidak lagi berlaku.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Kartu judul="Total Baris" nilai={batch.jumlahBarisTotal} />
        <Kartu judul="Berhasil" nilai={batch.jumlahBerhasil} kelas="text-emerald-700" />
        <Kartu judul="Perlu Review" nilai={sisaMenunggu} kelas="text-amber-700" />
      </div>

      {sisaMenunggu > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Rincian baris yang perlu direview:</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {rincian.map((r) => (
              <li key={r.alasanUtama}>
                {r._count._all} baris: {ALASAN_LABEL[r.alasanUtama as AlasanBarisBermasalah] ?? r.alasanUtama}
              </li>
            ))}
          </ul>
          <Link href={`/standarisasi/${batch.id}/review`} className="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            Selesaikan Review
          </Link>
        </div>
      ) : (
        batch.status !== "Dibatalkan" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Semua baris sudah selesai diproses. Hasilnya sudah menjadi snapshot Nominatif {periode}.{" "}
            <Link href={`/nominatif?bulan=${batch.bulan}&tahun=${batch.tahun}`} className="underline">Lihat Nominatif</Link>
          </div>
        )
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Cari dan Kelola Pegawai (bulan ini)</p>
        <form method="GET" className="mt-3 flex gap-2">
          <input type="text" name="q" defaultValue={kataKunci} placeholder="NIP atau nama…" aria-label="Cari NIP atau nama" className="block w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter">Cari</button>
        </form>
        {kataKunci && (
          <div className="mt-4 overflow-x-auto">
            {hasil.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada pegawai yang cocok dengan &quot;{kataKunci}&quot; di bulan ini.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">NIP</th>
                    <th className="py-2 pr-3">Nama</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {hasil.map((n) => (
                    <tr key={n.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono text-xs">{n.pegawaiNip}</td>
                      <td className="py-2 pr-3">{n.nama}</td>
                      <td className="py-2 text-right">
                        <TombolHapus
                          aksi={hapusPegawaiBulanAksi.bind(null, batch.id, n.id)}
                          tanya={`Hapus "${n.nama}" dari ${periode}? Tindakan ini tidak bisa dibatalkan.`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {peta && (
        <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Peta kolom terdeteksi di berkas</summary>
          <table className="mt-3 w-full text-left text-xs">
            <tbody>
              {Object.entries(peta).map(([k, v]) => (
                <tr key={k} className="border-b border-slate-100">
                  <td className="py-1 pr-3 text-slate-600">{k}</td>
                  <td className={`py-1 ${v === null ? "text-red-600" : "text-slate-900"}`}>{v === null ? "tidak ditemukan" : `kolom ke-${v}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function Kartu({ judul, nilai, kelas = "text-slate-900" }: { judul: string; nilai: number; kelas?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{judul}</p>
      <p className={`mt-1 text-2xl font-semibold ${kelas}`}>{nilai.toLocaleString("id-ID")}</p>
    </div>
  );
}
