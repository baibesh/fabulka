import type { Metadata } from "next";
import { Suspense } from "react";
import { BookView } from "@/components/book/book-view";
import type { UiLocale } from "@/i18n/messages";
import { T } from "@/i18n/t";
import { PageContainer } from "@/components/ui/page";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMetadata, publicPages } from "@/lib/seo-data";

/**
 * Example books staff picked are public pages (their title and cover by default, staff may set
 * their own); any other book is a family's own and stays out of search.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/books/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const example = (await publicPages()).examples.find((book) => book.id === id);
  if (!example) return { robots: { index: false, follow: false } };
  return pageMetadata(locale as UiLocale, `book:${id}`, { label: example.title, coverUrl: example.heroImageUrl });
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
