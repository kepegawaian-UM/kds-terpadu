"use client";

/**
 * Tombol cetak. Judul tab diganti nama file yang disarankan TEPAT saat mencetak (bukan saat dimuat, karena Next dapat
 * mengembalikan judul halaman), supaya menjadi nama bawaan berkas saat "Simpan sebagai PDF"; judul lama dipulihkan sesudahnya.
 */
export function TombolCetak({ namaFile, label = "Cetak / Simpan PDF" }: { namaFile: string; label?: string }) {
  function cetak() {
    const semula = document.title;
    document.title = namaFile;
    const pulihkan = () => {
      document.title = semula;
      window.removeEventListener("afterprint", pulihkan);
    };
    window.addEventListener("afterprint", pulihkan);
    window.print();
  }
  return (
    <button type="button" onClick={cetak} className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter">
      {label}
    </button>
  );
}
