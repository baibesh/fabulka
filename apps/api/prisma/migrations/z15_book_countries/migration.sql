-- Featured examples shown only in some countries (reference.countries codes); empty: as the
-- catalog book's countries say, or everywhere for a story of its own.
ALTER TABLE "Book" ADD COLUMN "countries" TEXT[] DEFAULT ARRAY[]::TEXT[];
