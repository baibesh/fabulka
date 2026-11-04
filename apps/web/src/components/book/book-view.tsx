"use client";

import { useParams } from "next/navigation";

import { useQuery, useMutation } from "@/lib/query";
import { type Book, type BookStatus } from "@fabulka/shared";
import { AlertTriangle, Check, Download, Lock, MessageCircleQuestion, Printer, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { LocaleLink } from "@/i18n/routing";
import { useI18n } from "@/i18n/i18n";
import { getBook, wantPrint } from "@/lib/api";
import { useMethodologies } from "@/lib/use-methodologies";
import { useCoverPrice } from "@/lib/use-price";
import { BookDesign } from "./book-design";
import { GenerationBoard, GenerationHeader } from "./generation-progress";
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
  const { t, info, locale } = useI18n();
  const { data: book, error } = useQuery({
    queryKey: ["book", id],
    queryFn: () => getBook(id),
    // Every 1.5 s while it is being made; the API's ETag answers an unchanged book with a 304.
    refetchInterval: (query) => (finished(query.state.data?.status) ? false : 1500),
  });
  const printPrice = useCoverPrice("soft", book?.layout.format.id);
  const { data: methods } = useMethodologies();

  if (!book) return <QueryState error={error} />;
  const done = book.status === "done";
  // Being made: the steps, the time left and the artwork as it arrives (a failed book shows its error).
  const making = !finished(book.status);
  // An unpublished method is no longer listed: the line is left out rather than showing a slug.
  const method = methods?.find((m) => m.slug === book.methodology);

  return (
    <div className="flex flex-col gap-8">
      <section data-testid="book-status" data-status={book.status} aria-live="polite" className="flex flex-col gap-3">
        {making ? (
          <GenerationHeader book={book} />
        ) : (
          <div className="flex items-center gap-2 text-lg font-bold">
            {book.status === "failed" ? <AlertTriangle className="size-5 text-danger" /> : <Sparkles className="size-5 text-accent" />}
            <span data-testid="book-stage">{t(`book.stage.${book.status}`)}</span>
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

      {done && <BookReader book={book} />}
      {making && <GenerationBoard book={book} />}

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

      {done && book.heroPhoto?.deletedAt && (
        <Notice data-testid="hero-photo-note" data-source={book.heroSource} tone="success" icon={<Lock className="size-5 shrink-0 text-success" />}>
          <p>
            {t(book.heroSource === "photo" ? "book.photo.note" : "book.photo.fallback", {
              time: new Date(book.heroPhoto.deletedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
            })}
          </p>
        </Notice>
      )}

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
