-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "disableSpecificProducts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disabledProductIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "disabledProductTitles" JSONB NOT NULL DEFAULT '[]';
