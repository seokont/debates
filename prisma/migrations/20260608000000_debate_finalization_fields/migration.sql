-- AlterTable
ALTER TABLE "Debate" ADD COLUMN "opportunityScore" INTEGER,
ADD COLUMN "childQuestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "researchGaps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "crossDomainHypotheses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
