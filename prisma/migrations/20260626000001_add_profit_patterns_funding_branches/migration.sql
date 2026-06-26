-- Add profitPatterns and fundingBranches to Debate
ALTER TABLE "Debate" ADD COLUMN IF NOT EXISTS "profitPatterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Debate" ADD COLUMN IF NOT EXISTS "fundingBranches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
