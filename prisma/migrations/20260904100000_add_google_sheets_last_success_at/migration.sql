-- Add a "last successful sync" timestamp to GoogleSheetsIntegration.
--
-- lastSyncedAt is written on both the success and failure paths, so it records
-- the last ATTEMPT and stays fresh even while an integration is completely
-- broken. This column records only successes, so staleness here is a genuine
-- health signal.
--
-- Additive and nullable: existing rows get NULL, which reads as "no successful
-- sync on record" — correct, since we cannot know retrospectively.
ALTER TABLE "GoogleSheetsIntegration" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
