import type { Metadata } from "next";
import { Suspense } from "react";
import { Catalog } from "@/components/catalog/catalog";
import { CountryData } from "@/components/layout/country-data";
import type { UiLocale } from "@/i18n/messages";
import { T } from "@/i18n/t";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { alternates } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/catalog">): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Каталог книг",
    description:
      "Персональные детские книги по методикам детского развития: первый день в садике, большие чувства, Наурыз и другие истории, где ваш ребёнок — главный герой.",
    alternates: alternates(locale as UiLocale, "/catalog"),
  };
}

export default async function CatalogPage({ params }: PageProps<"/[locale]/catalog">) {
  const locale = (await params).locale as UiLocale;
  return (
    <PageContainer gap="xl">
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
