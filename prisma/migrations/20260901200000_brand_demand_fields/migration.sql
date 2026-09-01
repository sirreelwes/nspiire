-- What a brand on the interest list is actually looking for. This is the
-- demand signal that says which creators to recruit next.
ALTER TABLE "BrandAccount" ADD COLUMN     "lookingFor" TEXT,
ADD COLUMN     "budgetRange" TEXT,
ADD COLUMN     "timing" TEXT;
