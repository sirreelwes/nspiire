-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SocialAccount_creatorId_idx" ON "SocialAccount"("creatorId");
