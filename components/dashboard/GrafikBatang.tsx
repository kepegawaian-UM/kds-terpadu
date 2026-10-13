"use client";

import Chart from "chart.js/auto";
import { useEffect, useRef } from "react";

/** Grafik batang horizontal (seperti dashboard KDS2). Dibuat di klien; dibersihkan saat dilepas. */
export function GrafikBatang({
  judul,
  labels,
  data,
  warna,
  tinggi = 260,
}: {
  judul: string;
  labels: string[];
  data: number[];
  warna: string;
  tinggi?: number;
}) {
  const kanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!kanvas.current || labels.length === 0) return;
    const grafik = new Chart(kanvas.current, {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: warna, borderRadius: 4, barThickness: 18 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
      },
    });
    return () => grafik.destroy();
  }, [labels, data, warna]);

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-2 text-xs text-slate-500">{judul}</figcaption>
      {labels.length === 0 ? (
        <p className="flex items-center justify-center text-sm text-slate-400" style={{ height: tinggi }}>
          Belum ada data
        </p>
      ) : (
        <div style={{ position: "relative", height: tinggi }}>
          <canvas ref={kanvas} role="img" aria-label={judul}>
            {labels.map((l, i) => `${l}: ${data[i]}`).join(", ")}
          </canvas>
        </div>
      )}
    </figure>
  );
}
