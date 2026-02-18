-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "blockedUserMessage" TEXT NOT NULL DEFAULT 'You are not allowed to place orders. Please contact support.',
ADD COLUMN     "enableUserBlocking" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BlockedUser" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedUser_shopId_type_idx" ON "BlockedUser"("shopId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedUser_shopId_type_value_key" ON "BlockedUser"("shopId", "type", "value");

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
