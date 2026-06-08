-- ExploreSession
CREATE TABLE "ExploreSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "exploreType" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "generationsCount" INTEGER NOT NULL DEFAULT 0,
  "totalPaths" INTEGER NOT NULL DEFAULT 0,
  "prunedPaths" INTEGER NOT NULL DEFAULT 0,
  "budgetLimit" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
  "budgetUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExploreSession_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ExploreSession" ADD CONSTRAINT "ExploreSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ExploreSession_userId_idx" ON "ExploreSession"("userId");
CREATE INDEX "ExploreSession_status_idx" ON "ExploreSession"("status");
CREATE INDEX "ExploreSession_mode_idx" ON "ExploreSession"("mode");

-- ExplorePath
CREATE TABLE "ExplorePath" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "hypothesis" TEXT NOT NULL,
  "category" TEXT,
  "score" DOUBLE PRECISION,
  "scoreDetails" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "roundsAlive" INTEGER NOT NULL DEFAULT 0,
  "parentPathId" TEXT,
  "generatedBy" TEXT NOT NULL,
  "evaluations" JSONB,
  "openQuestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorePath_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ExplorePath" ADD CONSTRAINT "ExplorePath_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ExploreSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorePath" ADD CONSTRAINT "ExplorePath_parentPathId_fkey"
  FOREIGN KEY ("parentPathId") REFERENCES "ExplorePath"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ExplorePath_sessionId_idx" ON "ExplorePath"("sessionId");
CREATE INDEX "ExplorePath_sessionId_generation_idx" ON "ExplorePath"("sessionId", "generation");
CREATE INDEX "ExplorePath_status_idx" ON "ExplorePath"("status");
CREATE INDEX "ExplorePath_score_idx" ON "ExplorePath"("score");

-- ExploreInsight
CREATE TABLE "ExploreInsight" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT,
  "debateId" TEXT,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExploreInsight_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ExploreInsight" ADD CONSTRAINT "ExploreInsight_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ExploreSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ExploreInsight_sessionId_idx" ON "ExploreInsight"("sessionId");
CREATE INDEX "ExploreInsight_debateId_idx" ON "ExploreInsight"("debateId");
CREATE INDEX "ExploreInsight_type_idx" ON "ExploreInsight"("type");

-- InvestorProfile
CREATE TABLE "InvestorProfile" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "linkedinUrl" TEXT,
  "crunchbaseUrl" TEXT,
  "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "description" TEXT,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestorProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvestorProfile_source_idx" ON "InvestorProfile"("source");

-- InvestorMatch
CREATE TABLE "InvestorMatch" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "investorId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "matchScore" DOUBLE PRECISION NOT NULL,
  "matchReason" TEXT NOT NULL,
  "outreachStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "emailSentAt" TIMESTAMP(3),
  "emailBody" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestorMatch_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "InvestorMatch" ADD CONSTRAINT "InvestorMatch_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestorMatch" ADD CONSTRAINT "InvestorMatch_investorId_fkey"
  FOREIGN KEY ("investorId") REFERENCES "InvestorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestorMatch" ADD CONSTRAINT "InvestorMatch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "InvestorMatch_projectId_idx" ON "InvestorMatch"("projectId");
CREATE INDEX "InvestorMatch_investorId_idx" ON "InvestorMatch"("investorId");
CREATE INDEX "InvestorMatch_outreachStatus_idx" ON "InvestorMatch"("outreachStatus");

-- PromptPattern
CREATE TABLE "PromptPattern" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "pattern" TEXT NOT NULL,
  "frequency" INTEGER NOT NULL DEFAULT 1,
  "effectiveness" DOUBLE PRECISION,
  "weekTag" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromptPattern_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PromptPattern_role_idx" ON "PromptPattern"("role");
CREATE INDEX "PromptPattern_weekTag_idx" ON "PromptPattern"("weekTag");
