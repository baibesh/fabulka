import type { Metadata } from "next";
import { Suspense } from "react";
import { BookForm } from "@/components/book/book-form";
import { PriceTag } from "@/components/book/price-tag";
import { CountryData } from "@/components/layout/country-data";
import type { UiLocale } from "@/i18n/messages";
import { T } from "@/i18n/t";
import { BackLink, PageContainer, PageHeader } from "@/components/ui/page";
import { alternates } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/create">): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternates(locale as UiLocale, "/create") };
}

export default async function CreatePage({ params }: PageProps<"/[locale]/create">) {
  const locale = (await params).locale as UiLocale;
  return (
    <PageContainer width="md" gap="lg">
      <BackLink href="/catalog">
        <T k="common.back.catalog" />
      </BackLink>
      {/* The price and the book languages follow the visitor's country: rendered with its cookie. */}
      <Suspense fallback={<CreateContent />}>
        <CountryData locale={locale}>
          <CreateContent />
        </CountryData>
      </Suspense>
    </PageContainer>
  );
}

function CreateContent() {
  return (
    <>
      <PageHeader title={<T k="create.title" />} lead={<T k="create.lead" />}>
        <PriceTag kind="custom" />
      </PageHeader>
      <BookForm />
    </>
  );
}
