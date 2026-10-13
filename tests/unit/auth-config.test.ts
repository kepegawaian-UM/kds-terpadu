import { describe, expect, it } from "vitest";

import { authConfig } from "@/lib/auth.config";

type Authorized = NonNullable<NonNullable<typeof authConfig.callbacks>["authorized"]>;
const authorized = authConfig.callbacks?.authorized as Authorized;

const minta = (path: string) => ({ nextUrl: new URL(`http://localhost${path}`) }) as never;

describe("callback authorized (pertahanan berlapis di proxy)", () => {
  it("ada callback authorized", () => {
    expect(typeof authorized).toBe("function");
  });

  it("menolak pengunjung tanpa sesi di semua rute aplikasi, termasuk rute unduhan", async () => {
    for (const path of ["/", "/nominatif", "/nominatif/export?bulan=10&tahun=2026", "/rekap-kehadiran/bulanan"]) {
      expect(await authorized({ auth: null, request: minta(path) }), path).toBe(false);
    }
  });

  it("mengizinkan pengguna yang sudah login", async () => {
    expect(await authorized({ auth: { user: { id: "u1" }, expires: "x" }, request: minta("/nominatif") })).toBe(true);
  });

  it("sesi tanpa pengguna dianggap belum login", async () => {
    expect(await authorized({ auth: { expires: "x" } as never, request: minta("/nominatif") })).toBe(false);
  });
});
