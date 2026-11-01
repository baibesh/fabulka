-- The blocks a catalog book's books get (TemplateBlocks in @fabulka/shared); null: the default ones.
ALTER TABLE "BookTemplate" ADD COLUMN "blocks" JSONB;
