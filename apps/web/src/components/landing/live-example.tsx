"use client";

import { useQuery } from "@/lib/query";
import { ArrowDown } from "lucide-react";
import Link from "next/link";
import { BookReader } from "@/components/book-reader";
import { useI18n } from "@/i18n/i18n";
import { getBook, listExamples } from "@/lib/api";
import { Section } from "./section";

/** The newest example book, open to flip through right here; nothing at all when there is none. */
export function LiveExample() {
  const { t } = useI18n();
  const { data: examples } = useQuery({ queryKey: ["examples"], queryFn: listExamples });
  const newest = examples?.[0];
  const { data: book } = useQuery({
    queryKey: ["book", newest?.id],
    queryFn: () => getBook(newest!.id),
    enabled: Boolean(newest),
  });

  if (book?.status !== "done") return null;
  return (
    <Section id="example" testId="live-example" title={t("landing.example.title")} lead={t("landing.example.lead")}>
      <BookReader book={book} />
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-accent">
        <Link href={`/books/${book.id}`}>{t("landing.example.open")} →</Link>
        <a href="#examples" className="flex items-center gap-1">
          {t("landing.example.all")}
          <ArrowDown className="size-4" />
        </a>
      </div>
    </Section>
  );
}
