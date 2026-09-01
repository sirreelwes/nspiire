-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('SENT', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "BrandAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "contactName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "website" TEXT,
    "brandId" TEXT,
    "membership" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandInterest" (
    "id" TEXT NOT NULL,
    "brandAccountId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "note" TEXT,
    "status" "InterestStatus" NOT NULL DEFAULT 'SENT',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandAccount_email_key" ON "BrandAccount"("email");

-- CreateIndex
CREATE INDEX "BrandAccount_membership_idx" ON "BrandAccount"("membership");

-- CreateIndex
CREATE INDEX "BrandInterest_creatorId_status_idx" ON "BrandInterest"("creatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BrandInterest_brandAccountId_creatorId_key" ON "BrandInterest"("brandAccountId", "creatorId");

-- AddForeignKey
ALTER TABLE "BrandAccount" ADD CONSTRAINT "BrandAccount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandInterest" ADD CONSTRAINT "BrandInterest_brandAccountId_fkey" FOREIGN KEY ("brandAccountId") REFERENCES "BrandAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandInterest" ADD CONSTRAINT "BrandInterest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

