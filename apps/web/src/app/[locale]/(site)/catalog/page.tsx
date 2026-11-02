import type { Metadata } from "next";
import { Suspense } from "react";
import { Catalog } from "@/components/catalog/catalog";
import { CountryData } from "@/components/layout/country-data";
import type { UiLocale } from "@/i18n/messages";
import { T } from "@/i18n/t";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageBreadcrumb } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo-data";

export async function generateMetadata({ params }: PageProps<"/[locale]/catalog">): Promise<Metadata> {
  return pageMetadata((await params).locale as UiLocale, "catalog");
}

export default async function CatalogPage({ params }: PageProps<"/[locale]/catalog">) {
  const locale = (await params).locale as UiLocale;
  return (
    <PageContainer gap="xl">
      <PageBreadcrumb locale={locale} label="nav.catalog" path="/catalog" />
      <PageHeader title={<T k="catalog.title" />} lead={<T k="catalog.lead" />} className="max-w-3xl" />
      {/* The books listed in the visitor's country, with its prices: rendered with its cookie. */}
      <Suspense fallback={<Catalog />}>
        <CountryData locale={locale} need={["templates", "methodologies"]}>
          <Catalog />
        </CountryData>
      </Suspense>
    </PageContainer>
  );
}
