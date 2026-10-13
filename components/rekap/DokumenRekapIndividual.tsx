/**
 * Dokumen resmi Rekap Kehadiran Individual (satu pegawai, satu tahun), siap dicetak/disimpan PDF dari browser. Port dari
 * _dokumen-individual.blade.php + _dokumen-individual-css.blade.php + x-kop-surat (KDS2); isinya mengikuti hasil
 * bangunRekapIndividual (angka sama dengan ekspor Excel). Seperti KDS2, tanda sel hasil koreksi dan keterangan koreksi
 * (tersedia di data laporan) TIDAK dicetak di dokumen resmi ini.
 */
import { KOLOM_INDIVIDUAL, type LaporanIndividual } from "@/lib/laporan/rekapIndividual";

const GAYA = `
.dokumen { background: #fff; color: #000; font-family: Arial, "Liberation Sans", Helvetica, sans-serif; font-size: 10pt; line-height: 1.3;
           width: 210mm; max-width: 100%; margin: 0 auto; padding: 12mm 14mm; border: 1px solid #9ca3af; overflow-x: auto; }
.dokumen * { box-sizing: border-box; }
.dokumen .kop { display: flex; align-items: center; padding-bottom: 6px; border-bottom: 1.5px solid #000; }
.dokumen .kop img { width: 26mm; height: auto; margin-right: 6mm; }
.dokumen .kop .teks { flex: 1; text-align: center; font-size: 10.5pt; line-height: 1.35; padding-right: 14mm; }
.dokumen .kop .induk { font-size: 11pt; }
.dokumen h2.judul { text-align: center; font-size: 11.5pt; margin: 11px 0 9px; letter-spacing: .3px; font-weight: 700; }
.dokumen table.id { border-collapse: collapse; margin: 0 0 9px 1mm; }
.dokumen table.id td { padding: 1px 0; vertical-align: top; font-size: 10pt; border: 0; }
.dokumen table.id td.l { width: 26mm; } .dokumen table.id td.t { width: 4mm; }
.dokumen table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
.dokumen table.data th, .dokumen table.data td { border: .75pt solid #000; text-align: center; padding: 2.6px 1px; font-size: 8.5pt; color: #000; }
.dokumen table.data th { font-weight: 700; background: #e6e6e6; }
.dokumen table.data .kiri { text-align: left; padding-left: 4px; }
.dokumen table.data .it { font-style: italic; }
.dokumen table.data tr.abu td { background: #d9d9d9; }
.dokumen .tebal { font-weight: 700; }
.dokumen col.bln { width: 26mm; } .dokumen col.sg { width: 12mm; } .dokumen col.ms { width: 13mm; } .dokumen col.hd { width: 14mm; }
.dokumen table.ringkas { border-collapse: collapse; margin-top: 9px; width: 100%; }
.dokumen table.ringkas th, .dokumen table.ringkas td { border: .75pt solid #000; padding: 3px 5px; text-align: center; font-size: 9pt; color: #000; }
.dokumen table.ringkas th { background: #e6e6e6; font-weight: 700; }
.dokumen table.ringkas td { font-weight: 700; font-size: 10pt; }
.dokumen .ket { margin-top: 9px; font-size: 8.5pt; }
.dokumen .ket b { font-size: 9pt; }
.dokumen .ket ol { margin: 2px 0 0; padding-left: 15px; list-style: decimal; } .dokumen .ket li { margin-bottom: 2px; }
.dokumen .kaki { margin-top: 14px; border-top: .75pt solid #000; padding-top: 2px; font-size: 7.5pt; display: flex; justify-content: flex-end; }
.dokumen + .dokumen { margin-top: 10mm; }
@page { size: A4 portrait; margin: 12mm 14mm; }
@media print {
  .dokumen { border: 0 !important; width: auto !important; padding: 0 !important; margin: 0 !important; }
  .dokumen + .dokumen { page-break-before: always; break-before: page; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** Gaya dokumen; cukup sekali per halaman. */
export function GayaDokumenIndividual() {
  return <style dangerouslySetInnerHTML={{ __html: GAYA }} />;
}

export function DokumenRekapIndividual({ laporan, tanggalCetak }: { laporan: LaporanIndividual; tanggalCetak: string }) {
  const id = laporan.identitas;
  const tot = laporan.total;
  const baris = Object.entries(laporan.bulan).map(([b, x]) => ({ b: Number(b), x }));

  return (
    <div className="dokumen">
      <div className="kop">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo kop surat untuk cetak; tanpa optimasi gambar */}
        <img src="/images/logo-um.png" alt="Logo Universitas Negeri Malang" />
        <div className="teks">
          <div className="induk">KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI</div>
          <div className="induk">UNIVERSITAS NEGERI MALANG (UM)</div>
          <div>Jalan Semarang 5, Malang 65145</div>
          <div>Telepon: 0341- 551312, Faksimile 0341-551921</div>
          <div>Laman: www.um.ac.id</div>
        </div>
      </div>

      <h2 className="judul">REKAP KEHADIRAN INDIVIDUAL TAHUN {laporan.tahun}</h2>

      <table className="id">
        <tbody>
          <tr><td className="l">Nama</td><td className="t">:</td><td>{id.nama}</td></tr>
          <tr><td className="l">NIP</td><td className="t">:</td><td>{id.nip}</td></tr>
          <tr><td className="l">Jenis / Status</td><td className="t">:</td><td>{id.jenis} / {id.status}</td></tr>
          <tr><td className="l">Gol. / Jabatan</td><td className="t">:</td><td>{id.golongan} / {id.jabatan}</td></tr>
          <tr><td className="l">Unit Kerja</td><td className="t">:</td><td>{id.unit}{id.unitInduk ? `, ${id.unitInduk}` : ""}</td></tr>
          {laporan.statusKeluar && <tr><td className="l">Keterangan</td><td className="t">:</td><td>{laporan.statusKeluar}</td></tr>}
          <tr><td className="l">Tahun</td><td className="t">:</td><td>{laporan.tahun} (data rekap tersedia {laporan.bulanTerekam} dari 12 bulan)</td></tr>
        </tbody>
      </table>

      <table className="data">
        <colgroup>
          <col className="bln" /><col className="sg" /><col className="ms" /><col className="hd" />
          {KOLOM_INDIVIDUAL.map((k) => <col key={k} />)}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className="kiri">Bulan</th><th rowSpan={2}>&Sigma; Hari</th><th rowSpan={2}>Masuk Nyata</th><th rowSpan={2}>Hadir</th>
            <th colSpan={KOLOM_INDIVIDUAL.length}>Ketidakhadiran, Tugas dan Cuti (hari)</th>
          </tr>
          <tr>{KOLOM_INDIVIDUAL.map((k) => <th key={k}>{k}</th>)}</tr>
        </thead>
        <tbody>
          {baris.map(({ b, x }) =>
            !x.ada ? (
              <tr key={b} className="abu"><td className="kiri">{x.nama}</td><td colSpan={3 + KOLOM_INDIVIDUAL.length} className="kiri it">Belum ada rekap kehadiran</td></tr>
            ) : (
              <tr key={b}>
                <td className="kiri">{x.nama}</td><td>{x.sigma}</td><td>{x.masuk}</td><td>{x.persen}</td>
                {KOLOM_INDIVIDUAL.map((k) => {
                  const v = x.nilai[k] ?? 0;
                  return <td key={k} className={v > 0 ? "tebal" : undefined}>{v === 0 ? "-" : v}</td>;
                })}
              </tr>
            ),
          )}
          <tr className="abu tebal">
            <td className="kiri">Jumlah ({laporan.bulanTerekam} bulan)</td>
            <td>{tot.SIGMA_HARI}</td><td>{tot.JUMLAH_MASUK_NYATA}</td><td>{laporan.persenTotal}</td>
            {KOLOM_INDIVIDUAL.map((k) => <td key={k}>{tot[k]}</td>)}
          </tr>
        </tbody>
      </table>

      <table className="ringkas">
        <tbody>
          <tr><th>Hari Kerja</th><th>Masuk Nyata</th><th>Kehadiran</th><th>Tugas Belajar (TB)</th><th>Tanpa Keterangan (TK)</th></tr>
          <tr><td>{tot.SIGMA_HARI}</td><td>{tot.JUMLAH_MASUK_NYATA}</td><td>{laporan.persenTotal}</td><td>{tot.TB}</td><td>{tot.TK}</td></tr>
        </tbody>
      </table>

      <div className="ket">
        <b>Keterangan:</b>
        <ol>
          <li>
            Kode: I = Izin; S = Sakit; SD = Sakit dengan Surat Dokter; TD = Tugas Dinas; TB = Tugas Belajar; TK = Tanpa Keterangan; CTH = Cuti Tahunan; CTM = Cuti Melahirkan;
            CTB = Cuti Besar; CAP = Cuti Alasan Penting; CTLN = Cuti di Luar Tanggungan Negara. &Sigma; Hari = jumlah hari kerja pada bulan tersebut; Hadir = Masuk Nyata &divide; &Sigma; Hari.
          </li>
          <li>TK berarti tidak terdapat rekam presensi pada data sumber dan tidak selalu berarti pegawai tidak hadir; perlu diverifikasi ke unit kerja sebelum diambil kesimpulan.</li>
        </ol>
      </div>

      <div className="kaki">
        <span>Dicetak {tanggalCetak}</span>
      </div>
    </div>
  );
}
