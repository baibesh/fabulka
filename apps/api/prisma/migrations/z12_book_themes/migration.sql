-- Book themes Muse Spark proposed from the owner's brief, with the checks they passed and their
-- sample pages; staff publish or delete them. Curated themes stay in code.
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "theme" JSONB NOT NULL,
    "brief" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "checks" JSONB NOT NULL DEFAULT '[]',
    "previews" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Theme_published_createdAt_idx" ON "Theme"("published", "createdAt");
