/** Rute yang dilindungi proxy login: semua kecuali halaman login, aset Next, favicon, dan logo (dipakai next/image di halaman login). */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// proxy.ts tidak bisa diimpor di sini (next-auth butuh runtime Next), jadi pola matcher dibaca dari teksnya. Polanya hanya lookahead
// biasa sehingga bisa diuji sebagai RegExp.
const pola = /matcher:\s*\["([^"]+)"\]/.exec(readFileSync("proxy.ts", "utf8"))?.[1];
const dilindungi = (jalur: string) => new RegExp(`^${pola}$`).test(jalur);

it("pola matcher ditemukan", () => expect(pola).toBeTruthy());

describe("matcher proxy", () => {
  it("melindungi halaman aplikasi dan rute ekspor", () => {
    for (const j of ["/", "/nominatif", "/standarisasi/7/review", "/bandingkan/export", "/rekap-kehadiran/individual", "/kamus"]) expect(dilindungi(j), j).toBe(true);
  });

  it("tidak melindungi halaman login, aset Next, favicon, dan logo", () => {
    for (const j of ["/login", "/api/auth/session", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/logo.png", "/robots.txt"]) expect(dilindungi(j), j).toBe(false);
  });

  it("tidak melonggarkan berkas lain di public", () => {
    for (const j of ["/images/logo-um.png", "/data.json"]) expect(dilindungi(j), j).toBe(true);
  });
});
