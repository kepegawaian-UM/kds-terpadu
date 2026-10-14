import type { NextConfig } from "next";

/**
 * Header keamanan untuk semua halaman (aplikasi akan di internet). CSP sengaja HANYA membatasi hal yang tidak mengganggu Next
 * (bingkai, form, base, object): `script-src` ketat memerlukan nonce per permintaan dan akan diuji tersendiri sebelum diaktifkan.
 */
export const HEADER_KEAMANAN = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Aplikasi internal: mesin pencari tidak boleh mengindeks halaman login maupun halaman lain.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: HEADER_KEAMANAN }];
  },
};

export default nextConfig;
