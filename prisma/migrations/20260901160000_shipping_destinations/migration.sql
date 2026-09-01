-- CreateTable
CREATE TABLE "ShippingDestination" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "instructions" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingDestination_creatorId_idx" ON "ShippingDestination"("creatorId");

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "giftingPolicy" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "shipToId" TEXT;

-- AddForeignKey
ALTER TABLE "ShippingDestination" ADD CONSTRAINT "ShippingDestination_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_shipToId_fkey" FOREIGN KEY ("shipToId") REFERENCES "ShippingDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
