-- Orders belong to the parent: the visitor key they were made with and, once signed in, the account
-- (anonymous orders move there on sign-in, like books). Existing orders take their book's owner.
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "clientKey" TEXT,
ADD COLUMN "userId" TEXT;

UPDATE "Order" o SET "clientKey" = b."clientKey", "userId" = b."userId"
FROM "Book" b WHERE b."id" = o."bookId";
UPDATE "Order" SET "clientKey" = '' WHERE "clientKey" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "clientKey" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Order_clientKey_idx" ON "Order"("clientKey");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every stage an order reached and when: written when it is placed and on each change in the admin.
-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON "OrderStatusEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one event per existing order, its current stage (paid while the demo timer runs it) when placed.
INSERT INTO "OrderStatusEvent" ("id", "orderId", "status", "createdAt")
SELECT 'backfill_' || o."id", o."id", COALESCE(o."status", 'paid'), o."createdAt" FROM "Order" o;
