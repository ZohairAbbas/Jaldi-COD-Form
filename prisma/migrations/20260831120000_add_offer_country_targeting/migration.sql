-- AlterTable
ALTER TABLE "Upsell" ADD COLUMN     "countryTargeting" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "targetCountries" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Downsell" ADD COLUMN     "countryTargeting" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "targetCountries" JSONB NOT NULL DEFAULT '[]';
