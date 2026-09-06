-- Artists and labels join through the brand account model.
--
-- kind defaults to BRAND, so every existing account keeps being what it was.
-- The song brief fields are nullable: a brand never fills them in.
CREATE TYPE "AccountKind" AS ENUM ('BRAND', 'ARTIST');

ALTER TABLE "BrandAccount"
  ADD COLUMN "kind" "AccountKind" NOT NULL DEFAULT 'BRAND',
  ADD COLUMN "trackUrl" TEXT,
  ADD COLUMN "mood" TEXT,
  ADD COLUMN "postingWindow" TEXT,
  ADD COLUMN "videosWanted" INTEGER;
