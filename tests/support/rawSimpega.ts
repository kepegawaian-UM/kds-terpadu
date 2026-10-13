/**
 * Pembangkit berkas mentah SIMPEGA SINTETIS (format baru REKAP_PEGAWAI) untuk tes standarisasi. Nilai diambil dari kosakata master
 * (nama unit, jabatan, status, ...) lalu diganggu acak (salah ketik, kosong, tak dikenal, jabatan tambahan, NIP placeholder,
 * gelar) supaya seluruh cabang klasifikasi terpakai. Setiap sel teks diberi awalan U+200C seperti berkas asli. Tanpa data pegawai asli.
 */
import ExcelJS from "exceljs";

export const KOLOM_RAW = [
  "NIP", "Nama Lengkap (Tanpa Gelar)", "Nama Lengkap (Dengan Gelar)", "Jenis Kelamin", "Agama", "Status Pegawai", "Kelompok Jabatan", "Jenis Pegawai", "Tanggal Masuk", "Golongan",
  "Jabatan Fungsional", "Jabatan Tambahan", "Unit Kerja Jabatan Tambahan", "Jenjang Pendidikan", "Unit Kerja", "Unit Kerja Induk", "Unit Kerja Induk (Level Atas)", "Tanggal Lahir",
  // kolom lain di berkas asli yang tidak dibaca (tidak boleh ikut tersimpan)
  "NIK", "Alamat", "Nomor Rekening",
] as const;

export type Vocab = {
  unit: { nama: string; induk: string }[];
  dosen: string[];
  tendik: string[];
  umum: string[];
  akl: string[];
  status: { nama: string; kode: string; kategori: string }[];
  role: string[];
  prodi: string[];
};

const ZW = String.fromCharCode(0x200c);

export function pembangkit(benih: number) {
  let s = benih;
  const acak = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pilih = <T,>(a: readonly T[]): T => a[Math.floor(acak() * a.length)];
  return { acak, pilih };
}

const GOLONGAN = ["III/a", "III/b", "III/c", "III/d", "IV/a", "IV/b", "IV/c", "II/c", "I/d", "IX", "X"];
const PENDIDIKAN = ["S1", "S2", "S3", "D3", "SMA", "Profesi", "SMP", ""];

/** Mengganggu teks: salah ketik ringan, huruf besar semua, spasi berlebih, atau kosong. */
function ganggu(acak: () => number, t: string): string {
  const r = acak();
  if (r < 0.03) return "";
  if (r < 0.06) return t.toUpperCase();
  if (r < 0.09) return `  ${t}  `;
  if (r < 0.12 && t.length > 4) return t.slice(0, 2) + t.slice(3);
  if (r < 0.14) return `${t} xx`;
  return t;
}

export type OpsiRaw = { vocab: Vocab; bulan: number; tahun: number; jumlah: number; benih: number; awalNip?: number; tanpaPlaceholder?: boolean };

export async function buatBerkasRaw(o: OpsiRaw): Promise<{ buffer: Buffer; nips: string[] }> {
  const { acak, pilih } = pembangkit(o.benih);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Worksheet");
  ws.addRow([...KOLOM_RAW].map((k) => `${ZW}${k}`));
  const nips: string[] = [];
  const bulan2 = String(o.bulan).padStart(2, "0");

  for (let i = 0; i < o.jumlah; i++) {
    const jenis = pilih(["dosen", "dosen", "dosen", "tendik", "tendik", "tendik", "akl", "akl"] as const);
    const unit = pilih(o.vocab.unit);
    const placeholder = jenis === "akl" && !o.tanpaPlaceholder && acak() < 0.4;
    const nip = placeholder
      ? `${o.tahun}${bulan2}${o.tahun}${bulan2}${String(100000 + (o.awalNip ?? 0) + i).slice(-10)}`
      : `19${String(70 + Math.floor(acak() * 30))}0${1 + Math.floor(acak() * 9)}1520${String(10 + Math.floor(acak() * 14))}0${1 + Math.floor(acak() * 2)}${String(1000 + (o.awalNip ?? 0) + i).slice(-3)}`
          .padEnd(18, "0")
          .slice(0, 18);
    nips.push(nip);

    const statusAsn = o.vocab.status.filter((x) => x.kategori === "ASN");
    const statusNon = o.vocab.status.filter((x) => x.kategori !== "ASN");
    let status = "";
    if (jenis === "akl") status = ganggu(acak, pilih(o.vocab.akl));
    else status = acak() < 0.7 ? pilih(statusAsn).nama : pilih(statusNon).nama;
    if (acak() < 0.04) status = pilih(["Pegawai Tetap", "Honorer", "??"]);

    let jabatan = "";
    if (jenis === "dosen") jabatan = acak() < 0.9 ? ganggu(acak, pilih(o.vocab.dosen)) : "";
    else if (jenis === "tendik") jabatan = acak() < 0.4 ? ganggu(acak, pilih(o.vocab.umum)) : acak() < 0.9 ? ganggu(acak, pilih(o.vocab.tendik)) : "Jabatan Aneh";

    let tambahan = "";
    let unitTambahan = "";
    if (jenis !== "akl" && acak() < 0.18) {
      const role = pilih(o.vocab.role);
      const target = acak() < 0.5 ? pilih(o.vocab.unit).nama : pilih(o.vocab.prodi);
      tambahan = acak() < 0.1 ? `Plt. ${role} ${target}` : acak() < 0.1 ? `${role} ${target} dan ${pilih(o.vocab.role)} ${pilih(o.vocab.unit).nama}` : acak() < 0.1 ? `${role} Tak Dikenal` : `${role} ${target}`;
      unitTambahan = acak() < 0.5 ? unit.nama : "";
    }

    const gol = jenis === "akl" ? "" : acak() < 0.93 ? pilih(GOLONGAN) : pilih(["", "XX/z", "-"]);
    const tmt = acak() < 0.04 ? "" : `${2005 + Math.floor(acak() * 20)}-${String(1 + Math.floor(acak() * 12)).padStart(2, "0")}-${String(1 + Math.floor(acak() * 28)).padStart(2, "0")}`;
    const nama = `Nama ${i} ${pilih(["Santoso", "Wijaya", "Lestari", "Pratama"])}`;
    const kelompok = jenis === "dosen" ? "Dosen" : jenis === "tendik" ? "Tendik" : acak() < 0.6 ? "Dosen" : "Akademisi Luar UM";

    ws.addRow(
      [
        nip, nama, `Dr. ${nama}, M.Si.`, (acak() < 0.03 ? "" : pilih(["Laki-laki", "Perempuan", "L", "P"])), "Islam", status, kelompok, jenis === "dosen" ? "Dosen" : jenis === "tendik" ? "Tendik" : "Dosen",
        tmt, gol, jabatan, tambahan, unitTambahan, pilih(PENDIDIKAN), acak() < 0.03 ? "Unit Tidak Ada" : ganggu(acak, unit.nama), acak() < 0.1 ? "" : unit.induk, unit.induk, "",
        "3573000000000000", "Jl. Contoh No. 1", "000111222",
      ].map((v) => (typeof v === "string" && v !== "" ? `${ZW}${v}` : v)),
    );
  }
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nips };
}
