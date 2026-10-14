/** Membaca bentuk tersimpan jabatan tambahan di kamus: "role|UNIT:x|status;role|PRODI:y|status;role|NONE|status". */
export function decodeKamusJabatanTambahan(v: string): { role: string; unit: string | null; prodi: string | null }[] | null {
  const hasil: { role: string; unit: string | null; prodi: string | null }[] = [];
  for (const s of v.split(";")) {
    const b = s.split("|");
    if (b.length !== 3) return null;
    hasil.push({ role: b[0], unit: b[1].startsWith("UNIT:") ? b[1].slice(5) : null, prodi: b[1].startsWith("PRODI:") ? b[1].slice(6) : null });
  }
  return hasil;
}
