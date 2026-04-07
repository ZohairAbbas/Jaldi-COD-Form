-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "enableSpecificProducts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specificProductIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "specificProductTitles" JSONB NOT NULL DEFAULT '[]';
