-- AlterTable
ALTER TABLE "tabletops" ADD COLUMN IF NOT EXISTS "exerciseJson" JSONB,
ADD COLUMN IF NOT EXISTS "scenarioType" TEXT,
ADD COLUMN IF NOT EXISTS "industry" TEXT,
ADD COLUMN IF NOT EXISTS "maturityLevel" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "generation_usages" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tabletopId" UUID,
    "entitlementType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "paid_credit_ledger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paid_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "generation_usages_userId_idx" ON "generation_usages"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "generation_usages_tabletopId_idx" ON "generation_usages"("tabletopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "generation_usages_entitlementType_idx" ON "generation_usages"("entitlementType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "paid_credit_ledger_userId_idx" ON "paid_credit_ledger"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "paid_credit_ledger_reason_idx" ON "paid_credit_ledger"("reason");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_userId_idx" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generation_usages_userId_fkey') THEN
    ALTER TABLE "generation_usages" ADD CONSTRAINT "generation_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generation_usages_tabletopId_fkey') THEN
    ALTER TABLE "generation_usages" ADD CONSTRAINT "generation_usages_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_credit_ledger_userId_fkey') THEN
    ALTER TABLE "paid_credit_ledger" ADD CONSTRAINT "paid_credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_userId_fkey') THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
