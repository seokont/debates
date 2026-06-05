-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "DebateRound"
  ADD COLUMN "status" "RoundStatus" NOT NULL DEFAULT 'RUNNING',
  ADD COLUMN "inputThesis" TEXT,
  ADD COLUMN "outputThesis" TEXT,
  ADD COLUMN "closedAttacks" JSONB,
  ADD COLUMN "openWeaknesses" JSONB,
  ADD COLUMN "improvementScore" DOUBLE PRECISION,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

WITH ordered_rounds AS (
  SELECT
    r."id",
    COALESCE(
      LAG(r."content") OVER (
        PARTITION BY r."debateId"
        ORDER BY r."roundNumber", r."createdAt"
      ),
      d."originalThesis"
    ) AS "inputThesis"
  FROM "DebateRound" r
  INNER JOIN "Debate" d ON d."id" = r."debateId"
)
UPDATE "DebateRound" r
SET
  "status" = 'COMPLETED',
  "inputThesis" = ordered_rounds."inputThesis",
  "outputThesis" = r."content",
  "startedAt" = r."createdAt",
  "completedAt" = r."updatedAt"
FROM ordered_rounds
WHERE ordered_rounds."id" = r."id";

UPDATE "DebateRound"
SET "inputThesis" = ''
WHERE "inputThesis" IS NULL;

UPDATE "DebateRound"
SET "startedAt" = CURRENT_TIMESTAMP
WHERE "startedAt" IS NULL;

ALTER TABLE "DebateRound"
  ALTER COLUMN "inputThesis" SET NOT NULL,
  ALTER COLUMN "startedAt" SET NOT NULL,
  ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP,
  DROP COLUMN "model",
  DROP COLUMN "content",
  DROP COLUMN "createdAt",
  DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "DebateEvent" ADD COLUMN "roundId" TEXT;

UPDATE "DebateEvent" e
SET "roundId" = r."id"
FROM "DebateRound" r
WHERE e."debateId" = r."debateId"
  AND e."payload" IS NOT NULL
  AND jsonb_typeof(e."payload") = 'object'
  AND e."payload" ? 'roundNumber'
  AND (e."payload"->>'roundNumber') ~ '^[0-9]+$'
  AND (e."payload"->>'roundNumber')::INTEGER = r."roundNumber";

-- CreateIndex
CREATE INDEX "DebateRound_status_idx" ON "DebateRound"("status");

-- CreateIndex
CREATE INDEX "DebateEvent_roundId_idx" ON "DebateEvent"("roundId");

-- CreateIndex
CREATE INDEX "DebateEvent_debateId_roundId_idx" ON "DebateEvent"("debateId", "roundId");

-- AddForeignKey
ALTER TABLE "DebateEvent" ADD CONSTRAINT "DebateEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "DebateRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
