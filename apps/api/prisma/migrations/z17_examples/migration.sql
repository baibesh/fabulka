-- Examples become stories with language versions (admin «Examples»), like a catalog book's samples.
-- Every featured book becomes an example of its own with one version in its language, keeping its
-- countries and the home page's order (newest first); then Book.featured and Book.countries go.
CREATE TABLE "Example" (
    "id" TEXT NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Example_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Example_sortOrder_idx" ON "Example"("sortOrder");

CREATE TABLE "ExampleVersion" (
    "exampleId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExampleVersion_pkey" PRIMARY KEY ("exampleId","language")
);

CREATE UNIQUE INDEX "ExampleVersion_bookId_key" ON "ExampleVersion"("bookId");

ALTER TABLE "ExampleVersion" ADD CONSTRAINT "ExampleVersion_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "Example"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExampleVersion" ADD CONSTRAINT "ExampleVersion_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One example per featured book, never merged: two books from the same catalog book with different
-- heroes are different stories. The example's id is derived from the book's, so it is stable.
INSERT INTO "Example" ("id", "countries", "sortOrder", "createdAt")
SELECT 'ex-' || b."id",
       COALESCE(b."countries", ARRAY[]::TEXT[]),
       (ROW_NUMBER() OVER (ORDER BY b."createdAt" DESC, b."id"))::INTEGER - 1,
       b."createdAt"
FROM "Book" b
WHERE b."featured" = true;

INSERT INTO "ExampleVersion" ("exampleId", "language", "bookId", "createdAt")
SELECT 'ex-' || b."id", b."language", b."id", b."createdAt"
FROM "Book" b
WHERE b."featured" = true;

DROP INDEX IF EXISTS "Book_featured_createdAt_idx";
ALTER TABLE "Book" DROP COLUMN "featured";
ALTER TABLE "Book" DROP COLUMN "countries";
