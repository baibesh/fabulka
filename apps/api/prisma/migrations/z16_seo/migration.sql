-- Admin «SEO»: per-page SEO by language (draft and published), the history of every change, and
-- redirects applied by the site's proxy. Global SEO settings live in "Setting" (seo.* keys).
CREATE TABLE "PageSeo" (
    "page" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "publishedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSeo_pkey" PRIMARY KEY ("page","language")
);

CREATE TABLE "SeoHistory" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "who" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoHistory_kind_target_createdAt_idx" ON "SeoHistory"("kind", "target", "createdAt");
CREATE INDEX "SeoHistory_createdAt_idx" ON "SeoHistory"("createdAt");

CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 301,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Redirect_from_key" ON "Redirect"("from");
