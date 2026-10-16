/** Pembanding bulanan F5 (lib/f5/bandingkan.ts): data sintetis, tanpa basis data. */
import { describe, expect, it } from "vitest";

import { type BarisNominatif, type SlotJabatan, bandingkanJabatanTambahan, bandingkanNominatif, bandingkanRekap, nilaiBulan } from "@/lib/f5/bandingkan";

const kategoriStatus = new Map([["PNS", "ASN"], ["PTNA", "Non-ASN"]]);
const baris = (nip: string, ubah: BarisNominatif = {}): BarisNominatif => ({
  pegawaiNip: nip, nama: `Nama ${nip}`, jenisKelamin: "L", tanggalLahir: "1980-01-01", pendidikanTerakhir: "S1", jenisPegawaiKode: "TDK",
  statusKepegawaianKode: "PNS", golonganKode: "III/a", jabatanFungsionalDosenKode: null, jabatanFungsionalTendikKode: null, jabatanFungsiUmumKode: "UMM-01",
  kategoriAkademisiLuarKode: null, unitAsalKode: "UA-001", tanggalMulaiKerja: "2010-01-01", ...ubah,
});

describe("bandingkanNominatif", () => {
  it("data identik: tidak ada selisih", () => {
    const d = [baris("1"), baris("2")];
    const h = bandingkanNominatif(d, d.map((x) => ({ ...x })), { kategoriStatus });
    expect(h).toMatchObject({ jumlahKds2: 2, jumlahTerpadu: 2, hanyaKds2: [], hanyaTerpadu: [], nipBedaBaru: [], nipBedaDiketahui: 0 });
    expect(h.perKolom.nama).toMatchObject({ sama: 2, beda: 0 });
  });

  it("NIP yang hanya di satu sisi dilaporkan menurut arah", () => {
    const h = bandingkanNominatif([baris("1"), baris("2")], [baris("2"), baris("3")], { kategoriStatus });
    expect(h.hanyaKds2).toEqual(["1"]);
    expect(h.hanyaTerpadu).toEqual(["3"]);
  });

  it("selisih kolom dihitung per kolom; pasangan nilai hanya dicetak untuk kolom kode (bukan nama/tanggal)", () => {
    const h = bandingkanNominatif([baris("1"), baris("2")], [baris("1", { unitAsalKode: "UA-002", nama: "Lain", tanggalMulaiKerja: "2020-01-01" }), baris("2")], { kategoriStatus });
    expect(h.perKolom.unitAsalKode).toMatchObject({ sama: 1, beda: 1 });
    expect([...h.perKolom.unitAsalKode.pasangan.entries()]).toEqual([["UA-001 -> UA-002", 1]]);
    expect(h.perKolom.nama.beda).toBe(1);
    expect(h.perKolom.nama.pasangan.size).toBe(0);
    expect(h.perKolom.tanggalMulaiKerja.pasangan.size).toBe(0);
    expect(h.nipBedaBaru).toEqual(["1"]);
  });

  it("null dan nilai kosong dibedakan dari nilai; golongan Non-ASN yang beda dicatat sebagai diketahui, bukan selisih baru", () => {
    const k = baris("1", { statusKepegawaianKode: "PTNA", golonganKode: "II/a" });
    const t = baris("1", { statusKepegawaianKode: "PTNA", golonganKode: "II/b" });
    const h = bandingkanNominatif([k], [t], { kategoriStatus });
    expect(h).toMatchObject({ nipBedaDiketahui: 1, nipBedaBaru: [], diketahui: { golonganNonAsn: 1 } });
    expect([...h.perKolom.golonganKode.pasangan.keys()]).toEqual(["II/a -> II/b"]);

    const kosong = bandingkanNominatif([baris("1", { statusKepegawaianKode: "PTNA", golonganKode: null })], [t], { kategoriStatus });
    expect(kosong.nipBedaDiketahui).toBe(1);
  });

  it("golongan ASN yang beda TETAP selisih baru; golongan Non-ASN beda bersama kolom lain juga selisih baru", () => {
    expect(bandingkanNominatif([baris("1")], [baris("1", { golonganKode: "III/b" })], { kategoriStatus }).nipBedaBaru).toEqual(["1"]);
    const campur = bandingkanNominatif(
      [baris("1", { statusKepegawaianKode: "PTNA", golonganKode: "II/a" })],
      [baris("1", { statusKepegawaianKode: "PTNA", golonganKode: "II/b", unitAsalKode: "UA-009" })],
      { kategoriStatus },
    );
    expect(campur.nipBedaBaru).toEqual(["1"]);
    expect(campur.nipBedaDiketahui).toBe(0);
  });
});

const slot = (role: string, unit: string | null = null, prodi: string | null = null, status: string | null = "Definitif"): SlotJabatan => ({ role, unit, prodi, status });
const peta = (isi: Record<string, SlotJabatan[]>) => new Map(Object.entries(isi));

describe("bandingkanJabatanTambahan", () => {
  it("sama persis (urutan slot tidak berpengaruh)", () => {
    const h = bandingkanJabatanTambahan(peta({ "1": [slot("A", "U1"), slot("B")] }), peta({ "1": [slot("B"), slot("A", "U1")] }), ["1"]);
    expect(h).toEqual({ sama: 1, terpaduLebihLengkapDiketahui: 0, bedaBaru: [] });
  });

  it("Terpadu lebih lengkap: slot tambahan, atau tujuan yang di KDS2 kosong, dihitung diketahui", () => {
    const h = bandingkanJabatanTambahan(
      peta({ "1": [slot("A")], "2": [slot("A", "U1")], "3": [] }),
      peta({ "1": [slot("A"), slot("B")], "2": [slot("A", "U1"), slot("C", null, "P1")], "3": [slot("A")] }),
      ["1", "2", "3"],
    );
    expect(h).toMatchObject({ sama: 0, terpaduLebihLengkapDiketahui: 3, bedaBaru: [] });
    const target = bandingkanJabatanTambahan(peta({ "1": [slot("A")] }), peta({ "1": [slot("A", "U9")] }), ["1"]);
    expect(target.terpaduLebihLengkapDiketahui).toBe(1);
  });

  it("selisih baru: peran beda, status beda, tujuan beda yang sama-sama terisi, atau Terpadu lebih sedikit", () => {
    const kasus = {
      peranBeda: [peta({ "1": [slot("A")] }), peta({ "1": [slot("B")] })],
      statusBeda: [peta({ "1": [slot("A", null, null, "Plt")] }), peta({ "1": [slot("A", null, null, "Definitif")] })],
      tujuanBeda: [peta({ "1": [slot("A", "U1")] }), peta({ "1": [slot("A", "U2")] })],
      lebihSedikit: [peta({ "1": [slot("A"), slot("B")] }), peta({ "1": [slot("A")] })],
      satuPasanganDipakaiDua: [peta({ "1": [slot("A"), slot("A")] }), peta({ "1": [slot("A", "U1"), slot("B")] })],
    };
    for (const [nama, [a, b]] of Object.entries(kasus)) {
      expect(bandingkanJabatanTambahan(a, b, ["1"]).bedaBaru, nama).toEqual(["1"]);
    }
  });
});

const rekap = (isi: Record<string, Record<string, string | null>>) => new Map(Object.entries(isi).map(([nip, k]) => [nip, new Map(Object.entries(k))]));

describe("bandingkanRekap", () => {
  it("identik: nol beda; spasi di tepi nilai tidak dihitung beda", () => {
    const h = bandingkanRekap(rekap({ "1": { I: "2", S: "0" } }), rekap({ "1": { I: " 2 ", S: "0" } }));
    expect(h).toMatchObject({ sel: { dibandingkan: 2, beda: 0 }, nipBeda: [], hanyaKds2: [], hanyaTerpadu: [] });
  });

  it("sel beda dihitung per komponen; komponen yang hanya ada di satu sisi dihitung beda; NIP satu sisi dilaporkan", () => {
    const h = bandingkanRekap(rekap({ "1": { I: "2", S: "0" }, "2": { I: "1" } }), rekap({ "1": { I: "3", S: "0", TK: "1" }, "3": { I: "1" } }));
    expect(h.sel).toEqual({ dibandingkan: 3, beda: 2 });
    expect([...h.bedaPerKomponen.entries()].sort()).toEqual([["I", 1], ["TK", 1]]);
    expect(h.nipBeda).toEqual(["1"]);
    expect(h.hanyaKds2).toEqual(["2"]);
    expect(h.hanyaTerpadu).toEqual(["3"]);
  });
});

describe("nilaiBulan", () => {
  const nom = (u: Partial<ReturnType<typeof bandingkanNominatif>> = {}) => ({ ...bandingkanNominatif([baris("1")], [baris("1")], { kategoriStatus }), ...u });
  const jt = { sama: 1, terpaduLebihLengkapDiketahui: 0, bedaBaru: [] as string[] };

  it("bersih bila hanya ada perbedaan diketahui", () => {
    const n = bandingkanNominatif([baris("1", { statusKepegawaianKode: "PTNA", golonganKode: "II/a" })], [baris("1", { statusKepegawaianKode: "PTNA", golonganKode: "II/b" })], { kategoriStatus });
    expect(nilaiBulan(n, { ...jt, terpaduLebihLengkapDiketahui: 5 }, null)).toEqual({ bersih: true, alasan: [] });
  });

  it("setiap sumber selisih baru disebut dalam alasan", () => {
    const rk = bandingkanRekap(rekap({ "1": { I: "1" }, "9": { I: "1" } }), rekap({ "1": { I: "2" }, "8": { I: "1" } }));
    const h = nilaiBulan(nom({ hanyaKds2: ["5", "6"], hanyaTerpadu: ["7"], nipBedaBaru: ["1"] }), { ...jt, bedaBaru: ["2", "3"] }, rk);
    expect(h.bersih).toBe(false);
    expect(h.alasan).toEqual([
      "2 NIP Nominatif hanya di KDS2", "1 NIP Nominatif hanya di Terpadu", "1 NIP Nominatif beda kolom (selisih baru)", "2 NIP jabatan tambahan beda (selisih baru)",
      "1 NIP Absensi hanya di KDS2", "1 NIP Absensi hanya di Terpadu", "1 sel Absensi beda",
    ]);
  });
});
