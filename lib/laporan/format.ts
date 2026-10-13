/** dd-mm-yyyy dari tanggal murni (kolom DATE disimpan tengah malam UTC; tidak bergeser zona waktu). */
export function formatTanggal(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  return `${dd}-${mm}-${yyyy}`;
}
