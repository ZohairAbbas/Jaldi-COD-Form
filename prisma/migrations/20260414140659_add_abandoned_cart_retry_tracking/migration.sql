-- AlterTable
ALTER TABLE "AbandonedCart" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastFailedAt" TIMESTAMP(3),
ADD COLUMN     "recoveredOrderId" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;
