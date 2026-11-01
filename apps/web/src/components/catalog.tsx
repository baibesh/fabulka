"use client";

import { useQuery } from "@/lib/query";
import { Wand2 } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/i18n";
import { listTemplates } from "@/lib/api";
import { useMethodologies } from "@/lib/use-methodologies";
import { useBookPrice } from "@/lib/use-price";
import { PriceSkeleton } from "./price-skeleton";
import { BookCard, bookCardClass } from "./book-card";
import { ErrorNotice } from "./error-notice";
import { Badge } from "./ui/badge";

/** How many books the home page shows before sending visitors to the whole catalog. */
const PREVIEW_BOOKS = 6;

/**
 * Catalog books and the card for a story of your own, with what one more of each costs. `preview`
 * is the strip on the home page: the first books only, side by side and swiped through on phones.
 */
export function Catalog({ preview = false }: { preview?: boolean }) {
  const { t, locale } = useI18n();
  const { data: templates, error } = useQuery({ queryKey: ["templates", locale], queryFn: () => listTemplates(locale) });
  const { data: methods } = useMethodologies();
  const methodName = (slug: string) => methods?.find((m) => m.slug === slug)?.name;
  const templatePrice = useBookPrice("template");
  const customPrice = useBookPrice("custom");

  if (error) return <ErrorNotice error={error} />;
  // A strip that started with the last card alone would stay snapped to it once the books arrive.
  if (preview && !templates) return null;

  return (
    <ul
      data-testid="catalog"
      className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${
        preview ? "max-sm:-mx-4 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:gap-4 max-sm:overflow-x-auto max-sm:scroll-px-4 max-sm:px-4 max-sm:pb-2" : ""
      }`}
    >
      {templates?.slice(0, preview ? PREVIEW_BOOKS : undefined).map((book) => (
        <li key={book.slug} className={preview ? "max-sm:w-[78%] max-sm:shrink-0 max-sm:snap-start" : undefined}>
          <BookCard href={`/catalog/${book.slug}`} data-testid={`template-${book.slug}`} image={book.coverUrl}>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge tone="accent" size="md">
                  {t("common.years", { min: book.ageMin, max: book.ageMax })}
                </Badge>
                {methodName(book.methodology) && <Badge size="md">{methodName(book.methodology)}</Badge>}
              </div>
              <h2 className="text-xl font-extrabold">{book.title}</h2>
              <p className="text-sm text-muted">{book.summary}</p>
              <p className="mt-auto pt-1">
                <Badge data-testid="template-price" tone="solid" size="md">
                  {templatePrice ?? <PriceSkeleton />}
                </Badge>
              </p>
            </div>
          </BookCard>
        </li>
      ))}
      {/* A whole row under the books on wider screens, so it never sits alone under a full row. */}
      <li className={`sm:col-span-2 lg:col-span-3 ${preview ? "max-sm:w-[78%] max-sm:shrink-0 max-sm:snap-start" : ""}`}>
        <Link
          href="/create"
          data-testid="create-own"
          className={`${bookCardClass} items-center justify-center gap-3 rounded-3xl border-dashed p-8 text-center sm:flex-row sm:gap-5 sm:text-left`}
        >
          <Wand2 className="size-10 shrink-0 text-accent transition duration-300 group-hover:-rotate-12 group-hover:scale-110" />
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-extrabold">{t("catalog.own.title")}</h2>
            <p className="text-sm text-muted">{t("catalog.own.text")}</p>
          </div>
          <Badge data-testid="custom-price" tone="solid" size="md" className="sm:ml-auto">
            {customPrice ?? <PriceSkeleton />}
          </Badge>
        </Link>
      </li>
    </ul>
  );
}
