-- CreateEnum
CREATE TYPE "DebateEventType" AS ENUM (
  'ATTACK',
  'IMPROVEMENT',
  'VERIFICATION',
  'RESEARCH_GAP',
  'HUMAN',
  'SYSTEM',
  'FINAL'
);

-- CreateEnum
CREATE TYPE "AiAgentName" AS ENUM (
  'GPT',
  'CLAUDE',
  'GEMINI',
  'GROK',
  'SYSTEM'
);

-- CreateEnum
CREATE TYPE "AiAgentRole" AS ENUM (
  'SKEPTIC',
  'SYSTEMS_THINKER',
  'PRACTICIAN',
  'OPPONENT',
  'IMPROVER',
  'VERIFIER'
);

-- AlterTable
ALTER TABLE "DebateEvent"
  ADD COLUMN "agent" "AiAgentName",
  ADD COLUMN "role" "AiAgentRole",
  ADD COLUMN "content" TEXT,
  ADD COLUMN "metadata" JSONB;

UPDATE "DebateEvent"
SET
  "agent" = CASE
    WHEN "type" = 'ATTACK'
      AND "payload" IS NOT NULL
      AND jsonb_typeof("payload") = 'object'
      AND "payload"->>'model' IN ('GPT', 'CLAUDE', 'GEMINI', 'GROK')
      THEN ("payload"->>'model')::"AiAgentName"
    WHEN "type" IN ('IMPROVEMENT', 'VERIFICATION', 'COMPLETED', 'FAILED', 'STARTED', 'QUEUED', 'STOP_CONDITION_MET')
      THEN 'SYSTEM'::"AiAgentName"
    ELSE NULL
  END,
  "role" = CASE
    WHEN "type" = 'ATTACK'
      AND "payload" IS NOT NULL
      AND jsonb_typeof("payload") = 'object'
      AND "payload"->>'role' IN ('SKEPTIC', 'SYSTEMS_THINKER', 'PRACTICIAN', 'OPPONENT')
      THEN ("payload"->>'role')::"AiAgentRole"
    WHEN "type" = 'IMPROVEMENT'
      THEN 'IMPROVER'::"AiAgentRole"
    WHEN "type" = 'VERIFICATION'
      THEN 'VERIFIER'::"AiAgentRole"
    ELSE NULL
  END,
  "content" = CASE
    WHEN "type" = 'ATTACK'
      THEN COALESCE("payload"->>'content', '')
    WHEN "type" = 'IMPROVEMENT'
      THEN COALESCE("payload"->>'improvedThesis', "payload"->>'summary', '')
    WHEN "type" = 'VERIFICATION'
      THEN COALESCE("payload"->>'reason', '')
    WHEN "type" = 'COMPLETED'
      THEN COALESCE("payload"->>'finalSummary', 'Debate completed')
    WHEN "type" = 'FAILED'
      THEN COALESCE("payload"->>'reason', 'Debate failed')
    WHEN "type" = 'STOP_CONDITION_MET'
      THEN COALESCE("payload"->>'reason', 'Stop condition met')
    WHEN "type" = 'CREATED'
      THEN 'Debate created'
    WHEN "type" = 'RESTARTED'
      THEN 'Debate restarted'
    WHEN "type" = 'QUEUED'
      THEN 'Debate queued'
    WHEN "type" = 'STARTED'
      THEN 'Debate started'
    ELSE "type"
  END,
  "metadata" = (
    CASE
      WHEN "payload" IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof("payload") = 'object' THEN "payload"
      ELSE jsonb_build_object('value', "payload")
    END
    || jsonb_build_object('action', "type")
    || CASE
      WHEN "type" = 'VERIFICATION'
        AND "payload" IS NOT NULL
        AND jsonb_typeof("payload") = 'object'
        THEN jsonb_build_object(
          'targetRole', "payload"->>'role',
          'targetModel', "payload"->>'model'
        )
      ELSE '{}'::jsonb
    END
  );

UPDATE "DebateEvent"
SET "content" = ''
WHERE "content" IS NULL;

ALTER TABLE "DebateEvent"
  ALTER COLUMN "content" SET NOT NULL,
  ALTER COLUMN "type" TYPE "DebateEventType" USING (
    CASE
      WHEN "type" = 'ATTACK' THEN 'ATTACK'::"DebateEventType"
      WHEN "type" = 'IMPROVEMENT' THEN 'IMPROVEMENT'::"DebateEventType"
      WHEN "type" = 'VERIFICATION' THEN 'VERIFICATION'::"DebateEventType"
      WHEN "type" = 'COMPLETED' THEN 'FINAL'::"DebateEventType"
      WHEN "type" IN ('CREATED', 'RESTARTED') THEN 'HUMAN'::"DebateEventType"
      ELSE 'SYSTEM'::"DebateEventType"
    END
  ),
  DROP COLUMN "payload";

-- CreateIndex
CREATE INDEX "DebateEvent_type_idx" ON "DebateEvent"("type");

-- CreateIndex
CREATE INDEX "DebateEvent_agent_idx" ON "DebateEvent"("agent");
