import Link from "next/link";

export default function TidakDitemukan() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Halaman tidak ditemukan</h1>
      <p className="text-sm text-slate-500">Alamat yang Anda buka tidak ada, atau datanya sudah tidak tersedia.</p>
      <Link href="/" className="text-sm text-accent-green underline">
        Kembali ke Ringkasan
      </Link>
    </main>
  );
}
