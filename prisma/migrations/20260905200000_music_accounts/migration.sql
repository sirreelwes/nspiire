-- Management companies and labels join through the brand account model.
--
-- kind defaults to BRAND, so every existing account keeps being what it was.
-- A song is a SoundBrief, one per request, because a manager books for
-- several artists over time; an interest in a creator may point at one.
CREATE TYPE "AccountKind" AS ENUM ('BRAND', 'MUSIC');

ALTER TABLE "BrandAccount"
  ADD COLUMN "kind" "AccountKind" NOT NULL DEFAULT 'BRAND';

CREATE TABLE "SoundBrief" (
  "id"             TEXT NOT NULL,
  "brandAccountId" TEXT NOT NULL,
  "artistName"     TEXT NOT NULL,
  "trackUrl"       TEXT NOT NULL,
  "mood"           TEXT,
  "lookingFor"     TEXT,
  "postingWindow"  TEXT,
  "videosWanted"   INTEGER,
  "budgetRange"    TEXT,
  "releaseDate"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SoundBrief_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SoundBrief_brandAccountId_idx" ON "SoundBrief"("brandAccountId");
ALTER TABLE "SoundBrief"
  ADD CONSTRAINT "SoundBrief_brandAccountId_fkey"
  FOREIGN KEY ("brandAccountId") REFERENCES "BrandAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BrandInterest" ADD COLUMN "briefId" TEXT;
ALTER TABLE "BrandInterest"
  ADD CONSTRAINT "BrandInterest_briefId_fkey"
  FOREIGN KEY ("briefId") REFERENCES "SoundBrief"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
