-- PatentAlert
CREATE TABLE "PatentAlert" (
  "id" TEXT NOT NULL,
  "debateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priorArtRisk" DOUBLE PRECISION NOT NULL,
  "noveltyScore" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatentAlert_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PatentAlert" ADD CONSTRAINT "PatentAlert_debateId_fkey"
  FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PatentAlert_debateId_idx" ON "PatentAlert"("debateId");
CREATE INDEX "PatentAlert_userId_idx" ON "PatentAlert"("userId");
CREATE INDEX "PatentAlert_status_idx" ON "PatentAlert"("status");

-- OpportunityReport
CREATE TABLE "OpportunityReport" (
  "id" TEXT NOT NULL,
  "debateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "executive" TEXT NOT NULL,
  "methodology" TEXT NOT NULL,
  "findings" JSONB NOT NULL,
  "insights" JSONB NOT NULL,
  "gaps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "score" INTEGER NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityReport_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "OpportunityReport" ADD CONSTRAINT "OpportunityReport_debateId_fkey"
  FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "OpportunityReport_debateId_key" ON "OpportunityReport"("debateId");
CREATE INDEX "OpportunityReport_debateId_idx" ON "OpportunityReport"("debateId");

-- CorporateApiKey
CREATE TABLE "CorporateApiKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "tier" TEXT NOT NULL DEFAULT 'STARTER',
  "rateLimit" INTEGER NOT NULL DEFAULT 100,
  "callsToday" INTEGER NOT NULL DEFAULT 0,
  "callsTotal" INTEGER NOT NULL DEFAULT 0,
  "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorporateApiKey_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CorporateApiKey" ADD CONSTRAINT "CorporateApiKey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CorporateApiKey_keyHash_key" ON "CorporateApiKey"("keyHash");
CREATE INDEX "CorporateApiKey_userId_idx" ON "CorporateApiKey"("userId");
CREATE INDEX "CorporateApiKey_keyHash_idx" ON "CorporateApiKey"("keyHash");
CREATE INDEX "CorporateApiKey_isActive_idx" ON "CorporateApiKey"("isActive");

-- BranchFund
CREATE TABLE "BranchFund" (
  "id" TEXT NOT NULL,
  "debateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountCredits" INTEGER NOT NULL,
  "royaltyPercent" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "returnedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BranchFund_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BranchFund" ADD CONSTRAINT "BranchFund_debateId_fkey"
  FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchFund" ADD CONSTRAINT "BranchFund_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "BranchFund_debateId_idx" ON "BranchFund"("debateId");
CREATE INDEX "BranchFund_userId_idx" ON "BranchFund"("userId");
CREATE INDEX "BranchFund_status_idx" ON "BranchFund"("status");

-- RoyaltyShare
CREATE TABLE "RoyaltyShare" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL,
  "vestingDays" INTEGER NOT NULL DEFAULT 0,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoyaltyShare_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "RoyaltyShare" ADD CONSTRAINT "RoyaltyShare_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoyaltyShare" ADD CONSTRAINT "RoyaltyShare_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "RoyaltyShare_projectId_idx" ON "RoyaltyShare"("projectId");
CREATE INDEX "RoyaltyShare_userId_idx" ON "RoyaltyShare"("userId");
