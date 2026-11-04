-- Story formats: what a page is made of (a grid of frames and texts tied to frames), as data the
-- admin edits. The API seeds the picture book and the comic on start (DEFAULT_STORY_FORMATS).
CREATE TABLE "StoryFormat" (
    "slug" TEXT NOT NULL,
    "texts" JSONB NOT NULL,
    "ageMin" INTEGER NOT NULL,
    "ageMax" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "grids" JSONB NOT NULL,
    "textRules" JSONB NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "artStyle" TEXT,
    "frameDirection" TEXT,
    "castSheets" INTEGER NOT NULL DEFAULT 0,
    "theme" TEXT,
    "gutterMm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "borderMm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryFormat_pkey" PRIMARY KEY ("slug")
);

-- Every method so far wrote picture books; so did every book.
ALTER TABLE "Methodology" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'picture-book';
ALTER TABLE "Book" ADD COLUMN "storyFormat" TEXT NOT NULL DEFAULT 'picture-book';
-- Side characters and recurring things, described once and (in formats with cast sheets) drawn.
ALTER TABLE "Book" ADD COLUMN "cast" JSONB NOT NULL DEFAULT '[]';

-- Book.pages keeps its old shape for books made before formats ({ page, text, scenePrompt,
-- imagePath, ... }); the API reads it through normalizePage as one full frame and one narration,
-- and writes the new shape the next time it saves the pages. Nothing is rewritten here.

-- The journal links each model call to its pipeline step, page and frame (the pipeline graph).
ALTER TABLE "ModelCall" ADD COLUMN "step" TEXT;
ALTER TABLE "ModelCall" ADD COLUMN "page" INTEGER;
ALTER TABLE "ModelCall" ADD COLUMN "frame" INTEGER;
CREATE INDEX "ModelCall_step_createdAt_idx" ON "ModelCall"("step", "createdAt");
