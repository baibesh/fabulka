-- How a book is laid out: format, a snapshot of its theme, the blocks in order, each page's layout
-- and what render QA found (BookLayout in @fabulka/shared). Books made before have none and keep
-- rendering in the classic look.
ALTER TABLE "Book" ADD COLUMN "layout" JSONB;

-- The theme books from a catalog book get; null picks one by the child's age.
ALTER TABLE "BookTemplate" ADD COLUMN "layoutTheme" TEXT;
