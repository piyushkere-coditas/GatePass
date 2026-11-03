-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'SENDING';

-- DropIndex
DROP INDEX "User_googleSub_key";

-- DropIndex
DROP INDEX "EmailOutbox_status_sendAfter_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "googleSub";

-- AlterTable
ALTER TABLE "EmailOutbox" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginCode_email_createdAt_idx" ON "LoginCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginCode_requestIp_createdAt_idx" ON "LoginCode"("requestIp", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_sendAfter_priority_idx" ON "EmailOutbox"("status", "sendAfter", "priority");

