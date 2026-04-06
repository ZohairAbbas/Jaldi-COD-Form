-- AlterTable
ALTER TABLE "GlobalBuyer" ADD COLUMN     "lastCity" TEXT,
ADD COLUMN     "lastProvince" TEXT,
ADD COLUMN     "preferredPaymentMethod" TEXT;

-- CreateTable
CREATE TABLE "DeviceFingerprint" (
    "id" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceFingerprint_fingerprintId_idx" ON "DeviceFingerprint"("fingerprintId");

-- CreateIndex
CREATE INDEX "DeviceFingerprint_phone_idx" ON "DeviceFingerprint"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceFingerprint_fingerprintId_phone_key" ON "DeviceFingerprint"("fingerprintId", "phone");
