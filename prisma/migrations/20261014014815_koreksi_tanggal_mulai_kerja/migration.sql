-- CreateTable
CREATE TABLE "koreksi_tanggal_mulai_kerja" (
    "id" SERIAL NOT NULL,
    "nip" TEXT NOT NULL,
    "tanggalMulaiKerja" DATE NOT NULL,
    "alasan" TEXT NOT NULL,
    "dibuatOlehNama" TEXT NOT NULL,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "koreksi_tanggal_mulai_kerja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "koreksi_tanggal_mulai_kerja_nip_key" ON "koreksi_tanggal_mulai_kerja"("nip");
