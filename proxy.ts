import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Pakai authConfig (tanpa Prisma) di sini, BUKAN import dari lib/auth.ts - proxy.ts jalan di
// edge runtime dan Prisma Client gagal kalau ikut ter-bundle ke situ.
const { auth } = NextAuth(authConfig);

export { auth as proxy };

// logo.png dikecualikan: dipakai next/image di halaman login (belum ada sesi) dan pengoptimal gambar mengambilnya tanpa cookie,
// sehingga bila dilindungi, logo rusak (dialihkan 307 ke /login). Berkas publik non-sensitif.
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|logo.png|robots.txt).*)"],
};
