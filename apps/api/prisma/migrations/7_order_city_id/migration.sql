-- Orders refer to the delivery city by its id in reference.cities; "city" keeps the Russian name.
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "cityId" TEXT;
