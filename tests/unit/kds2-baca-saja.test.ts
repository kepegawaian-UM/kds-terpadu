import { describe, expect, it } from "vitest";

import { pastikanHanyaBaca } from "../../scripts/kds2-mysql";
import { barisKeJson } from "../../scripts/ekspor-master-kds2";

describe("penjaga hanya-baca KDS2", () => {
  it("mengizinkan SELECT/SHOW", () => {
    expect(() => pastikanHanyaBaca("SELECT COUNT(*) FROM pegawai")).not.toThrow();
    expect(() => pastikanHanyaBaca("  show tables")).not.toThrow();
  });
  it.each(["INSERT INTO x VALUES (1)", "UPDATE x SET a=1", "DELETE FROM x", "DROP TABLE x", "TRUNCATE x"])(
    "menolak %s",
    (sql) => {
      expect(() => pastikanHanyaBaca(sql)).toThrow(/hanya kueri baca/i);
    }
  );
});

describe("barisKeJson", () => {
  it("snake_case -> camelCase dan boolean", () => {
    expect(barisKeJson({ kode: "AKL-01", nama_role: "x", masuk_rekap_kehadiran: 0 })).toEqual({
      kode: "AKL-01",
      namaRole: "x",
      masukRekapKehadiran: false,
    });
  });
});
