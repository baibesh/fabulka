-- The book's layout as it was printed (BookLayout in @fabulka/shared), frozen when the order is
-- placed: later changes to the book or its theme never change what this order prints.
ALTER TABLE "Order" ADD COLUMN "layout" JSONB;
