-- Country ownership of content (admin, country managers).
--
-- Examples and catalog books: their countries can name where they show (include, as before) or
-- where they do not ("everywhere except…"). Every existing row keeps include, so nothing changes.
CREATE TYPE "CountriesMode" AS ENUM ('include', 'exclude');
ALTER TABLE "Example" ADD COLUMN "countriesMode" "CountriesMode" NOT NULL DEFAULT 'include';
ALTER TABLE "BookTemplate" ADD COLUMN "countriesMode" "CountriesMode" NOT NULL DEFAULT 'include';

-- Orders: the country they were ordered from, for country managers. The API fills it in for
-- existing orders on start (OrdersService: from the book's country, else the only print country);
-- an order it cannot place stays null and only global staff see it.
ALTER TABLE "Order" ADD COLUMN "country" TEXT;
CREATE INDEX "Order_country_idx" ON "Order"("country");

-- Catalog samples per country: '' is the global sample (every existing row), an ISO code a
-- country's own, which its visitors see first.
ALTER TABLE "TemplateSample" ADD COLUMN "country" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TemplateSample" DROP CONSTRAINT "TemplateSample_pkey";
ALTER TABLE "TemplateSample" ADD CONSTRAINT "TemplateSample_pkey" PRIMARY KEY ("templateId", "language", "country");
