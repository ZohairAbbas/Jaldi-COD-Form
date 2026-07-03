-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "allowedCountries" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "enableCountryRestriction" BOOLEAN NOT NULL DEFAULT false;
