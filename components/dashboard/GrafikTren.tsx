"use client";

import Chart from "chart.js/auto";
import { useEffect, useRef, useState } from "react";

const WARNA = ["#dc2626", "#1d443a", "#d1ab68", "#0c447c", "#993c1d", "#534ab7", "#0f6e56", "#712b13", "#993556", "#5f5e5a", "#854f0b"];

type Seri = { kode: string; label: string; data: number[]; default: boolean };

/** Tren bulanan per kategori izin: garis per kategori; tombol menyalakan/mematikan garis (bawaan TK dan S). */
export function GrafikTren({ bulanLabel, series }: { bulanLabel: string[]; series: Seri[] }) {
  const kanvas = useRef<HTMLCanvasElement>(null);
  const grafik = useRef<Chart | null>(null);
  const [aktif, setAktif] = useState<Set<string>>(() => new Set(series.filter((s) => s.default).map((s) => s.kode)));

  useEffect(() => {
    if (!kanvas.current) return;
    const g = new Chart(kanvas.current, {
      type: "line",
      data: {
        labels: bulanLabel,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.data,
          borderColor: WARNA[i % WARNA.length],
          backgroundColor: WARNA[i % WARNA.length],
          hidden: !s.default,
          tension: 0.2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
    grafik.current = g;
    return () => {
      g.destroy();
      grafik.current = null;
    };
  }, [bulanLabel, series]);

  function ganti(i: number, kode: string) {
    const g = grafik.current;
    if (g) {
      g.setDatasetVisibility(i, !g.isDatasetVisible(i));
      g.update();
    }
    setAktif((awal) => {
      const baru = new Set(awal);
      if (baru.has(kode)) baru.delete(kode);
      else baru.add(kode);
      return baru;
    });
  }

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-xs text-slate-500">Tren bulanan per kategori</figcaption>
        <div className="flex flex-wrap gap-2">
          {series.map((s, i) => (
            <button
              key={s.kode}
              type="button"
              aria-pressed={aktif.has(s.kode)}
              onClick={() => ganti(i, s.kode)}
              className={`rounded border px-2 py-1 text-xs ${
                aktif.has(s.kode) ? "border-accent-green bg-emerald-50 text-sidebar" : "border-slate-300 text-slate-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", height: 300 }}>
        <canvas ref={kanvas} role="img" aria-label="Tren bulanan per kategori izin" />
      </div>
    </figure>
  );
}
