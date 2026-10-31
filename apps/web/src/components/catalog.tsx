"use client";

import { useQuery } from "@tanstack/react-query";
import { methodologyText } from "@fabulka/shared";
import { Wand2 } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/i18n";
import { listTemplates } from "@/lib/api";
import { useBookPrice } from "@/lib/use-price";
import { ErrorNotice } from "./error-notice";

const card =
  "group flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-lg";

const price = "rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold text-accent-foreground";

/** How many books the home page shows before sending visitors to the whole catalog. */
const PREVIEW_BOOKS = 6;

/**
 * Catalog books and the card for a story of your own, with what one more of each costs. `preview`
 * is the strip on the home page: the first books only, side by side and swiped through on phones.
 */
export function Catalog({ preview = false }: { preview?: boolean }) {
  const { t, locale } = useI18n();
  const { data: templates, error } = useQuery({ queryKey: ["templates", locale], queryFn: () => listTemplates(locale) });
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
          <Link href={`/catalog/${book.slug}`} data-testid={`template-${book.slug}`} className={`${card} h-full`}>
            {book.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- covers are static files of any size
              <img
                src={book.coverUrl}
                alt=""
                className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="aspect-square w-full bg-border" />
            )}
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-accent">
                  {t("common.years", { min: book.ageMin, max: book.ageMax })}
                </span>
                <span className="rounded-full bg-border px-2.5 py-1 text-muted">{methodologyText(book.methodology, locale).name}</span>
              </div>
              <h2 className="text-xl font-extrabold">{book.title}</h2>
              <p className="text-sm text-muted">{book.summary}</p>
              <p className="mt-auto pt-1">
                <span data-testid="template-price" className={price}>
                  {templatePrice}
                </span>
              </p>
            </div>
          </Link>
        </li>
      ))}
      {/* A whole row under the books on wider screens, so it never sits alone under a full row. */}
      <li className={`sm:col-span-2 lg:col-span-3 ${preview ? "max-sm:w-[78%] max-sm:shrink-0 max-sm:snap-start" : ""}`}>
        <Link
          href="/create"
          data-testid="create-own"
          className={`${card} h-full items-center justify-center gap-3 border-dashed p-8 text-center sm:flex-row sm:gap-5 sm:text-left`}
        >
          <Wand2 className="size-10 shrink-0 text-accent transition duration-300 group-hover:-rotate-12 group-hover:scale-110" />
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-extrabold">{t("catalog.own.title")}</h2>
            <p className="text-sm text-muted">{t("catalog.own.text")}</p>
          </div>
          <span data-testid="custom-price" className={`${price} sm:ml-auto`}>
            {customPrice}
          </span>
        </Link>
      </li>
    </ul>
  );
}
