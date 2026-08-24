-- CreateTable
CREATE TABLE "DeviceEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "module" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineTransaction" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_sync',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "failureReason" TEXT,
    "serverResult" TEXT,
    "localTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncStartedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceEnrollment_deviceId_key" ON "DeviceEnrollment"("deviceId");
CREATE INDEX "DeviceEnrollment_userId_idx" ON "DeviceEnrollment"("userId");
CREATE INDEX "DeviceEnrollment_deviceId_idx" ON "DeviceEnrollment"("deviceId");
CREATE INDEX "DeviceEnrollment_status_idx" ON "DeviceEnrollment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineTransaction_idempotencyKey_key" ON "OfflineTransaction"("idempotencyKey");
CREATE INDEX "OfflineTransaction_deviceId_idx" ON "OfflineTransaction"("deviceId");
CREATE INDEX "OfflineTransaction_userId_idx" ON "OfflineTransaction"("userId");
CREATE INDEX "OfflineTransaction_status_idx" ON "OfflineTransaction"("status");
CREATE INDEX "OfflineTransaction_type_idx" ON "OfflineTransaction"("type");
CREATE INDEX "OfflineTransaction_createdAt_idx" ON "OfflineTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "DeviceEnrollment" ADD CONSTRAINT "DeviceEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
