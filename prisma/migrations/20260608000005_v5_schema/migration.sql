-- DataLicense
CREATE TABLE "DataLicense" (
  "id" TEXT NOT NULL,
  "debateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "licenseType" TEXT NOT NULL DEFAULT 'CC_BY',
  "priceCredits" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "totalUses" INTEGER NOT NULL DEFAULT 0,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataLicense_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DataLicense" ADD CONSTRAINT "DataLicense_debateId_fkey"
  FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataLicense" ADD CONSTRAINT "DataLicense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DataLicense_debateId_key" ON "DataLicense"("debateId");
CREATE INDEX "DataLicense_userId_idx" ON "DataLicense"("userId");
CREATE INDEX "DataLicense_isPublished_idx" ON "DataLicense"("isPublished");
CREATE INDEX "DataLicense_licenseType_idx" ON "DataLicense"("licenseType");

-- DataLicenseUsage
CREATE TABLE "DataLicenseUsage" (
  "id" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataLicenseUsage_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DataLicenseUsage" ADD CONSTRAINT "DataLicenseUsage_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "DataLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "DataLicenseUsage_licenseId_idx" ON "DataLicenseUsage"("licenseId");
CREATE INDEX "DataLicenseUsage_userId_idx" ON "DataLicenseUsage"("userId");

-- CustomModelEndpoint
CREATE TABLE "CustomModelEndpoint" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "encryptedKey" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomModelEndpoint_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CustomModelEndpoint" ADD CONSTRAINT "CustomModelEndpoint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CustomModelEndpoint_userId_idx" ON "CustomModelEndpoint"("userId");
CREATE INDEX "CustomModelEndpoint_isActive_idx" ON "CustomModelEndpoint"("isActive");
