-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('CREATOR_RATE', 'PLATFORM_FEE');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'CREATOR_RATE';
