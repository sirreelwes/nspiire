-- The outreach email a creator reads and approves before it reaches a brand.
-- Additive and nullable: existing opportunities simply have no draft yet.
ALTER TABLE "Opportunity" ADD COLUMN     "draftSubject" TEXT,
ADD COLUMN     "draftBody" TEXT,
ADD COLUMN     "draftGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "draftApprovedAt" TIMESTAMP(3);
