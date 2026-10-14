/** Header keamanan HTTP (next.config.ts): ada, berlaku untuk semua rute, dan CSP tidak memuat script-src yang bisa merusak Next. */
import { describe, expect, it } from "vitest";

import nextConfig, { HEADER_KEAMANAN } from "../../next.config";

const nilai = (k: string) => HEADER_KEAMANAN.find((h) => h.key === k)?.value;

describe("header keamanan", () => {
  it("memuat header wajib dengan nilai ketat", () => {
    expect(nilai("X-Frame-Options")).toBe("DENY");
    expect(nilai("X-Content-Type-Options")).toBe("nosniff");
    expect(nilai("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(nilai("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(nilai("Permissions-Policy")).toContain("camera=()");
    expect(nilai("Strict-Transport-Security")).toMatch(/max-age=\d{7,}/);
    const csp = nilai("Content-Security-Policy")!;
    for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"]) expect(csp).toContain(d);
    expect(csp).not.toMatch(/script-src|default-src/); // CSP skrip ketat butuh nonce dan diuji terpisah
  });

  it("dipasang pada semua rute", async () => {
    const aturan = await nextConfig.headers!();
    expect(aturan).toEqual([{ source: "/:path*", headers: HEADER_KEAMANAN }]);
  });
});
