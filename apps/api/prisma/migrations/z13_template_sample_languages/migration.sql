-- A catalog book's sample per language: BookTemplate.sampleBookId (one sample, in Russian) becomes
-- a row of TemplateSample keyed by the sample book's own language.
CREATE TABLE "TemplateSample" (
    "templateId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateSample_pkey" PRIMARY KEY ("templateId","language")
);

CREATE UNIQUE INDEX "TemplateSample_bookId_key" ON "TemplateSample"("bookId");

ALTER TABLE "TemplateSample" ADD CONSTRAINT "TemplateSample_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BookTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateSample" ADD CONSTRAINT "TemplateSample_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Today's samples keep showing: each in its book's language.
INSERT INTO "TemplateSample" ("templateId", "language", "bookId")
SELECT t."id", b."language", b."id"
FROM "BookTemplate" t
JOIN "Book" b ON b."id" = t."sampleBookId";

ALTER TABLE "BookTemplate" DROP CONSTRAINT "BookTemplate_sampleBookId_fkey";
DROP INDEX "BookTemplate_sampleBookId_key";
ALTER TABLE "BookTemplate" DROP COLUMN "sampleBookId";
