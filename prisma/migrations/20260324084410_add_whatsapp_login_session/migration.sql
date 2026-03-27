-- CreateTable
CREATE TABLE "WhatsAppLoginSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppLoginSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppLoginSession_token_key" ON "WhatsAppLoginSession"("token");

-- CreateIndex
CREATE INDEX "WhatsAppLoginSession_token_idx" ON "WhatsAppLoginSession"("token");

-- CreateIndex
CREATE INDEX "WhatsAppLoginSession_phone_status_idx" ON "WhatsAppLoginSession"("phone", "status");

-- CreateIndex
CREATE INDEX "WhatsAppLoginSession_expiresAt_idx" ON "WhatsAppLoginSession"("expiresAt");
