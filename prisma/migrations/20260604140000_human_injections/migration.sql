-- CreateEnum
CREATE TYPE "InjectionType" AS ENUM ('ATTACK', 'CLARIFY', 'ALTERNATIVE', 'EXAMPLE');

-- CreateEnum
CREATE TYPE "InjectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'USED_IN_ROUND');

-- CreateTable
CREATE TABLE "HumanInjection" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "InjectionType" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "InjectionStatus" NOT NULL DEFAULT 'PENDING',
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanInjection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HumanInjection_debateId_idx" ON "HumanInjection"("debateId");

-- CreateIndex
CREATE INDEX "HumanInjection_userId_idx" ON "HumanInjection"("userId");

-- CreateIndex
CREATE INDEX "HumanInjection_status_idx" ON "HumanInjection"("status");

-- CreateIndex
CREATE INDEX "HumanInjection_createdAt_idx" ON "HumanInjection"("createdAt");

-- AddForeignKey
ALTER TABLE "HumanInjection" ADD CONSTRAINT "HumanInjection_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanInjection" ADD CONSTRAINT "HumanInjection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
