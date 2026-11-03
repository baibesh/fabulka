"use client";

import { useParams } from "next/navigation";

import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@/lib/query";
import { type Book, type BookStatus } from "@fabulka/shared";
import { AlertTriangle, Check, Download, MessageCircleQuestion, Printer, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { LocaleLink } from "@/i18n/routing";
import { useI18n } from "@/i18n/i18n";
import { getBook, wantPrint } from "@/lib/api";
import { useMethodologies } from "@/lib/use-methodologies";
import { useCoverPrice } from "@/lib/use-price";
import { BookDesign } from "./book-design";
import { BookReader } from "./book-reader";
import { PriceSkeleton } from "./price-skeleton";
import { SavePrompt } from "../account/save-prompt";
import { ErrorText, Notice } from "../ui/notice";
import { QueryState } from "../ui/query-state";
import { Skeleton } from "../ui/skeleton";
import { Button, buttonClass } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";

const finished = (status: BookStatus | undefined) => status === "done" || status === "failed";

export function BookView() {
  const { id } = useParams<{ id: string }>();
  const { t, info } = useI18n();
  const { data: book, error } = useQuery({
    queryKey: ["book", id],
    queryFn: () => getBook(id),
    refetchInterval: (query) => (finished(query.state.data?.status) ? false : 1000),
  });
  const printPrice = useCoverPrice("soft", book?.layout.format.id);
  const { data: methods } = useMethodologies();

  if (!book) return <QueryState error={error} />;
  const done = book.status === "done";
  // An unpublished method is no longer listed: the line is left out rather than showing a slug.
  const method = methods?.find((m) => m.slug === book.methodology);

  return (
    <div className="flex flex-col gap-8">
      <section data-testid="book-status" data-status={book.status} className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-lg font-bold">
          {book.status === "failed" ? <AlertTriangle className="size-5 text-danger" /> : <Sparkles className="size-5 text-accent" />}
          <span data-testid="book-stage">{t(`book.stage.${book.status}`)}</span>
          {!done && <span className="text-muted">{book.progress}%</span>}
        </div>
        {!done && (
          <div className="h-3 overflow-hidden rounded-full bg-border">
            <motion.div className="h-full bg-accent" animate={{ width: `${book.progress}%` }} transition={{ duration: 0.8 }} />
          </div>
        )}
        {book.error && <ErrorText>{book.error}</ErrorText>}
      </section>

      {book.title && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
          <h1 data-testid="book-title" className="text-3xl font-extrabold">
            {book.title}
          </h1>
          {method && (
            <p data-testid="book-methodology" className="text-muted">
              {t("book.method", { name: method.name })}
            </p>
          )}
        </motion.div>
      )}

      {book.toy && !done && <ToyPipeline toy={book.toy} />}

      {done ? <BookReader book={book} /> : <Progress book={book} />}

      {book.pdfUrl && (
        <div className="flex flex-wrap justify-center gap-3">
          <a
            data-testid="download-pdf"
            href={book.pdfUrl}
            download={`${book.title ?? "book"}.pdf`}
            className={buttonClass()}
          >
            <Download className="size-5" />
            {t("book.download")}
          </a>
          {book.layout.qa.status === "blocked" ? (
            <Notice data-testid="print-blocked" tone="warning" size="sm" className="max-w-md">
              {t("design.blocked")}
            </Notice>
          ) : info.print ? (
            <LocaleLink
              data-testid="order-print"
              href={`/books/${book.id}/order`}
              className={buttonClass({ variant: "outline" })}
            >
              <Printer className="size-5" />
              {printPrice ? t("book.order", { price: printPrice }) : <PriceSkeleton className="w-48" />}
            </LocaleLink>
          ) : (
            <WantPrint bookId={book.id} />
          )}
        </div>
      )}

      {done && book.editable && <BookDesign book={book} />}

      {done && <SavePrompt bookId={book.id} />}

      {book.toy && done && <ToyPipeline toy={book.toy} />}

      {done && book.talkQuestions.length > 0 && (
        <Card data-testid="talk-questions" padding="lg" className="flex flex-col gap-3">
          <SectionHeader size="md" icon={<MessageCircleQuestion className="size-5 text-accent" />} title={t("book.talk")} />
          <ol className="list-decimal space-y-2 pl-6">
            {book.talkQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

/** While the book is being made: the hero, then each page as soon as it is drawn. */
function Progress({ book }: { book: Book }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      {book.heroImageUrl && (
        <motion.img
          data-testid="hero-image"
          src={book.heroImageUrl}
          alt={t("book.heroAlt")}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className="w-48 rounded-2xl border border-border bg-white"
        />
      )}
      <ol className="grid gap-6 sm:grid-cols-2">
        {book.pages.map((page, i) => (
          <motion.li
            key={page.page}
            data-testid="book-page"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            {page.imageUrl ? (
              <motion.img
                key={page.imageUrl}
                src={page.imageUrl}
                alt={t("book.pageAlt", { page: page.page })}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="aspect-[3/2] w-full object-cover"
              />
            ) : (
              <Skeleton as="div" radius="none" className="aspect-[3/2] w-full" />
            )}
            <p className="whitespace-pre-line p-4 leading-relaxed">{page.text}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** The toy's way into the book: the parent's photo, SAM 3.1's cut-out, Muse Image's character. */
function ToyPipeline({ toy }: { toy: NonNullable<Book["toy"]> }) {
  const { t } = useI18n();
  const steps = [
    { label: t("book.toy.photo"), url: toy.photoUrl, cover: true },
    { label: t("book.toy.cutout"), url: toy.cutoutUrl, cover: false },
    { label: t("book.toy.sheet"), url: toy.sheetUrl, cover: false },
  ];
  return (
    <Card data-testid="toy-pipeline" className="flex flex-col gap-3">
      <h2 className="font-bold">{toy.name ? t("book.toy.named", { name: toy.name }) : t("book.toy.title")}</h2>
      <ol className="grid grid-cols-3 gap-3">
        {steps.map((step, i) => (
          <li key={step.label} className="flex flex-col items-center gap-2 text-center">
            {step.url ? (
              <motion.img
                key={step.url}
                src={step.url}
                alt={step.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.15 }}
                className={`aspect-square w-full rounded-xl border border-border bg-white ${step.cover ? "object-cover" : "object-contain"}`}
              />
            ) : (
              <Skeleton as="div" radius="md" className="aspect-square w-full" />
            )}
            <span className="text-xs text-muted">{step.label}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Where the country has no print partner yet: a kind word that it is planned, and a request to count demand. */
function WantPrint({ bookId }: { bookId: string }) {
  const { t } = useI18n();
  const want = useMutation({ mutationFn: () => wantPrint(bookId) });
  return (
    <div className="flex flex-col items-center gap-2 text-center text-sm text-muted">
      <span>{t("book.print.unavailable")}</span>
      {want.isSuccess ? (
        <span data-testid="want-print-thanks" className="flex items-center gap-1 text-success">
          <Check className="size-4" />
          {t("book.print.thanks")}
        </span>
      ) : (
        <Button variant="outline" data-testid="want-print" loading={want.isPending} icon={<Printer className="size-4" />} onClick={() => want.mutate()}>
          {t("book.print.want")}
        </Button>
      )}
    </div>
  );
}
