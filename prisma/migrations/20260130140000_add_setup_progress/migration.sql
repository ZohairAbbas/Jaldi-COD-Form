-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "setupProgress" JSONB DEFAULT '{"step1Completed": false, "step2Completed": false, "welcomeDismissed": false, "setupGuideDismissed": false}';
