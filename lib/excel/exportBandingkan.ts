import ExcelJS from "exceljs";

import type { HasilPerbandinganBatch } from "@/lib/standarisasi/bandingkan";

function cariAlasan(
  catatan: HasilPerbandinganBatch["catatanTersimpan"],
  kategori: string,
  nipUtama: string
): string {
  return catatan.find((c) => c.kategori === kategori && c.nipUtama === nipUtama)?.alasan ?? "";
}

export async function generateBandingkanExport(hasil: HasilPerbandinganBatch): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const wsBaru = workbook.addWorksheet("Orang Baru");
  wsBaru.columns = [
    { header: "NIP", key: "nip", width: 22 },
    { header: "Nama", key: "nama", width: 42 },
    { header: "Jenis Pegawai", key: "jenisPegawai", width: 18 },
    { header: "Status", key: "status", width: 28 },
    { header: "Unit Kerja", key: "unitKerja", width: 35 },
    { header: "Alasan", key: "alasan", width: 40 },
  ];
  wsBaru.getRow(1).font = { bold: true };
  for (const p of hasil.orangBaru) {
    wsBaru.addRow({ ...p, alasan: cariAlasan(hasil.catatanTersimpan, "Baru", p.nip) });
  }

  const wsHilang = workbook.addWorksheet("Orang Hilang");
  wsHilang.columns = [
    { header: "NIP", key: "nip", width: 22 },
    { header: "Nama", key: "nama", width: 42 },
    { header: "Jenis Pegawai", key: "jenisPegawai", width: 18 },
    { header: "Status", key: "status", width: 28 },
    { header: "Unit Kerja", key: "unitKerja", width: 35 },
    { header: "Alasan", key: "alasan", width: 40 },
  ];
  wsHilang.getRow(1).font = { bold: true };
  for (const p of hasil.orangHilang) {
    wsHilang.addRow({ ...p, alasan: cariAlasan(hasil.catatanTersimpan, "Hilang", p.nip) });
  }

  const wsAnomali = workbook.addWorksheet("NIP Anomali");
  wsAnomali.columns = [
    { header: "Nama", key: "nama", width: 42 },
    { header: "NIP yang Terlibat", key: "nipTerlibat", width: 45 },
    { header: "Sumber", key: "sumber", width: 28 },
    { header: "Pola Placeholder SIMPEGA", key: "polaPlaceholder", width: 20 },
    { header: "Sudah Tercatat di Kamus", key: "sudahTercatat", width: 20 },
    { header: "Alasan", key: "alasan", width: 40 },
  ];
  wsAnomali.getRow(1).font = { bold: true };
  for (const a of hasil.nipAnomali) {
    const nipUtama = [...a.anggota].map((x) => x.nip).sort()[0];
    wsAnomali.addRow({
      nama: a.nama,
      nipTerlibat: a.anggota.map((x) => x.nip).join(" | "),
      sumber: a.sumber === "DalamBatch" ? "Duplikat dalam 1 batch" : `NIP berubah antar batch (${Math.round((a.skor ?? 0) * 100)}%)`,
      polaPlaceholder: a.polaPlaceholder ? "Ya" : "Tidak",
      sudahTercatat: a.sudahTercatat ? "Ya" : "Tidak",
      alasan: cariAlasan(hasil.catatanTersimpan, "Anomali", nipUtama),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
