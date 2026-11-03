-- A story method may limit words a page itself (a comic's short captions), overriding the age norm.
ALTER TABLE "Methodology" ADD COLUMN "maxWordsPerPage" INTEGER;

-- Books now go up to age 12: the seed methods that stopped at the old cap of 10 cover 11–12 too.
-- A range the admin set to anything else is left alone.
UPDATE "Methodology" SET "ageMax" = 12
WHERE "ageMax" = 10 AND "slug" IN ('sel-emotions', 'growth-mindset', 'mirrors-windows', 'adventure-quest');
