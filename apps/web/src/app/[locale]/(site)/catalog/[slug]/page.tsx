import type { Metadata } from "next";
import { locale as rootLocale } from "next/root-params";
import { Suspense } from "react";
import { TemplateView } from "@/components/catalog/template-view";
import { CountryData } from "@/components/layout/country-data";
import type { UiLocale } from "@/i18n/messages";
import { T } from "@/i18n/t";
import { BackLink, PageContainer } from "@/components/ui/page";
import { alternates } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/catalog/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  return { alternates: alternates(locale as UiLocale, `/catalog/${slug}`) };
}

export default async function TemplatePage({ params }: PageProps<"/[locale]/catalog/[slug]">) {
  // The root param alone: the slug is not known ahead, so it is read inside the Suspense below.
  const locale = (await rootLocale()) as UiLocale;
  return (
    <PageContainer width="md">
      <BackLink href="/catalog">
        <T k="common.back.catalog" />
      </BackLink>
      <Suspense
        fallback={
          <p className="text-muted">
            <T k="common.loading" />
          </p>
        }
      >
        {/* The book itself and its price, rendered with the visitor's country; the slug is read here. */}
        <CountryData locale={locale} need={["methodologies"]} template={params.then((p) => p.slug)}>
          <TemplateView />
        </CountryData>
      </Suspense>
    </PageContainer>
  );
}
