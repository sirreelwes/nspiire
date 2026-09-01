-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "brandToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_brandToken_key" ON "Deal"("brandToken");

-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "toEmail" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "deliveryStatus" TEXT;

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "optedOutAt" TIMESTAMP(3);
