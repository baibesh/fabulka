import { localePath, type Language } from "@fabulka/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BookView } from "@/components/book/book-view";
import type { UiLocale } from "@/i18n/messages";
import { T } from "@/i18n/t";
import { PageContainer } from "@/components/ui/page";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMetadata, publicPages } from "@/lib/seo-data";

/**
 * Example books are public pages (their title and cover by default, staff may set their own) in
 * their own language: that address is canonical, the story's other language versions are its
 * alternates, and the same book under another language's address stays out of search. Any other
 * book is a family's own and stays out of search.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/books/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const example = (await publicPages()).examples.find((book) => book.id === id);
  if (!example) return { robots: { index: false, follow: false } };
  const own = example.language ?? (locale as UiLocale);
  const metadata = await pageMetadata(own, `book:${id}`, { label: example.title, coverUrl: example.heroImageUrl });
  const versions = example.versions ?? { [own]: id };
  return {
    ...metadata,
    alternates: {
      canonical: localePath(own, `/books/${id}`),
      languages: Object.fromEntries(Object.entries(versions).map(([lang, book]) => [lang, localePath(lang as Language, `/books/${book}`)])),
    },
    ...(own !== locale ? { robots: { index: false, follow: true } } : {}),
  };
}

/** An example book's breadcrumb; nothing for a family's own book. */
async function BookBreadcrumb({ params }: { params: PageProps<"/[locale]/books/[id]">["params"] }) {
  const { locale, id } = await params;
  const example = (await publicPages()).examples.find((book) => book.id === id);
  if (!example?.title) return null;
  return <BreadcrumbJsonLd locale={locale as UiLocale} items={[{ name: example.title, path: `/books/${id}` }]} />;
}

export default function BookPage({ params }: PageProps<"/[locale]/books/[id]">) {
  return (
    <PageContainer width="lg">
      <Suspense fallback={null}>
        <BookBreadcrumb params={params} />
      </Suspense>
      <Suspense
        fallback={
          <p className="text-muted">
            <T k="common.loading" />
          </p>
        }
      >
        <BookView />
      </Suspense>
    </PageContainer>
  );
}
