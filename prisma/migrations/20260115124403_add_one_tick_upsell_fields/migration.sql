-- AlterTable
ALTER TABLE "Upsell" ADD COLUMN     "backgroundColor" TEXT,
ADD COLUMN     "borderColor" TEXT,
ADD COLUMN     "borderRadius" INTEGER,
ADD COLUMN     "borderStyle" TEXT,
ADD COLUMN     "borderWidth" INTEGER,
ADD COLUMN     "checkboxText" TEXT,
ADD COLUMN     "descriptionColor" TEXT,
ADD COLUMN     "descriptionText" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "preselectUpsell" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "textColor" TEXT,
ADD COLUMN     "upsellPrice" DOUBLE PRECISION,
ADD COLUMN     "upsellTitle" TEXT;
