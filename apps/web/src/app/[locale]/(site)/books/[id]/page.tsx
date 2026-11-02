import type { Metadata } from "next";
import { Suspense } from "react";
import { BookView } from "@/components/book/book-view";
import type { UiLocale } from "@/i18n/messages";
import { T } from "@/i18n/t";
import { PageContainer } from "@/components/ui/page";
import { alternates } from "@/lib/seo";
import { sitemapEntries } from "@/lib/sitemap-data";

/** Example books staff picked are public pages; any other book is a family's own and stays out of search. */
export async function generateMetadata({ params }: PageProps<"/[locale]/books/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const { examples } = await sitemapEntries();
  if (!examples.some((book) => book.id === id)) return { robots: { index: false, follow: false } };
  return { alternates: alternates(locale as UiLocale, `/books/${id}`) };
}

export default function BookPage() {
  return (
    <PageContainer width="lg">
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
