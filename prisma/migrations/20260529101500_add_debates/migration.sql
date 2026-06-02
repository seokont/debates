-- CreateEnum
CREATE TYPE "DebateMode" AS ENUM ('CONVERGENT', 'DIVERGENT', 'GEOPOLITICAL');

-- CreateEnum
CREATE TYPE "DebateStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DebateTier" AS ENUM ('SURFACE', 'VERIFIED', 'DEEP');

-- CreateEnum
CREATE TYPE "DebateAiModel" AS ENUM ('GPT', 'CLAUDE', 'GEMINI', 'GROK');

-- CreateTable
CREATE TABLE "Debate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "slug" TEXT NOT NULL,
    "originalThesis" TEXT NOT NULL,
    "currentThesis" TEXT NOT NULL,
    "mode" "DebateMode" NOT NULL,
    "status" "DebateStatus" NOT NULL DEFAULT 'PENDING',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "tier" "DebateTier" NOT NULL DEFAULT 'SURFACE',
    "models" "DebateAiModel"[] NOT NULL DEFAULT ARRAY[]::"DebateAiModel"[],
    "roundCount" INTEGER NOT NULL DEFAULT 0,
    "maxRounds" INTEGER NOT NULL DEFAULT 6,
    "quietMode" BOOLEAN NOT NULL DEFAULT false,
    "layer1Summary" TEXT,
    "layer2Summary" TEXT,
    "finalSummary" TEXT,
    "finalThesis" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebateRound" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "model" "DebateAiModel" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebateRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebateEvent" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Debate_slug_key" ON "Debate"("slug");

-- CreateIndex
CREATE INDEX "Debate_userId_idx" ON "Debate"("userId");

-- CreateIndex
CREATE INDEX "Debate_visibility_idx" ON "Debate"("visibility");

-- CreateIndex
CREATE INDEX "Debate_status_idx" ON "Debate"("status");

-- CreateIndex
CREATE INDEX "Debate_createdAt_idx" ON "Debate"("createdAt");

-- CreateIndex
CREATE INDEX "DebateRound_debateId_idx" ON "DebateRound"("debateId");

-- CreateIndex
CREATE INDEX "DebateRound_debateId_roundNumber_idx" ON "DebateRound"("debateId", "roundNumber");

-- CreateIndex
CREATE INDEX "DebateEvent_debateId_idx" ON "DebateEvent"("debateId");

-- CreateIndex
CREATE INDEX "DebateEvent_debateId_createdAt_idx" ON "DebateEvent"("debateId", "createdAt");

-- AddForeignKey
ALTER TABLE "Debate" ADD CONSTRAINT "Debate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebateRound" ADD CONSTRAINT "DebateRound_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebateEvent" ADD CONSTRAINT "DebateEvent_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
