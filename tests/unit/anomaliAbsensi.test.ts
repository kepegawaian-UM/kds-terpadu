/** Aturan peringatan anomali Upload Absensi (murni): tiap aturan, batas tepat, dan tidak menyala pada data wajar. */
import { describe, expect, it } from "vitest";

import { type KonteksAnomali, adalahBershift, deteksiAnomali, hitungPerTingkat } from "@/lib/impor/anomaliAbsensi";

const ctx = (o: Partial<{ nama: Record<string, string>; jk: Record<string, string>; cth: Record<string, number>; sakit: Record<string, number> }> = {}): KonteksAnomali => ({
  nama: new Map(Object.entries(o.nama ?? {})),
  jenisKelamin: new Map(Object.entries(o.jk ?? {})),
  cthBulanLain: new Map(Object.entries(o.cth ?? {})),
  sakitBulanLain: new Map(Object.entries(o.sakit ?? {})),
});

/** Satu pegawai dengan komponen tertentu; SIGMA_HARI bawaan 20. */
const cek = (v: Record<string, string>, k: KonteksAnomali = ctx()) => {
  const valid = new Map([["1", { SIGMA_HARI: "20", ...v }]]);
  return deteksiAnomali(valid, new Map([["1", 7]]), k).map((a) => `${a.tingkat}:${a.kode}`);
};

describe("deteksiAnomali", () => {
  it("data wajar tidak menghasilkan apa pun (hadir penuh; sebagian cuti + masuk; tugas dinas bersama masuk)", () => {
    expect(cek({ JUMLAH_MASUK_NYATA: "20", TOTAL: "20" })).toEqual([]);
    expect(cek({ JUMLAH_MASUK_NYATA: "15", CTH: "5", TOTAL: "15" })).toEqual([]);
    expect(cek({ JUMLAH_MASUK_NYATA: "20", TD: "20", TOTAL: "20" })).toEqual([]); // TD tidak dihitung sebagai tidak hadir
    expect(cek({ JUMLAH_MASUK_NYATA: "10", TB: "10", TOTAL: "10" })).toEqual([]);
  });

  it("masuk + tidak hadir melebihi hari kerja: toleransi 1 hari, lebih dari itu PENTING (kasus Januari: masuk 20 + TK 20)", () => {
    expect(cek({ JUMLAH_MASUK_NYATA: "20", I: "1" })).toEqual([]); // 21 = hari kerja + 1: masih dibiarkan
    expect(cek({ JUMLAH_MASUK_NYATA: "20", I: "2" })).toEqual(["penting:melebihi_hari_kerja"]);
    expect(cek({ JUMLAH_MASUK_NYATA: "20", TK: "20" })).toContain("penting:melebihi_hari_kerja");
  });

  it("TOTAL terisi tanpa masuk dan tanpa komponen cuti/izin: PENTING (kasus cuti bersalin di kolom TOTAL)", () => {
    expect(cek({ TOTAL: "20" })).toEqual(["penting:total_tanpa_komponen"]);
    expect(cek({ TOTAL: "20", CTM: "20" })).toEqual([]); // sudah benar di kolom CTM
    expect(cek({ TOTAL: "20", TD: "20" })).toEqual([]); // penugasan termasuk keterangan
  });

  it("satu komponen melebihi hari kerja: PENTING, tanpa dobel dengan aturan melebihi", () => {
    expect(cek({ TD: "21" })).toEqual(["penting:komponen_melebihi_hari_kerja"]); // penugasan tidak masuk jumlah tidak hadir
    expect(cek({ TK: "21" })).toEqual(["penting:komponen_melebihi_hari_kerja", "sedang:tk_sebulan_penuh"]); // 21 = hari kerja + 1: aturan "melebihi" belum menyala, komponen tunggal sudah
    expect(cek({ CTH: "25" })).toEqual(["penting:melebihi_hari_kerja", "penting:cuti_tahunan_kumulatif"]); // sudah tertangkap "melebihi": komponen tunggal tidak diulang
  });

  it("Cuti Melahirkan pada pegawai laki-laki: PENTING; pada perempuan tidak", () => {
    expect(cek({ CTM: "10", JUMLAH_MASUK_NYATA: "10" }, ctx({ jk: { "1": "L" } }))).toEqual(["penting:cuti_melahirkan_laki_laki"]);
    expect(cek({ CTM: "10", JUMLAH_MASUK_NYATA: "10" }, ctx({ jk: { "1": "P" } }))).toEqual([]);
  });

  it("Cuti Tahunan kumulatif tahun ini di atas 18: PENTING (kasus 65 hari); tepat 18 dan bulan tanpa cuti tidak menyala", () => {
    expect(cek({ CTH: "6", JUMLAH_MASUK_NYATA: "14" }, ctx({ cth: { "1": 12 } }))).toEqual([]); // 12 + 6 = 18
    expect(cek({ CTH: "6", JUMLAH_MASUK_NYATA: "14" }, ctx({ cth: { "1": 13 } }))).toEqual(["penting:cuti_tahunan_kumulatif"]); // 19
    expect(cek({ JUMLAH_MASUK_NYATA: "20" }, ctx({ cth: { "1": 40 } }))).toEqual([]); // bulan ini tanpa cuti: tidak diulang di setiap bulan
    const p = deteksiAnomali(new Map([["1", { SIGMA_HARI: "20", CTH: "15", JUMLAH_MASUK_NYATA: "5" }]]), new Map([["1", 3]]), ctx({ cth: { "1": 50 }, nama: { "1": "Uji" } }))[0];
    expect(p).toMatchObject({ nomorBaris: 3, nip: "1", nama: "Uji", tingkat: "penting" });
    expect(p.pesan).toContain("65");
  });

  it("SEDANG: bulan tanpa masuk dan tanpa keterangan; TK sebulan penuh; sakit kumulatif >= 60", () => {
    expect(cek({})).toEqual(["sedang:tanpa_keterangan"]);
    expect(cek({ TOTAL: "0", JUMLAH_MASUK_NYATA: "0" })).toEqual(["sedang:tanpa_keterangan"]);
    expect(cek({ TK: "20", TOTAL: "0" })).toEqual(["sedang:tk_sebulan_penuh"]);
    expect(cek({ TK: "19", JUMLAH_MASUK_NYATA: "1" })).toEqual([]);
    expect(cek({ S: "5", JUMLAH_MASUK_NYATA: "15" }, ctx({ sakit: { "1": 54 } }))).toEqual([]); // 59
    expect(cek({ S: "5", JUMLAH_MASUK_NYATA: "15" }, ctx({ sakit: { "1": 55 } }))).toEqual(["sedang:sakit_kumulatif"]); // 60
    expect(cek({ JUMLAH_MASUK_NYATA: "20" }, ctx({ sakit: { "1": 100 } }))).toEqual([]); // bulan ini tanpa sakit: tidak diulang
  });

  it("INFO: hari kerja berbeda dari yang lazim di berkas (hanya bila ada modus)", () => {
    const valid = new Map<string, Record<string, string>>([
      ["a", { SIGMA_HARI: "20", JUMLAH_MASUK_NYATA: "20" }],
      ["b", { SIGMA_HARI: "20", JUMLAH_MASUK_NYATA: "20" }],
      ["c", { SIGMA_HARI: "23", JUMLAH_MASUK_NYATA: "23" }],
    ]);
    const hasil = deteksiAnomali(valid, new Map(), ctx());
    expect(hasil.map((a) => [a.nip, a.tingkat, a.kode])).toEqual([["c", "info", "hari_kerja_berbeda"]]);
  });

  it("pegawai bershift (Satpam) dikecualikan dari peringatan hari kerja berbeda dan dari penentuan hari kerja lazim", () => {
    expect(["Satpam 3 Shift", " Satpam 2 Shift "].map(adalahBershift)).toEqual([true, true]);
    expect(["", "-", "0", " - ", undefined].map(adalahBershift)).toEqual([false, false, false, false, false]);
    const valid = new Map<string, Record<string, string>>([
      ["a", { SIGMA_HARI: "20", JUMLAH_MASUK_NYATA: "20", JENIS_SHIFT: "-" }],
      ["b", { SIGMA_HARI: "20", JUMLAH_MASUK_NYATA: "20" }],
      ["s1", { SIGMA_HARI: "23", JUMLAH_MASUK_NYATA: "23", JENIS_SHIFT: "Satpam 3 Shift" }],
      ["s2", { SIGMA_HARI: "23", JUMLAH_MASUK_NYATA: "23", JENIS_SHIFT: "Satpam 3 Shift" }],
      ["s3", { SIGMA_HARI: "23", JUMLAH_MASUK_NYATA: "23", JENIS_SHIFT: "Satpam 2 Shift" }],
      ["n", { SIGMA_HARI: "23", JUMLAH_MASUK_NYATA: "23", JENIS_SHIFT: "-" }], // bukan shift tapi hari kerja berbeda: tetap Info
    ]);
    // tanpa pengecualian modus akan menjadi 23 (tiga Satpam + n) dan "a"/"b" yang ditandai
    expect(deteksiAnomali(valid, new Map(), ctx()).map((x) => `${x.nip}:${x.kode}`)).toEqual(["n:hari_kerja_berbeda"]);
  });

  it("urut: penting dulu, lalu sedang, lalu info; nilai non-angka dihitung 0", () => {
    const valid = new Map<string, Record<string, string>>([
      ["a", { SIGMA_HARI: "20" }], // sedang
      ["b", { SIGMA_HARI: "20", TOTAL: "20" }], // penting
      ["c", { SIGMA_HARI: "x", JUMLAH_MASUK_NYATA: "abc", TOTAL: "" }], // semua 0: tak ada apa pun
    ]);
    const hasil = deteksiAnomali(valid, new Map([["a", 5], ["b", 9], ["c", 2]]), ctx());
    expect(hasil.map((a) => `${a.nip}:${a.tingkat}`)).toEqual(["b:penting", "a:sedang"]);
    expect(hitungPerTingkat(hasil)).toEqual({ penting: 1, sedang: 1, info: 0 });
  });
});
