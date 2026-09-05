-- Creator consent to appearing on the roster brands browse.
--
-- DEFAULT false, so every creator that already exists becomes unlisted. They
-- were never asked, and defaulting to true would publish them to paying brands
-- retroactively without their knowledge.
ALTER TABLE "Creator" ADD COLUMN "listedOnRoster" BOOLEAN NOT NULL DEFAULT false;
