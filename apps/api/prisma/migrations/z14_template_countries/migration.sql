-- Catalog books listed only in some countries (reference.countries codes); empty: everywhere.
ALTER TABLE "BookTemplate" ADD COLUMN "countries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The two books about Kazakhstan are listed only there.
UPDATE "BookTemplate" SET "countries" = ARRAY['KZ']::TEXT[]
WHERE "slug" IN ('nauryz-new-friend', 'snow-leopard-alatau');
