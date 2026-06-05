-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TELEGRAM', 'EMAIL', 'WHATSAPP');

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationChannel_userId_idx" ON "NotificationChannel"("userId");

-- CreateIndex
CREATE INDEX "NotificationChannel_type_idx" ON "NotificationChannel"("type");

-- CreateIndex
CREATE INDEX "NotificationChannel_isActive_idx" ON "NotificationChannel"("isActive");

-- CreateIndex
CREATE INDEX "NotificationChannel_userId_type_isActive_idx" ON "NotificationChannel"("userId", "type", "isActive");

-- AddForeignKey
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
