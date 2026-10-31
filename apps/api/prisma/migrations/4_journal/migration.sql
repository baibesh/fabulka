-- The journal: model calls (prompts of failed ones only) and errors visitors saw in the browser.
-- CreateTable
CREATE TABLE "ModelCall" (
    "id" TEXT NOT NULL,
    "bookId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "images" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "responseId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "prompt" TEXT,
    "output" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientError" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "code" TEXT,
    "status" INTEGER,
    "locale" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelCall_bookId_idx" ON "ModelCall"("bookId");

-- CreateIndex
CREATE INDEX "ModelCall_createdAt_idx" ON "ModelCall"("createdAt");

-- CreateIndex
CREATE INDEX "ModelCall_kind_status_createdAt_idx" ON "ModelCall"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ClientError_createdAt_idx" ON "ClientError"("createdAt");

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

