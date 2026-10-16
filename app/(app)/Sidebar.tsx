"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; exact?: boolean };

// Urutan mengikuti alur kerja bulanan: masukkan data -> periksa -> laporan. Yang jarang dipakai ada di bawah.
const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: "", items: [{ href: "/", label: "Ringkasan", exact: true }] },
  {
    label: "1. Masukkan data bulan baru",
    items: [
      { href: "/standarisasi", label: "Standarisasi" },
      { href: "/bandingkan", label: "Bandingkan Batch" },
      { href: "/rekap-kehadiran/upload", label: "Upload Absensi" },
      { href: "/koreksi-rekap", label: "Koreksi Absensi" },
    ],
  },
  {
    label: "2. Periksa hasilnya",
    items: [
      { href: "/rekap-kehadiran/belum-upload", label: "Belum Ada Absensi" },
      { href: "/nominatif", label: "Nominatif" },
      { href: "/rekap-kehadiran/bulanan", label: "Absensi Bulanan" },
    ],
  },
  {
    label: "3. Laporan",
    items: [
      { href: "/rekap-kehadiran/tahunan", label: "Absensi Tahunan" },
      { href: "/rekap-kehadiran/individual", label: "Absensi Pegawai" },
      { href: "/statistik/dosen", label: "Statistik Dosen" },
      { href: "/statistik/tendik", label: "Statistik Tendik" },
    ],
  },
  {
    label: "Jarang dipakai",
    items: [
      { href: "/koreksi-pegawai", label: "Koreksi Pegawai" },
    ],
  },
];

const SEMUA_HREF = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
  return (first + second).toUpperCase() || "A";
}

export function Sidebar({
  userName,
  userEmail,
  onSignOut,
}: {
  userName: string;
  userEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  // Di layar sempit (< lg) sidebar menjadi laci yang dibuka lewat tombol di bilah atas; di lg ke atas selalu tampil.
  const [terbuka, setTerbuka] = useState(false);
  const [jalurSebelumnya, setJalurSebelumnya] = useState(pathname);
  if (jalurSebelumnya !== pathname) {
    // Pindah halaman: tutup laci (disesuaikan saat render, bukan di effect).
    setJalurSebelumnya(pathname);
    setTerbuka(false);
  }

  useEffect(() => {
    if (!terbuka) return;
    const tutupDenganEsc = (e: KeyboardEvent) => e.key === "Escape" && setTerbuka(false);
    window.addEventListener("keydown", tutupDenganEsc);
    return () => window.removeEventListener("keydown", tutupDenganEsc);
  }, [terbuka]);

  return (
    <>
      <div className="tanpa-cetak fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-3 bg-sidebar px-3 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setTerbuka(true)}
          aria-label="Buka menu"
          aria-expanded={terbuka}
          aria-controls="menu-samping"
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-sidebar-lighter"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="truncate text-sm font-bold">KDS Terpadu</span>
      </div>
      {terbuka && <div className="tanpa-cetak fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setTerbuka(false)} aria-hidden="true" />}
    <aside
      id="menu-samping"
      className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-sidebar text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
        terbuka ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1">
          <Image src="/logo.png" alt="Logo KDS SDM" width={40} height={40} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">KDS Terpadu</p>
          <p className="truncate text-xs leading-tight text-sidebar-muted">SDM Universitas Negeri Malang</p>
        </div>
        <button
          type="button"
          onClick={() => setTerbuka(false)}
          aria-label="Tutup menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-lighter lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {section.label && (
              <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-sidebar-muted">{section.label}</p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                // yang menyala hanya alamat paling spesifik (mis. /nominatif/upload tidak ikut menyalakan /nominatif)
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href) && !SEMUA_HREF.some((h) => h.length > item.href.length && h !== "/" && pathname.startsWith(h));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center rounded-full px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-sidebar-active font-medium text-white"
                          : "text-sidebar-muted hover:bg-sidebar-lighter hover:text-white"
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <a
          href="/panduan/index.html"
          target="_blank"
          rel="noopener"
          className="flex items-center justify-between rounded-full border border-sidebar-lighter px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-lighter hover:text-white"
        >
          <span>Panduan</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      <div className="border-t border-sidebar-lighter px-4 py-4">
        <Link href="/akun" title="Pengaturan akun dan kata sandi" className="-m-2 flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-sidebar-lighter">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-green text-xs font-semibold text-white">
            {initialsOf(userName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="truncate text-xs text-sidebar-muted">{userEmail}</p>
          </div>
        </Link>
        <form action={onSignOut} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-md border border-sidebar-lighter px-3 py-1.5 text-xs text-sidebar-muted transition-colors hover:bg-sidebar-lighter hover:text-white"
          >
            Keluar
          </button>
        </form>
      </div>
    </aside>
    </>
  );
}
