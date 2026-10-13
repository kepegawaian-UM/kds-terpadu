/** Pencocokan HANYA deterministik (exact / prefix persis) - tidak pernah fuzzy-match otomatis. */

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function kunciKamus(...parts: string[]): string {
  return parts.map(normalize).join("‖"); // U+2016 "‖" sebagai separator komposit
}

export function exactMatch<T>(list: T[], getName: (t: T) => string, raw: string): T | undefined {
  const n = normalize(raw);
  if (!n) return undefined;
  return list.find((item) => normalize(getName(item)) === n);
}

/**
 * Cocokkan raw value ke master yang namanya berformat "KODE - Nama Panjang" (mis. kategori
 * akademisi luar "AF - Adjunct Faculty") - raw bisa berupa kode pendek ("AF") atau nama penuh.
 */
export function prefixOrExactMatch<T>(
  list: T[],
  getName: (t: T) => string,
  raw: string
): T | undefined {
  const n = normalize(raw);
  if (!n) return undefined;
  return list.find((item) => {
    const name = normalize(getName(item));
    if (name === n) return true;
    const dashIdx = name.indexOf(" - ");
    if (dashIdx === -1) return false;
    return name.slice(0, dashIdx).trim() === n;
  });
}

/**
 * Cocokkan raw value SEBAGAI KATA-KATA AWAL PERSIS dari nama master (mis. "Praktisi" ->
 * "Praktisi Mengajar", "AP" -> "AP - Adjunct Professor") - batas kata (spasi), bukan substring
 * bebas, supaya tetap deterministik. HANYA aman dipakai untuk membandingkan terhadap "Status
 * Pegawai" mentah (nilai status yang legit seperti PNS/PTNA/dst tidak pernah kebetulan jadi
 * awalan nama kategori Akademisi Luar manapun) - JANGAN dipakai untuk "Jenis Pegawai" mentah,
 * karena "Dosen" akan salah kena cocok ke kategori "Dosen Akademisi" dan merusak klasifikasi
 * ribuan baris Dosen biasa. Untuk Jenis Pegawai tetap pakai `prefixOrExactMatch` yang lebih
 * ketat (hanya pola "KODE - Nama").
 */
export function matchStatusAgainstKategori<T>(
  list: T[],
  getName: (t: T) => string,
  raw: string
): T | undefined {
  const n = normalize(raw);
  if (!n) return undefined;
  return list.find((item) => {
    const name = normalize(getName(item));
    return name === n || name.startsWith(`${n} `);
  });
}

/**
 * Fallback SETELAH exactMatch gagal: cocokkan raw value sebagai kata-kata awal persis dari nama
 * master (mis. "Guru Besar" -> "Guru Besar (Profesor)") - batas kata (spasi), bukan substring
 * bebas. Aman dipakai untuk Jabatan Fungsional Dosen KARENA hanya dipanggil setelah exactMatch:
 * kalau raw persis "Lektor", exactMatch sudah menemukan master "Lektor" duluan sebelum fallback
 * ini sempat jalan, jadi tidak akan salah nyasar ke "Lektor Kepala" (juga diawali kata "Lektor").
 */
export function prefixWordMatch<T>(list: T[], getName: (t: T) => string, raw: string): T | undefined {
  const n = normalize(raw);
  if (!n) return undefined;
  return list.find((item) => normalize(getName(item)).startsWith(`${n} `));
}

const GOLONGAN_PATTERN = /\b(I{1,3}|IV)\/[a-eA-E]\b/;

/** Ekstrak kode golongan (mis. "II/d") dari teks deskriptif seperti "Pengatur Tingkat I, II/d". */
export function extractGolonganCode(raw: string): string | null {
  const m = raw.match(GOLONGAN_PATTERN);
  if (!m) return null;
  const [romawi, huruf] = m[0].split("/");
  return `${romawi.toUpperCase()}/${huruf.toLowerCase()}`;
}

const ROMAWI_GOLONGAN_PPPK = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII",
];

/**
 * PPPK pakai skala "Jenjang" I-XVII (angka romawi POLOS, tanpa "/huruf" spt golongan PNS) -
 * ditulis di data sumber sbg teks seperti "-, X" (bagian sebelum koma placeholder kosong utk
 * kolom PNS). Nilai ini DIPERCAYA langsung dari sumber (bukan dihitung ulang dari pendidikan -
 * jenjang riil PPPK juga mempertimbangkan masa kerja, bukan cuma pendidikan, jadi menghitung
 * ulang berisiko salah dibanding memakai apa yang sudah ditentukan HR di file sumber).
 */
export function extractGolonganPPPK(raw: string): string | null {
  const bagianTerakhir = raw.split(",").pop()?.trim().toUpperCase() ?? "";
  return ROMAWI_GOLONGAN_PPPK.includes(bagianTerakhir) ? bagianTerakhir : null;
}

/** Cocokkan "Arsiparis Madya" ke master {jabatanPokok:"Arsiparis", jenjang:"Madya"}. */
export function matchJabatanFungsionalTendik<T extends { jabatanPokok: string; jenjang: string }>(
  list: T[],
  raw: string
): T | undefined {
  const n = normalize(raw);
  if (!n) return undefined;
  return list.find((item) => {
    const candidate = item.jenjang === "-" ? item.jabatanPokok : `${item.jabatanPokok} ${item.jenjang}`;
    return normalize(candidate) === n;
  });
}
