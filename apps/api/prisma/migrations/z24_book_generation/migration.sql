-- The progress screen's state while a book is being made: the running step, pages being drawn or
-- redrawn, when the step began. Null for books made before it (they are read off their status).
ALTER TABLE "Book" ADD COLUMN "generation" JSONB;
