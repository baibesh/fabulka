-- Story methods move from code to the database, edited in the admin; the API seeds them on start.
-- CreateTable
CREATE TABLE "Methodology" (
    "slug" TEXT NOT NULL,
    "texts" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "ageMin" INTEGER NOT NULL,
    "ageMax" INTEGER NOT NULL,
    "structure" JSONB NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "avoid" JSONB NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Methodology_pkey" PRIMARY KEY ("slug")
);
