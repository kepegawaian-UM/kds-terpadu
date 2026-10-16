"use client";

/**
 * Formulir filter yang langsung diterapkan saat pilihan diubah (tanpa tombol "Terapkan"): pilihan masuk ke alamat halaman (query string) sehingga hasilnya
 * tetap bisa dibagikan/disimpan. Isian teks/angka diterapkan saat Enter atau ketika kolomnya dilepas; dropdown centang (Jenis, Status) diterapkan saat ditutup.
 */
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";

const KirimContext = createContext<() => void>(() => {});

export function FormOtomatis({ children, action, className }: { children: ReactNode; action?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLFormElement>(null);
  const [menunggu, mulai] = useTransition();

  const kirim = useCallback(() => {
    const form = ref.current;
    if (!form) return;
    const qs = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v !== "") qs.append(k, v);
    const tujuan = `${action ?? pathname}${qs.size > 0 ? `?${qs.toString()}` : ""}`;
    mulai(() => router.push(tujuan));
  }, [action, pathname, router]);

  return (
    <KirimContext.Provider value={kirim}>
      <form
        ref={ref}
        method="get"
        action={action}
        aria-busy={menunggu}
        onSubmit={(e) => {
          e.preventDefault();
          kirim();
        }}
        onChange={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest("[data-tunda]")) return; // dropdown centang: diterapkan saat ditutup
          if (el instanceof HTMLInputElement && ["text", "number", "search"].includes(el.type)) return; // diterapkan saat Enter/lepas fokus
          kirim();
        }}
        onBlur={(e) => {
          const el = e.target as HTMLElement;
          if (el instanceof HTMLInputElement && ["text", "number", "search"].includes(el.type) && el.value !== el.defaultValue) kirim();
        }}
        className={className ?? "tanpa-cetak flex flex-wrap items-center gap-x-4 gap-y-2"}
      >
        {children}
        {menunggu && <span className="text-xs text-slate-400">Memuat…</span>}
      </form>
    </KirimContext.Provider>
  );
}

/** Dropdown berisi kotak centang (multi-pilih). Tanpa pilihan atau semua terpilih = "Semua". Diterapkan saat dropdown ditutup bila pilihan berubah. */
export function DropdownCentang({
  nama,
  judul,
  pilihan,
  terpilih,
}: {
  nama: string;
  judul: string;
  pilihan: { kode: string; nama: string }[];
  terpilih: string[];
}) {
  const kirim = useContext(KirimContext);
  const [buka, setBuka] = useState(false);
  const [dipilih, setDipilih] = useState<string[]>(terpilih);
  const akar = useRef<HTMLDivElement>(null);
  const awal = useRef<string>("");

  const tutup = useCallback(
    (terapkan: boolean) => {
      setBuka(false);
      if (terapkan && [...dipilih].sort().join("|") !== awal.current) kirim();
    },
    [dipilih, kirim],
  );

  useEffect(() => {
    if (!buka) return;
    const luar = (e: MouseEvent) => !akar.current?.contains(e.target as Node) && tutup(true);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && tutup(true);
    document.addEventListener("mousedown", luar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", luar);
      document.removeEventListener("keydown", esc);
    };
  }, [buka, tutup]);

  const semua = dipilih.length === 0 || dipilih.length === pilihan.length;
  const ringkas = semua ? "Semua" : pilihan.filter((p) => dipilih.includes(p.kode)).map((p) => p.nama).join(", ");

  return (
    <div ref={akar} data-tunda className="relative">
      <button
        type="button"
        aria-expanded={buka}
        onClick={() => {
          if (buka) return tutup(true);
          awal.current = [...dipilih].sort().join("|");
          setBuka(true);
        }}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <span className="text-slate-500">{judul}:</span>
        <span className="max-w-40 truncate font-medium">{ringkas}</span>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-slate-400" fill="currentColor" aria-hidden="true">
          <path d="M5.5 7.5 10 12l4.5-4.5z" />
        </svg>
      </button>
      {buka && (
        <div className="absolute left-0 z-40 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {pilihan.map((p) => (
            <label key={p.kode} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                checked={dipilih.includes(p.kode)}
                onChange={(e) => setDipilih((d) => (e.target.checked ? [...d, p.kode] : d.filter((x) => x !== p.kode)))}
              />
              {p.nama}
            </label>
          ))}
        </div>
      )}
      {/* nilai yang dikirim: hanya pilihan yang dicentang (kosong = Semua, sama dengan perilaku sebelumnya) */}
      {dipilih.map((k) => (
        <input key={k} type="hidden" name={nama} value={k} />
      ))}
    </div>
  );
}
