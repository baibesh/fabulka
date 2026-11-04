-- The hero drawn from the child's photo, by explicit consent. The book keeps what the hero was drawn
-- from and the photo's record (the consent's version, language and time; when the photo was
-- described, drawn from and deleted; why it was not used) - never the photo itself.
ALTER TABLE "Book" ADD COLUMN "heroSource" TEXT NOT NULL DEFAULT 'description';
ALTER TABLE "Book" ADD COLUMN "heroPhoto" JSONB;

-- A photo uploaded for the hero, waiting for its book (outside the public files): who sent it and
-- the consent they gave. The row and the file are deleted right after the hero sheet is drawn, when
-- the photo is given up, or an hour after upload at the latest.
CREATE TABLE "HeroPhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "consentVersion" INTEGER NOT NULL,
    "consentLanguage" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeroPhoto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HeroPhoto_bookId_key" ON "HeroPhoto"("bookId");
CREATE INDEX "HeroPhoto_createdAt_idx" ON "HeroPhoto"("createdAt");

-- Consent texts the admin edits (admin «Consent»): every save is a new version of one language's
-- clauses; the newest is shown. The API seeds version 1 in every language on start.
CREATE TABLE "ConsentText" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "clauses" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentText_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConsentText_key_language_version_key" ON "ConsentText"("key", "language", "version");
