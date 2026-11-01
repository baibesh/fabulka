"use client";

import { useQuery } from "@/lib/query";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/i18n";
import { listExamples } from "@/lib/api";

/** Finished books the admin picked, for visitors to flip through before making their own. */
export function Examples() {
  const { t } = useI18n();
  const { data: examples } = useQuery({ queryKey: ["examples"], queryFn: listExamples });
  const section = useRef<HTMLElement>(null);
  const shown = Boolean(examples?.length);

  // The section appears only once the list arrives, too late for the browser to follow /#examples.
  useEffect(() => {
    if (shown && window.location.hash === "#examples") section.current?.scrollIntoView();
  }, [shown]);

  if (!shown) return null;
  return (
    <section ref={section} id="examples" data-testid="examples" className="flex scroll-mt-20 flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold">{t("examples.title")}</h2>
        <p className="text-muted">{t("examples.lead")}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {examples?.map((book) => (
          <li key={book.id}>
            <Link
              href={`/books/${book.id}`}
              data-testid={`example-${book.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-lg"
            >
              {book.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
                <img
                  src={book.heroImageUrl}
                  alt=""
                  className="aspect-square w-full bg-white object-contain transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="aspect-square w-full bg-border" />
              )}
              <span className="p-4 font-bold">{book.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
