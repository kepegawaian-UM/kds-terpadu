"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { MAKS_JABATAN_TAMBAHAN, STATUS_PENGANGKATAN } from "@/lib/constants";
import type { RawNominatifRow } from "@/lib/excel/types";

import { resolveBarisBermasalah, type ResolveState } from "@/app/(app)/standarisasi/[id]/review/[barisId]/actions";
import { tambahJabatanTambahanRole } from "@/app/(app)/standarisasi/[id]/review/[barisId]/actions";
import { TambahTargetBaru, type TargetBaru } from "./TambahTargetBaru";
import { SearchableSelect } from "./SearchableSelect";

type Master = {
  statusKepegawaian: { kode: string; nama: string }[];
  golongan: { kode: string }[];
  jabatanFungsionalDosen: { kode: string; nama: string }[];
  jabatanFungsionalTendik: { kode: string; jabatanPokok: string; jenjang: string }[];
  jabatanFungsiUmumPelaksana: { kode: string; nama: string }[];
  kategoriAkademisiLuar: { kode: string; nama: string }[];
  unitAsal: { kode: string; nama: string }[];
  jabatanTambahanRole: { kode: string; namaRole: string; berlakuUntuk: string }[];
  programStudi: { kode: string; nama: string }[];
  unitInduk: { kode: string; nama: string }[];
};

type Prefill = {
  kelompok: "Dosen" | "Tendik" | "Akademisi Luar UM" | null;
  statusKepegawaianKode: string | null;
  golonganKode: string | null;
  kategoriAkademisiLuarKode: string | null;
  jabatanPilihan: string | null;
  unitAsalKode: string | null;
  adaJabatanTambahan: boolean;
  jabatanTambahanRoleKode: string | null;
  jabatanTambahanTargetKode: string | null;
  statusPengangkatan: string | null;
  /** Jabatan Tambahan ke-2 dan ke-3 (urut) - panjang 0..2, slot 1 ada di field di atas. */
  slotLanjutan: { roleKode: string | null; targetKode: string | null; status: string | null }[];
};

/**
 * "Tenaga Pengajar" adalah istilah RESMI di master SIMPEGA (jangan diganti - export ke SIMPEGA
 * akan ditolak kalau beda, lihat ALIAS_JABATAN_FUNGSIONAL_DOSEN di classify.ts), tapi istilah
 * yang sudah biasa dipakai sehari-hari di sini adalah "Tenaga Dosen" - jadi CUMA label yang
 * tampil di dropdown ini yang diganti, kode & nilai yang disimpan/di-export tetap apa adanya.
 */
function labelJabatanDosen(nama: string): string {
  return nama === "Tenaga Pengajar" ? "Tenaga Dosen" : nama;
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter disabled:opacity-50"
    >
      {pending ? "Menyimpan..." : "Simpan & Lanjut"}
    </button>
  );
}

export function ResolveForm({
  batchId,
  barisId,
  raw,
  prefill,
  master,
}: {
  batchId: number;
  barisId: string;
  raw: RawNominatifRow;
  prefill: Prefill;
  master: Master;
}) {
  const boundAction = resolveBarisBermasalah.bind(null, batchId, barisId);
  const [state, formAction] = useActionState<ResolveState, FormData>(boundAction, {});
  const [kelompok, setKelompok] = useState(prefill.kelompok ?? "Tendik");
  const [adaJabatanTambahan, setAdaJabatanTambahan] = useState(prefill.adaJabatanTambahan);
  const [adaJabatanTambahanKedua, setAdaJabatanTambahanKedua] = useState(prefill.slotLanjutan.length >= 1);
  const [adaJabatanTambahanKetiga, setAdaJabatanTambahanKetiga] = useState(prefill.slotLanjutan.length >= 2);
  // Role yang baru ditambah lewat "+ Tambah ... sebagai jabatan tambahan baru" langsung masuk
  // sini supaya bisa dipilih tanpa reload - master data SEBENARNYA (Prisma) sudah diperbarui
  // oleh server action-nya sendiri, ini cuma salinan lokal utk render ulang daftar opsi.
  const [extraJabatanTambahanRole, setExtraJabatanTambahanRole] = useState<
    { kode: string; namaRole: string; berlakuUntuk: string }[]
  >([]);
  // Unit/Prodi yang baru ditambah lewat mini-form "+ ... Tambah baru" (TambahTargetBaru) - sama
  // polanya dgn extraJabatanTambahanRole di atas: salinan lokal supaya langsung muncul di semua
  // dropdown target tanpa reload (master SEBENARNYA sudah diperbarui oleh server action-nya).
  const [extraUnitAsal, setExtraUnitAsal] = useState<{ kode: string; nama: string }[]>([]);
  const [extraProdi, setExtraProdi] = useState<{ kode: string; nama: string }[]>([]);
  // Per SLOT (1-3), dipakai sbg `key` SEKALIGUS `defaultValue` utk memaksa dropdown target slot ITU
  // remount dgn data baru langsung terpilih - tidak menyentuh slot lain (dulu satu state utk
  // semua, hasilnya slot 1 ikut tertimpa saat admin menambah unit utk slot 2).
  const [targetOverride, setTargetOverride] = useState<Record<1 | 2 | 3, string | null>>({ 1: null, 2: null, 3: null });

  function targetBaruDibuat(slot: 1 | 2 | 3, hasil: TargetBaru) {
    const item = { kode: hasil.kode, nama: hasil.nama };
    if (hasil.tipe === "UNIT") setExtraUnitAsal((prev) => [...prev, item]);
    else setExtraProdi((prev) => [...prev, item]);
    setTargetOverride((prev) => ({ ...prev, [slot]: `${hasil.tipe}:${hasil.kode}` }));
  }

  const opsiTarget = [
    ...master.unitAsal.map((u) => ({ value: `UNIT:${u.kode}`, label: u.nama, group: "Unit Asal" })),
    ...extraUnitAsal.map((u) => ({ value: `UNIT:${u.kode}`, label: u.nama, group: "Unit Asal" })),
    ...master.programStudi.map((p) => ({ value: `PRODI:${p.kode}`, label: p.nama, group: "Program Studi" })),
    ...extraProdi.map((p) => ({ value: `PRODI:${p.kode}`, label: p.nama, group: "Program Studi" })),
  ];
  const unitAsalFakultas = master.unitAsal.filter((u) => /^(fakultas|sekolah)\b/i.test(u.nama));

  // Slot Jabatan Tambahan ke-2 dan ke-3 identik (beda nama field: ...2/...3) - satu fungsi utk
  // dua-duanya supaya tidak menyalin ~70 baris markup.
  function renderSlotLanjutan(nomor: 2 | 3) {
    const nama = nomor === 2 ? "Kedua" : "Ketiga";
    const awal = prefill.slotLanjutan[nomor - 2];
    return (
      <div key={nomor} className="space-y-3 rounded-md border border-slate-200 p-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Jabatan Tambahan {nama}</label>
          <SearchableSelect
            key={kelompok}
            name={`jabatanTambahanRoleKode${nomor}`}
            defaultValue={awal?.roleKode ?? ""}
            placeholder="Cari jabatan tambahan..."
            options={[...master.jabatanTambahanRole, ...extraJabatanTambahanRole]
              .filter((r) => r.berlakuUntuk === "Keduanya" || r.berlakuUntuk === kelompok)
              .map((r) => ({ value: r.kode, label: r.namaRole }))}
            createLabel="jabatan tambahan baru"
            onCreateOption={async (query) => {
              const created = await tambahJabatanTambahanRole(query, kelompok as "Dosen" | "Tendik");
              setExtraJabatanTambahanRole((prev) => [...prev, { ...created, berlakuUntuk: kelompok }]);
              return { value: created.kode, label: created.namaRole };
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Unit/Prodi Jabatan Tambahan {nama}</label>
          <SearchableSelect
            key={targetOverride[nomor] ?? `target-default-${nomor}`}
            name={`jabatanTambahanTargetKode${nomor}`}
            defaultValue={targetOverride[nomor] ?? awal?.targetKode ?? ""}
            placeholder="Cari unit/prodi..."
            options={opsiTarget}
          />
          <TambahTargetBaru
            unitInduk={master.unitInduk}
            unitAsalFakultas={unitAsalFakultas}
            onCreated={(h) => targetBaruDibuat(nomor, h)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Status Pengangkatan</label>
          <select
            name={`statusPengangkatan${nomor}`}
            defaultValue={awal?.status ?? ""}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih status pengangkatan...</option>
            {STATUS_PENGANGKATAN.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-slate-200 bg-white p-6">
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Kelompok Pegawai</legend>
        <div className="mt-2 flex gap-4">
          {(["Dosen", "Tendik", "Akademisi Luar UM"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="kelompok"
                value={k}
                checked={kelompok === k}
                onChange={() => setKelompok(k)}
              />
              {k}
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" name="ingatKlasifikasi" />
          {`Ingat klasifikasi ini KHUSUS untuk NIP ${raw.nip} bulan berikutnya (bukan untuk semua orang dengan Jenis/Status Pegawai yang sama - kombinasi teks yang sama bisa berarti beda untuk orang berbeda)`}
        </label>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Nama</label>
          <input
            name="nama"
            defaultValue={raw.namaDenganGelar || raw.namaTanpaGelar}
            required
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Jenis Kelamin</label>
          <select
            name="jenisKelamin"
            defaultValue={raw.jenisKelaminRaw === "L" || raw.jenisKelaminRaw === "P" ? raw.jenisKelaminRaw : ""}
            required
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Pilih
            </option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Tanggal Lahir (opsional)</label>
          <input
            type="date"
            name="tanggalLahir"
            defaultValue={toDateInputValue(raw.tanggalLahir as unknown as string)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Tanggal Mulai Kerja (TMT)</label>
          <input
            type="date"
            name="tanggalMulaiKerja"
            defaultValue={toDateInputValue(raw.tanggalMasuk as unknown as string)}
            required
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Pendidikan Terakhir (opsional)</label>
          <input
            name="pendidikanTerakhir"
            defaultValue={raw.pendidikanRaw}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Agama (opsional)</label>
          <input
            name="agama"
            defaultValue={raw.agamaRaw}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {kelompok === "Akademisi Luar UM" ? (
        <div>
          <label className="block text-sm font-medium text-slate-700">Kategori Akademisi Luar</label>
          <select
            name="kategoriAkademisiLuarKode"
            defaultValue={prefill.kategoriAkademisiLuarKode ?? ""}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih kategori...</option>
            {master.kategoriAkademisiLuar.map((k) => (
              <option key={k.kode} value={k.kode}>
                {k.nama}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" name="ingatKategori" />
            {`Ingat kategori ini KHUSUS untuk NIP ${raw.nip} bulan berikutnya`}
          </label>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700">Status Kepegawaian</label>
            <select
              name="statusKepegawaianKode"
              defaultValue={prefill.statusKepegawaianKode ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Pilih status...</option>
              {master.statusKepegawaian.map((s) => (
                <option key={s.kode} value={s.kode}>
                  {s.nama} ({s.kode})
                </option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="ingatStatus" />
              Ingat status ini untuk nilai Status Pegawai mentah yang sama bulan berikutnya
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Golongan</label>
            <select
              name="golonganKode"
              defaultValue={prefill.golonganKode ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">(kosong / Non-ASN)</option>
              {master.golongan.map((g) => (
                <option key={g.kode} value={g.kode}>
                  {g.kode}
                </option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="ingatGolongan" />
              Ingat golongan ini untuk teks Golongan Pangkat mentah yang sama bulan berikutnya
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Jabatan Fungsional / Fungsi</label>
            <SearchableSelect
              key={kelompok}
              name="jabatanPilihan"
              defaultValue={prefill.jabatanPilihan ?? ""}
              placeholder="Cari jabatan fungsional/fungsi..."
              options={
                kelompok === "Dosen"
                  ? master.jabatanFungsionalDosen.map((j) => ({
                      value: `DOSEN:${j.kode}`,
                      label: labelJabatanDosen(j.nama),
                      group: "Jabatan Fungsional Dosen",
                    }))
                  : [
                      ...master.jabatanFungsionalTendik.map((j) => ({
                        value: `TENDIK:${j.kode}`,
                        label: j.jenjang === "-" ? j.jabatanPokok : `${j.jabatanPokok} ${j.jenjang}`,
                        group: "Jabatan Fungsional Tendik",
                      })),
                      ...master.jabatanFungsiUmumPelaksana.map((j) => ({
                        value: `UMUM:${j.kode}`,
                        label: j.nama,
                        group: "Fungsi Umum Pelaksana",
                      })),
                    ]
              }
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="ingatJabatan" />
              {raw.jabatanFungsionalRaw.trim()
                ? "Ingat jabatan ini untuk teks Jabatan Fungsional mentah yang sama bulan berikutnya"
                : `Kolom Jabatan Fungsional kosong di file sumber - ingat jabatan ini KHUSUS untuk NIP ${raw.nip} (bukan untuk semua orang yang kolomnya kosong), sampai file sumber mengisi kolom ini sendiri`}
            </label>
          </div>
        </>
      )}

      {kelompok !== "Akademisi Luar UM" && (
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="adaJabatanTambahan"
              checked={adaJabatanTambahan}
              onChange={(e) => setAdaJabatanTambahan(e.target.checked)}
            />
            Punya Jabatan Tambahan
          </label>

          {adaJabatanTambahan && (
            <div className="mt-3 space-y-3 rounded-md border border-slate-200 p-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Jabatan Tambahan</label>
                <SearchableSelect
                  key={kelompok}
                  name="jabatanTambahanRoleKode"
                  defaultValue={prefill.jabatanTambahanRoleKode ?? ""}
                  placeholder="Cari jabatan tambahan..."
                  options={[...master.jabatanTambahanRole, ...extraJabatanTambahanRole]
                    .filter((r) => r.berlakuUntuk === "Keduanya" || r.berlakuUntuk === kelompok)
                    .map((r) => ({ value: r.kode, label: r.namaRole }))}
                  createLabel="jabatan tambahan baru"
                  onCreateOption={async (query) => {
                    const created = await tambahJabatanTambahanRole(
                      query,
                      kelompok as "Dosen" | "Tendik"
                    );
                    setExtraJabatanTambahanRole((prev) => [
                      ...prev,
                      { ...created, berlakuUntuk: kelompok },
                    ]);
                    return { value: created.kode, label: created.namaRole };
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Tidak ada di daftar? Ketik nama lengkapnya lalu pilih &quot;+ Tambah...&quot; -
                  role baru ini HANYA tersimpan di tool ini, ingat untuk tambahkan juga ke master
                  SIMPEGA kalau memang jabatan resmi.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Unit/Prodi Jabatan Tambahan
                </label>
                <SearchableSelect
                  key={targetOverride[1] ?? "target-default-1"}
                  name="jabatanTambahanTargetKode"
                  defaultValue={targetOverride[1] ?? prefill.jabatanTambahanTargetKode ?? ""}
                  placeholder="Cari unit/prodi..."
                  options={opsiTarget}
                />
                <TambahTargetBaru
                  unitInduk={master.unitInduk}
                  unitAsalFakultas={unitAsalFakultas}
                  onCreated={(h) => targetBaruDibuat(1, h)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status Pengangkatan</label>
                <select
                  name="statusPengangkatan"
                  defaultValue={prefill.statusPengangkatan ?? ""}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Pilih status pengangkatan...</option>
                  {STATUS_PENGANGKATAN.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Tidak ada sinyalnya di data sumber - selalu perlu dipilih manual.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="ingatJabatanTambahan" />
                Ingat resolusi ini (SEMUA jabatan tambahan di bawah: role + unit/prodi + status) untuk
                teks Jabatan Tambahan mentah yang sama bulan berikutnya
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  name="adaJabatanTambahanKedua"
                  checked={adaJabatanTambahanKedua}
                  onChange={(e) => {
                    setAdaJabatanTambahanKedua(e.target.checked);
                    if (!e.target.checked) setAdaJabatanTambahanKetiga(false);
                  }}
                />
                Punya Jabatan Tambahan Kedua (maks {MAKS_JABATAN_TAMBAHAN} per bulan)
              </label>

              {adaJabatanTambahanKedua && renderSlotLanjutan(2)}

              {adaJabatanTambahanKedua && (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    name="adaJabatanTambahanKetiga"
                    checked={adaJabatanTambahanKetiga}
                    onChange={(e) => setAdaJabatanTambahanKetiga(e.target.checked)}
                  />
                  Punya Jabatan Tambahan Ketiga
                </label>
              )}

              {adaJabatanTambahanKedua && adaJabatanTambahanKetiga && renderSlotLanjutan(3)}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">Unit Kerja</label>
        <SearchableSelect
          name="unitAsalKode"
          defaultValue={prefill.unitAsalKode ?? ""}
          placeholder="Cari unit kerja..."
          options={master.unitAsal.map((u) => ({ value: u.kode, label: u.nama }))}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" name="ingatUnit" />
          Ingat unit kerja ini untuk nilai mentah yang sama bulan berikutnya
        </label>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  );
}
