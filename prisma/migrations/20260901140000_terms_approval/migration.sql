-- Creator approval of deal terms. Additive and nullable: existing deals are
-- simply unapproved, which is the correct default.
ALTER TABLE "Deal" ADD COLUMN     "termsApprovedAt" TIMESTAMP(3),
ADD COLUMN     "termsApprovedFingerprint" TEXT,
ADD COLUMN     "creatorTermsNote" TEXT;
