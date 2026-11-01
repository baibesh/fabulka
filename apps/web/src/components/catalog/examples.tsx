"use client";

import { useQuery } from "@/lib/query";
import { BookCard } from "../book/book-card";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/i18n";
import { listExamples } from "@/lib/api";
import { SectionHeader } from "../ui/section-header";

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
      <SectionHeader size="xl" title={t("examples.title")} lead={t("examples.lead")} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {examples?.map((book) => (
          <li key={book.id}>
            <BookCard href={`/books/${book.id}`} data-testid={`example-${book.id}`} image={book.heroImageUrl} fit="contain" radius="md">
              <span className="p-4 font-bold">{book.title}</span>
            </BookCard>
          </li>
        ))}
      </ul>
    </section>
  );
}
