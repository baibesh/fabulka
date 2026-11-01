-- A book bought in a country priced in dollars keeps its dollar price; tenge purchases keep priceKzt.
-- AlterTable
ALTER TABLE "Credit" ADD COLUMN "priceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
