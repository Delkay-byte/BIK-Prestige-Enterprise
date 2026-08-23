-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "status" TEXT NOT NULL DEFAULT 'active',
    "passwordHash" TEXT NOT NULL,
    "forcePasswordReset" BOOLEAN NOT NULL DEFAULT false,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "contactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyAccount" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "openingMomoFloat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "openingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCashIn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCashOut" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCashReceived" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCashPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commission" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingMomoFloat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "calculatedMomoVariance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "calculatedCashVariance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reconciliationNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Expense" (
    "id" TEXT NOT NULL,
    "dailyAccountId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SusuAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dailyContribution" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cardCustody" TEXT NOT NULL DEFAULT 'customer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SusuAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SusuCycle" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "dailyContribution" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "commissionCharged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SusuCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contribution" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "collectionDate" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "collectorId" TEXT,
    "recordedById" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContributionAllocation" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "cycleDay" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Withdrawal" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "requestedAmount" DECIMAL(65,30) NOT NULL,
    "commissionAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "remainingBalance" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "authorizedById" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Commission" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "basis" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardFee" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "recordedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Collector" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CollectorCustomerAssignment" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CollectorCustomerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CollectorRemittance" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "expectedAmount" DECIMAL(65,30) NOT NULL,
    "remittedAmount" DECIMAL(65,30) NOT NULL,
    "variance" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recordedById" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectorRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "public"."User"("status");

-- CreateIndex
CREATE INDEX "User_locationId_idx" ON "public"."User"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "public"."Location"("code");

-- CreateIndex
CREATE INDEX "Location_status_idx" ON "public"."Location"("status");

-- CreateIndex
CREATE INDEX "Location_code_idx" ON "public"."Location"("code");

-- CreateIndex
CREATE INDEX "DailyAccount_businessDate_idx" ON "public"."DailyAccount"("businessDate");

-- CreateIndex
CREATE INDEX "DailyAccount_locationId_idx" ON "public"."DailyAccount"("locationId");

-- CreateIndex
CREATE INDEX "DailyAccount_workerId_idx" ON "public"."DailyAccount"("workerId");

-- CreateIndex
CREATE INDEX "DailyAccount_status_idx" ON "public"."DailyAccount"("status");

-- CreateIndex
CREATE INDEX "DailyAccount_submittedAt_idx" ON "public"."DailyAccount"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAccount_locationId_businessDate_key" ON "public"."DailyAccount"("locationId", "businessDate");

-- CreateIndex
CREATE INDEX "Expense_dailyAccountId_idx" ON "public"."Expense"("dailyAccountId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerId_key" ON "public"."Customer"("customerId");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "public"."Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_customerId_idx" ON "public"."Customer"("customerId");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "public"."Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "SusuAccount_accountId_key" ON "public"."SusuAccount"("accountId");

-- CreateIndex
CREATE INDEX "SusuAccount_customerId_idx" ON "public"."SusuAccount"("customerId");

-- CreateIndex
CREATE INDEX "SusuAccount_accountId_idx" ON "public"."SusuAccount"("accountId");

-- CreateIndex
CREATE INDEX "SusuAccount_status_idx" ON "public"."SusuAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SusuCycle_accountId_cycleNumber_key" ON "public"."SusuCycle"("accountId", "cycleNumber");

-- CreateIndex
CREATE INDEX "SusuCycle_accountId_idx" ON "public"."SusuCycle"("accountId");

-- CreateIndex
CREATE INDEX "SusuCycle_status_idx" ON "public"."SusuCycle"("status");

-- CreateIndex
CREATE INDEX "SusuCycle_startDate_idx" ON "public"."SusuCycle"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_referenceId_key" ON "public"."Contribution"("referenceId");

-- CreateIndex
CREATE INDEX "Contribution_accountId_idx" ON "public"."Contribution"("accountId");

-- CreateIndex
CREATE INDEX "Contribution_cycleId_idx" ON "public"."Contribution"("cycleId");

-- CreateIndex
CREATE INDEX "Contribution_collectionDate_idx" ON "public"."Contribution"("collectionDate");

-- CreateIndex
CREATE INDEX "Contribution_channel_idx" ON "public"."Contribution"("channel");

-- CreateIndex
CREATE INDEX "Contribution_collectorId_idx" ON "public"."Contribution"("collectorId");

-- CreateIndex
CREATE INDEX "Contribution_referenceId_idx" ON "public"."Contribution"("referenceId");

-- CreateIndex
CREATE INDEX "ContributionAllocation_contributionId_idx" ON "public"."ContributionAllocation"("contributionId");

-- CreateIndex
CREATE INDEX "ContributionAllocation_cycleDay_idx" ON "public"."ContributionAllocation"("cycleDay");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_referenceId_key" ON "public"."Withdrawal"("referenceId");

-- CreateIndex
CREATE INDEX "Withdrawal_accountId_idx" ON "public"."Withdrawal"("accountId");

-- CreateIndex
CREATE INDEX "Withdrawal_cycleId_idx" ON "public"."Withdrawal"("cycleId");

-- CreateIndex
CREATE INDEX "Withdrawal_createdAt_idx" ON "public"."Withdrawal"("createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_referenceId_idx" ON "public"."Withdrawal"("referenceId");

-- CreateIndex
CREATE INDEX "Commission_accountId_idx" ON "public"."Commission"("accountId");

-- CreateIndex
CREATE INDEX "Commission_cycleId_idx" ON "public"."Commission"("cycleId");

-- CreateIndex
CREATE INDEX "CardFee_accountId_idx" ON "public"."CardFee"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Collector_userId_key" ON "public"."Collector"("userId");

-- CreateIndex
CREATE INDEX "Collector_status_idx" ON "public"."Collector"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CollectorCustomerAssignment_collectorId_accountId_key" ON "public"."CollectorCustomerAssignment"("collectorId", "accountId");

-- CreateIndex
CREATE INDEX "CollectorCustomerAssignment_collectorId_idx" ON "public"."CollectorCustomerAssignment"("collectorId");

-- CreateIndex
CREATE INDEX "CollectorCustomerAssignment_customerId_idx" ON "public"."CollectorCustomerAssignment"("customerId");

-- CreateIndex
CREATE INDEX "CollectorCustomerAssignment_accountId_idx" ON "public"."CollectorCustomerAssignment"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectorRemittance_referenceId_key" ON "public"."CollectorRemittance"("referenceId");

-- CreateIndex
CREATE INDEX "CollectorRemittance_collectorId_idx" ON "public"."CollectorRemittance"("collectorId");

-- CreateIndex
CREATE INDEX "CollectorRemittance_status_idx" ON "public"."CollectorRemittance"("status");

-- CreateIndex
CREATE INDEX "CollectorRemittance_createdAt_idx" ON "public"."CollectorRemittance"("createdAt");

-- CreateIndex
CREATE INDEX "CollectorRemittance_referenceId_idx" ON "public"."CollectorRemittance"("referenceId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyAccount" ADD CONSTRAINT "DailyAccount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyAccount" ADD CONSTRAINT "DailyAccount_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_dailyAccountId_fkey" FOREIGN KEY ("dailyAccountId") REFERENCES "public"."DailyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SusuAccount" ADD CONSTRAINT "SusuAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SusuCycle" ADD CONSTRAINT "SusuCycle_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."SusuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contribution" ADD CONSTRAINT "Contribution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."SusuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contribution" ADD CONSTRAINT "Contribution_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."SusuCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contribution" ADD CONSTRAINT "Contribution_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "public"."Collector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContributionAllocation" ADD CONSTRAINT "ContributionAllocation_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "public"."Contribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Withdrawal" ADD CONSTRAINT "Withdrawal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."SusuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Withdrawal" ADD CONSTRAINT "Withdrawal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."SusuCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Commission" ADD CONSTRAINT "Commission_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."SusuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Commission" ADD CONSTRAINT "Commission_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."SusuCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardFee" ADD CONSTRAINT "CardFee_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."SusuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Collector" ADD CONSTRAINT "Collector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectorCustomerAssignment" ADD CONSTRAINT "CollectorCustomerAssignment_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "public"."Collector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectorCustomerAssignment" ADD CONSTRAINT "CollectorCustomerAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectorCustomerAssignment" ADD CONSTRAINT "CollectorCustomerAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."SusuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectorRemittance" ADD CONSTRAINT "CollectorRemittance_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "public"."Collector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
