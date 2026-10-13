"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Kerangka F1: hanya "Ringkasan" yang aktif. Modul lain adalah penanda tempat dan akan
// diaktifkan per tahap (lihat docs/01-rancangan.md): Nominatif/Rekap/Statistik/Dashboard di
// F3, Upload/Koreksi/Standarisasi di F4.
type NavItem = { href: string; label: string; exact?: boolean; tahap?: string };

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Data",
    items: [
      { href: "/", label: "Ringkasan", exact: true },
      { href: "/nominatif", label: "Nominatif" },
      { href: "/rekap-kehadiran/bulanan", label: "Rekap Bulanan" },
      { href: "/rekap-kehadiran/tahunan", label: "Rekap Tahunan" },
      { href: "/rekap-kehadiran/belum-upload", label: "Belum Ada Rekap" },
      { href: "/statistik/dosen", label: "Statistik Dosen" },
      { href: "/statistik/tendik", label: "Statistik Tendik" },
    ],
  },
  {
    label: "Proses",
    items: [
      { href: "/nominatif/upload", label: "Upload Nominatif" },
      { href: "/rekap-kehadiran/upload", label: "Upload Rekap" },
      { href: "/standarisasi", label: "Standarisasi", tahap: "F4" },
      { href: "/koreksi-rekap", label: "Koreksi Rekap" },
    ],
  },
];

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

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-sidebar text-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1">
          <Image src="/logo.png" alt="Logo KDS SDM" width={40} height={40} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">KDS Terpadu</p>
          <p className="truncate text-xs leading-tight text-sidebar-muted">SDM Universitas Negeri Malang</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                if (item.tahap) {
                  return (
                    <li key={item.href}>
                      <span
                        aria-disabled="true"
                        className="flex cursor-not-allowed items-center justify-between rounded-full px-3 py-2 text-sm text-sidebar-muted/60"
                      >
                        <span className="truncate">{item.label}</span>
                        <span className="rounded-full border border-sidebar-lighter px-2 text-[10px] uppercase">
                          {item.tahap}
                        </span>
                      </span>
                    </li>
                  );
                }
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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

      <div className="border-t border-sidebar-lighter px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-green text-xs font-semibold text-white">
            {initialsOf(userName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="truncate text-xs text-sidebar-muted">{userEmail}</p>
          </div>
        </div>
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
  );
}
