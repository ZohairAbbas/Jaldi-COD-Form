-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "enableSourceTags" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableVerificationTags" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableRiskTags" BOOLEAN NOT NULL DEFAULT true;
