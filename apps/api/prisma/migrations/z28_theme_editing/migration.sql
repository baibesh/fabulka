-- Themes edited by hand in the admin: a published theme's saved edits wait in "draft" until staff
-- publish them (books and pickers keep the published version), and a copy of a theme names the one
-- it was duplicated from.
ALTER TABLE "Theme" ADD COLUMN "draft" JSONB;
ALTER TABLE "Theme" ADD COLUMN "basedOn" TEXT;

-- Every action on a theme with the theme as it was after it: the editor loads an old version.
CREATE TABLE "ThemeHistory" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "theme" JSONB NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '[]',
    "who" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThemeHistory_themeId_createdAt_idx" ON "ThemeHistory"("themeId", "createdAt");
