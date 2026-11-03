-- Money as { amount in minor units, currency }: orders and purchases snapshot their currency, lines,
-- totals and the rate to USD; exchange rates for reports; a payment provider seam.
--
-- Safe on existing rows: new columns are added nullable, filled from the old tenge/dollar columns
-- (tenge × 100 = tiyn; dollars × 100 = cents), every order and purchase is reconciled against its old
-- amounts, and only then are the new columns made NOT NULL and the old ones dropped. Any mismatch
-- raises and rolls the whole migration back, leaving the old columns untouched.

BEGIN;

-- ---- Orders ---------------------------------------------------------------------------------------

ALTER TABLE "Order"
ADD COLUMN "currency" TEXT,
ADD COLUMN "itemsAmount" INTEGER,
ADD COLUMN "deliveryAmount" INTEGER,
ADD COLUMN "totalAmount" INTEGER,
ADD COLUMN "fxToUsd" DECIMAL(24,12),
ADD COLUMN "deliveryCost" INTEGER,
ADD COLUMN "deliveryCostCurrency" TEXT,
ADD COLUMN "deliveryCostFxToUsd" DECIMAL(24,12),
ADD COLUMN "paymentProvider" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "paymentId" TEXT,
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'paid';

-- Every order so far was priced in tenge (print was tenge-only).
UPDATE "Order" SET
  "currency" = 'KZT',
  "itemsAmount" = "booksKzt" * 100,
  "deliveryAmount" = "deliveryKzt" * 100,
  "totalAmount" = "totalKzt" * 100,
  "paymentId" = 'manual_' || "id";

CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "bookId" TEXT NOT NULL,
    "format" TEXT,
    "cover" "Cover" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "costCurrency" TEXT,
    "costFxToUsd" DECIMAL(24,12),

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- One line per order: its book, the format frozen in its layout, cover and quantity.
INSERT INTO "OrderLine" ("id", "orderId", "position", "bookId", "format", "cover", "quantity", "unitAmount", "lineAmount")
SELECT 'line_' || o."id", o."id", 0, o."bookId", o."layout" -> 'format' ->> 'id', o."cover", o."quantity",
       (o."booksKzt" * 100) / GREATEST(o."quantity", 1), o."booksKzt" * 100
FROM "Order" o;

DO $$
DECLARE bad INTEGER;
BEGIN
  SELECT count(*) INTO bad FROM "Order" o
  WHERE o."totalAmount" IS DISTINCT FROM o."totalKzt" * 100
     OR o."totalAmount" <> o."itemsAmount" + o."deliveryAmount"
     OR o."itemsAmount" <> (SELECT coalesce(sum(l."lineAmount"), 0) FROM "OrderLine" l WHERE l."orderId" = o."id")
     OR EXISTS (SELECT 1 FROM "OrderLine" l WHERE l."orderId" = o."id" AND l."unitAmount" * l."quantity" <> l."lineAmount");
  IF bad > 0 THEN
    RAISE EXCEPTION 'money migration: % orders do not reconcile with their tenge totals', bad;
  END IF;
END $$;

ALTER TABLE "Order"
ALTER COLUMN "currency" SET NOT NULL,
ALTER COLUMN "itemsAmount" SET NOT NULL,
ALTER COLUMN "deliveryAmount" SET NOT NULL,
ALTER COLUMN "totalAmount" SET NOT NULL,
DROP COLUMN "booksKzt",
DROP COLUMN "deliveryKzt",
DROP COLUMN "totalKzt";

CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
CREATE INDEX "Order_paymentId_idx" ON "Order"("paymentId");
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Purchases ------------------------------------------------------------------------------------

ALTER TABLE "Credit"
ADD COLUMN "kind" TEXT,
ADD COLUMN "currency" TEXT,
ADD COLUMN "unitAmount" INTEGER,
ADD COLUMN "amount" INTEGER,
ADD COLUMN "fxToUsd" DECIMAL(24,12),
ADD COLUMN "paymentProvider" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "paymentId" TEXT,
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'paid';

DO $$
DECLARE bad INTEGER;
BEGIN
  -- A purchase was in one currency: tenge or dollars, never both.
  SELECT count(*) INTO bad FROM "Credit" WHERE "priceKzt" > 0 AND "priceUsd" > 0;
  IF bad > 0 THEN
    RAISE EXCEPTION 'money migration: % purchases have both a tenge and a dollar price', bad;
  END IF;
END $$;

UPDATE "Credit" SET
  "currency" = CASE WHEN "priceUsd" > 0 THEN 'USD' ELSE 'KZT' END,
  "amount" = CASE WHEN "priceUsd" > 0 THEN round("priceUsd"::numeric * 100)::INTEGER ELSE "priceKzt" * 100 END,
  "paymentId" = 'manual_' || "id";
UPDATE "Credit" SET "unitAmount" = "amount" / GREATEST("books", 1);

DO $$
DECLARE bad INTEGER;
BEGIN
  SELECT count(*) INTO bad FROM "Credit"
  WHERE ("currency" = 'KZT' AND "amount" <> "priceKzt" * 100)
     OR ("currency" = 'USD' AND abs("amount" - "priceUsd"::numeric * 100) >= 0.5)
     OR "unitAmount" * GREATEST("books", 1) <> "amount";
  IF bad > 0 THEN
    RAISE EXCEPTION 'money migration: % purchases do not reconcile with their old prices', bad;
  END IF;
END $$;

ALTER TABLE "Credit"
ALTER COLUMN "currency" SET NOT NULL,
ALTER COLUMN "unitAmount" SET NOT NULL,
ALTER COLUMN "amount" SET NOT NULL,
DROP COLUMN "priceKzt",
DROP COLUMN "priceUsd";

CREATE INDEX "Credit_paymentId_idx" ON "Credit"("paymentId");

-- ---- Exchange rates (reports only) ------------------------------------------------------------------

CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "rateToUsd" DECIMAL(24,12) NOT NULL,
    "source" TEXT NOT NULL,
    "setBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FxRate_currency_date_idx" ON "FxRate"("currency", "date");
CREATE UNIQUE INDEX "FxRate_date_currency_source_key" ON "FxRate"("date", "currency", "source");

COMMIT;
