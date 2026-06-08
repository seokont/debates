-- V2 schema migration

-- AlterTable: Debate branches + sourceUrl
ALTER TABLE "Debate" ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "parentId" TEXT,
ADD COLUMN "branchQuestion" TEXT;

ALTER TABLE "Debate" ADD CONSTRAINT "Debate_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Debate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Debate_parentId_idx" ON "Debate"("parentId");

-- ResearchRequest
CREATE TABLE "ResearchRequest" (
  "id" TEXT NOT NULL,
  "debateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "context" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchRequest_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ResearchRequest" ADD CONSTRAINT "ResearchRequest_debateId_fkey"
  FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchRequest" ADD CONSTRAINT "ResearchRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ResearchRequest_debateId_idx" ON "ResearchRequest"("debateId");
CREATE INDEX "ResearchRequest_userId_idx" ON "ResearchRequest"("userId");
CREATE INDEX "ResearchRequest_status_idx" ON "ResearchRequest"("status");

-- ExpertVerification
CREATE TABLE "ExpertVerification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpertVerification_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ExpertVerification" ADD CONSTRAINT "ExpertVerification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ExpertVerification_userId_idx" ON "ExpertVerification"("userId");
CREATE INDEX "ExpertVerification_status_idx" ON "ExpertVerification"("status");

-- BuildProject
CREATE TABLE "BuildProject" (
  "id" TEXT NOT NULL,
  "debateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "stack" JSONB,
  "deployUrl" TEXT,
  "railwayProjectId" TEXT,
  "equityMap" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuildProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuildProject_slug_key" ON "BuildProject"("slug");
ALTER TABLE "BuildProject" ADD CONSTRAINT "BuildProject_debateId_fkey"
  FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuildProject" ADD CONSTRAINT "BuildProject_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BuildProject_debateId_idx" ON "BuildProject"("debateId");
CREATE INDEX "BuildProject_userId_idx" ON "BuildProject"("userId");
CREATE INDEX "BuildProject_status_idx" ON "BuildProject"("status");

-- BuildProjectEvent
CREATE TABLE "BuildProjectEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "agent" TEXT,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuildProjectEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BuildProjectEvent" ADD CONSTRAINT "BuildProjectEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "BuildProjectEvent_projectId_idx" ON "BuildProjectEvent"("projectId");
CREATE INDEX "BuildProjectEvent_type_idx" ON "BuildProjectEvent"("type");

-- ExchangeTask
CREATE TABLE "ExchangeTask" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "debateId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "rewardCredits" INTEGER,
  "rewardPercent" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "deadline" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeTask_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ExchangeTask" ADD CONSTRAINT "ExchangeTask_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "BuildProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ExchangeTask_projectId_idx" ON "ExchangeTask"("projectId");
CREATE INDEX "ExchangeTask_status_idx" ON "ExchangeTask"("status");
CREATE INDEX "ExchangeTask_level_idx" ON "ExchangeTask"("level");

-- TaskClaim
CREATE TABLE "TaskClaim" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "completionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskClaim_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TaskClaim" ADD CONSTRAINT "TaskClaim_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "ExchangeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskClaim" ADD CONSTRAINT "TaskClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "TaskClaim_taskId_idx" ON "TaskClaim"("taskId");
CREATE INDEX "TaskClaim_userId_idx" ON "TaskClaim"("userId");
CREATE INDEX "TaskClaim_status_idx" ON "TaskClaim"("status");
