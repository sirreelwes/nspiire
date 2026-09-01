-- Creator sign-in. All columns nullable and additive: existing creators keep
-- working and simply cannot sign in until they are invited and set a password.
ALTER TABLE "Creator" ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- Single-use invite tokens must not collide.
CREATE UNIQUE INDEX "Creator_inviteToken_key" ON "Creator"("inviteToken");
