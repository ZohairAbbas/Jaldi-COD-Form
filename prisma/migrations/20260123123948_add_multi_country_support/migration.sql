-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "enableMultiCountry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supportedCountries" JSONB NOT NULL DEFAULT '[]';
