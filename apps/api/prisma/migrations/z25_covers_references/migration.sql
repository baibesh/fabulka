-- A real cover: its own illustration, SAM's mask of it and its tones, and the back cover's blurb.
ALTER TABLE "Book" ADD COLUMN "coverImagePath" TEXT;
ALTER TABLE "Book" ADD COLUMN "coverSubject" JSONB;
ALTER TABLE "Book" ADD COLUMN "coverTone" JSONB;
ALTER TABLE "Book" ADD COLUMN "blurb" TEXT;

-- The journal records which illustrator references went into each model call.
ALTER TABLE "ModelCall" ADD COLUMN "references" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Illustrator references (admin «References»).
CREATE TABLE "IllustratorReference" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "theme" TEXT,
    "methodology" TEXT,
    "beat" INTEGER,
    "path" TEXT NOT NULL,
    "modelPath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IllustratorReference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IllustratorReference_kind_theme_idx" ON "IllustratorReference"("kind", "theme");
CREATE INDEX "IllustratorReference_kind_methodology_beat_idx" ON "IllustratorReference"("kind", "methodology", "beat");

-- Pages illustrators flag in review.
CREATE TABLE "PageFlag" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PageFlag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PageFlag_resolved_createdAt_idx" ON "PageFlag"("resolved", "createdAt");
CREATE INDEX "PageFlag_bookId_idx" ON "PageFlag"("bookId");
ALTER TABLE "PageFlag" ADD CONSTRAINT "PageFlag_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The new section's right for the superadmin row (the superadmin holds every right anyway), and the
-- illustrator role: references, books for review, themes and methods to read (BUILTIN_ROLES).
UPDATE "StaffRole"
SET "rights" = "rights" || ARRAY['references'], "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'admin' AND NOT 'references' = ANY("rights");

INSERT INTO "StaffRole" ("key", "name", "rights", "scoped", "locked", "updatedAt") VALUES
    ('illustrator', 'Illustrator', ARRAY['references','books.review','themes.read','methodologies.read'], false, false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
