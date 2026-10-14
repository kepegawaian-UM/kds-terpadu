import Link from "next/link";

import { GrafikBatang } from "@/components/dashboard/GrafikBatang";
import { GrafikTren } from "@/components/dashboard/GrafikTren";
import { Ikon, KartuKpi } from "@/components/dashboard/KartuKpi";
import { TabBertingkat, TabUtama } from "@/components/dashboard/TabDashboard";
import { prisma } from "@/lib/db";
import { dataDashboard } from "@/lib/laporan/dashboard";
import { tahunNominatif } from "@/lib/laporan/nominatif";
import { NAMA_BULAN, namaBulan } from "@/lib/laporan/periode";

export const metadata = { title: "Ringkasan — KDS Terpadu" };

const HIJAU = "#1d443a";
const EMAS = "#d1ab68";
const MERAH = "#dc2626";

const JENIS = [
  { kode: "DSN", label: "Dosen", judulUtama: "Jabatan fungsional" },
  { kode: "TDK", label: "Tendik", judulUtama: "Status kepegawaian" },
  { kode: "AKL", label: "Akademisi Luar UM", judulUtama: "Kategori akademisi luar" },
] as const;

const kotak = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

function Lencana({ sudah }: { sudah: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${
        sudah ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {sudah ? "Sudah" : "Belum"}
    </span>
  );
}

export default async function RingkasanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [d, daftarTahun] = await Promise.all([dataDashboard(prisma, sp), tahunNominatif(prisma)]);
  const tahunPilihan = (t: number | null) => [...new Set([...daftarTahun, ...(t ? [t] : [])])].sort((a, b) => b - a);
  const tabAwal = sp.tab === "kinerja" ? "kinerja" : "pegawai";
  const kinerja = d.dashboardKinerja;

  const kartuAtas: { label: string; nilai: number; ikon: string; catatan?: string }[] = [
    { label: "Total Dosen", nilai: d.jumlahPerJenis.DSN, ikon: "school" },
    { label: "Total Tendik", nilai: d.jumlahPerJenis.TDK, ikon: "briefcase" },
    {
      label: "Total Akademisi Luar UM",
      nilai: d.jumlahPerJenis.AKL,
      ikon: "globe",
      // Perilaku KDS2 yang sengaja dipertahankan (paritas): kartu memakai semua baris snapshot, grafik tidak.
      catatan: 'Semua baris snapshot. Grafik "Kategori akademisi luar" tidak menghitung yang berunit "Unit Kerja Belum Diketahui", jadi jumlahnya lebih kecil.',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ringkasan</h1>
        <p className="text-sm text-slate-500">
          {d.bulanTerbaru && d.tahunTerbaru ? (
            <>
              Jumlah pegawai berdasarkan snapshot Nominatif terakhir:{" "}
              <strong>
                {namaBulan(d.bulanTerbaru)} {d.tahunTerbaru}
              </strong>
            </>
          ) : (
            "Belum ada snapshot Nominatif yang diupload."
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kartuAtas.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-sidebar">
              <Ikon nama={k.ikon} kelas="h-5 w-5" />
            </div>
            <div className="text-sm text-slate-500">{k.label}</div>
            <div className="mt-1 text-3xl font-bold text-sidebar">{k.nilai.toLocaleString("id-ID")}</div>
            {k.catatan && <p className="mt-2 text-xs leading-snug text-slate-500">{k.catatan}</p>}
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Ikon nama="check" kelas="h-5 w-5" />
          </div>
          <div className="mb-2 text-sm text-slate-500">Status Upload Bulan Ini</div>
          {[
            { nama: "Nominatif", sudah: d.nominatifSudahUpload, waktu: d.nominatifTerakhirDiupload },
            { nama: "Rekap Kehadiran", sudah: d.rekapSudahUpload, waktu: d.rekapTerakhirDiupload },
          ].map((u) => (
            <div key={u.nama} className="mb-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{u.nama}</span>
                <Lencana sudah={u.sudah} />
              </div>
              {u.waktu && <div className="text-xs text-slate-400">{u.waktu}</div>}
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase text-slate-500">Pintasan</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/nominatif" className="text-accent-green underline">
            Detail Pegawai
          </Link>
          {["Upload Nominatif Bulanan", "Upload Rekap Kehadiran", "+ Tambah Pegawai"].map((t) => (
            <span key={t} className="cursor-not-allowed text-slate-400" title="Tersedia di tahap F4">
              {t}
            </span>
          ))}
        </div>
      </section>

      <TabUtama
        tabAwal={tabAwal}
        panelPegawai={
          d.dashboardPegawai && d.bulanPegawai && d.tahunPegawai ? (
            <div className="space-y-4">
              <form method="get" className="tanpa-cetak flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
                <input type="hidden" name="tab" value="pegawai" />
                <input type="hidden" name="tahun_kinerja" value={d.tahunKinerja} />
                <label className="text-xs font-medium text-slate-600">
                  Bulan
                  <select name="bulan_pegawai" defaultValue={d.bulanPegawai} className={`${kotak} mt-1 block`}>
                    {NAMA_BULAN.slice(1).map((n, i) => (
                      <option key={n} value={i + 1}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Tahun
                  <select name="tahun_pegawai" defaultValue={d.tahunPegawai} className={`${kotak} mt-1 block`}>
                    {tahunPilihan(d.tahunPegawai).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-md bg-sidebar px-4 py-1.5 text-sm font-medium text-white hover:bg-sidebar-lighter">
                  Terapkan
                </button>
              </form>

              <TabBertingkat
                tab={JENIS.map((j) => {
                  const x = d.dashboardPegawai![j.kode];
                  return {
                    kode: j.kode,
                    label: j.label,
                    isi: (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {x.kpi.map((k) => (
                            <KartuKpi key={k.label} kpi={k} />
                          ))}
                        </div>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <GrafikBatang judul={j.judulUtama} labels={x.chartDistribusiUtama.labels} data={x.chartDistribusiUtama.data} warna={HIJAU} />
                          <GrafikBatang judul="Sebaran unit induk (6 terbesar)" labels={x.chartSebaranUnit.labels} data={x.chartSebaranUnit.data} warna={EMAS} />
                          <GrafikBatang judul="Golongan" labels={x.chartGolongan.labels} data={x.chartGolongan.data} warna={HIJAU} />
                          <GrafikBatang judul="Pendidikan terakhir" labels={x.chartPendidikan.labels} data={x.chartPendidikan.data} warna={EMAS} />
                        </div>
                      </>
                    ),
                  };
                })}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Belum ada snapshot Nominatif yang diupload.</div>
          )
        }
        panelKinerja={
          <div className="space-y-4">
            <form method="get" className="tanpa-cetak flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <input type="hidden" name="tab" value="kinerja" />
              {d.bulanPegawai && d.tahunPegawai && (
                <>
                  <input type="hidden" name="bulan_pegawai" value={d.bulanPegawai} />
                  <input type="hidden" name="tahun_pegawai" value={d.tahunPegawai} />
                </>
              )}
              <label className="text-xs font-medium text-slate-600">
                Tahun
                <select name="tahun_kinerja" defaultValue={d.tahunKinerja} className={`${kotak} mt-1 block`}>
                  {tahunPilihan(d.tahunKinerja).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-md bg-sidebar px-4 py-1.5 text-sm font-medium text-white hover:bg-sidebar-lighter">
                Terapkan
              </button>
            </form>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kinerja.kpi.map((k) => (
                <KartuKpi key={k.label} kpi={k} />
              ))}
            </div>
            <GrafikBatang judul={`Total per kategori izin (tahun ${d.tahunKinerja})`} labels={kinerja.chartKategoriIzin.labels} data={kinerja.chartKategoriIzin.data} warna={HIJAU} tinggi={320} />
            <GrafikBatang judul="Unit dengan Tanpa Keterangan (TK) tertinggi" labels={kinerja.chartUnitTk.labels} data={kinerja.chartUnitTk.data} warna={MERAH} />
            <GrafikTren bulanLabel={kinerja.chartTren.bulanLabel} series={kinerja.chartTren.series} />
            <p className="text-xs text-slate-500">
              Dashboard Kinerja hanya menghitung Dosen + Tendik yang masih aktif (ada di snapshot Nominatif bulan terbaru tahun itu);
              Akademisi Luar UM tidak masuk Rekap Kehadiran.
            </p>
          </div>
        }
      />
    </div>
  );
}
