-- AlterTable
ALTER TABLE "user" ADD COLUMN     "gagalMasuk" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sandiDiubahPada" TIMESTAMP(3),
ADD COLUMN     "terkunciSampai" TIMESTAMP(3);
