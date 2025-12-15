-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "buttonAnimation" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "buttonBorderColor" TEXT NOT NULL DEFAULT '#000000',
ADD COLUMN     "buttonBorderRadius" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "buttonBorderWidth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "buttonFontSize" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "buttonIcon" TEXT NOT NULL DEFAULT 'cart',
ADD COLUMN     "buttonShadow" INTEGER NOT NULL DEFAULT 4;
