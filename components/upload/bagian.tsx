/** Bagian tampilan bersama halaman Periksa/Hasil semua jenis upload. */

export const AWALAN_PERINGATAN = "[PERINGATAN] ";
export const angka = (n: number) => n.toLocaleString("id-ID");

export function Angka({ judul, nilai, kelas = "text-slate-900" }: { judul: string; nilai: number; kelas?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-center">
      <div className={`text-2xl font-bold ${kelas}`}>{angka(nilai)}</div>
      <div className="text-xs text-slate-500">{judul}</div>
    </div>
  );
}

export function TabelCatatan({ judul, baris, kelas, potongAwalan = false }: { judul: string; baris: { nomorBaris: number; nipDimaksud: string; alasan: string }[]; kelas: string; potongAwalan?: boolean }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{judul}</h3>
      <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Baris ke-</th>
              <th className="px-3 py-2">NIP</th>
              <th className="px-3 py-2">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((c, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-1.5">{c.nomorBaris}</td>
                <td className="px-3 py-1.5">{c.nipDimaksud}</td>
                <td className={`px-3 py-1.5 ${kelas}`}>{potongAwalan ? c.alasan.slice(AWALAN_PERINGATAN.length) : c.alasan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
