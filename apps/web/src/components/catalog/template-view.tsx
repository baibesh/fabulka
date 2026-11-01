"use client";

import { useParams } from "next/navigation";

import { useQuery } from "@/lib/query";
import { LANGUAGE_NAMES, type Book, type Template } from "@fabulka/shared";
import { ArrowDown, Baby, BookOpen, Camera, Heart, MapPin, MessageCircleQuestion, PawPrint } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { getBook, getTemplate } from "@/lib/api";
import type { Highlight } from "@/lib/personalization";
import { useMethodologies } from "@/lib/use-methodologies";
import { BookForm } from "../book/book-form";
import { BookReader } from "../book/book-reader";
import { primaryButton } from "../landing/section";
import { PriceTag } from "../book/price-tag";
import { QueryState } from "../ui/query-state";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";

const FORM_ID = "book-form-section";

/** Reads the route parameter on the client: a params promise handed down from the server can stay
 * pending when React renders this part on the client (it then waits on the prerendered shell). */
export function TemplateView() {
  const { slug } = useParams<{ slug: string }>();
  const { t, locale } = useI18n();
  const { data: template, error } = useQuery({ queryKey: ["template", slug, locale], queryFn: () => getTemplate(slug, locale) });
  const sampleId = template?.sampleBookId;
  const { data: sample } = useQuery({
    queryKey: ["book", sampleId],
    queryFn: () => getBook(sampleId!),
    enabled: Boolean(sampleId),
  });
  const methods = useMethodologies();

  // Waits for the methods too, so the method's name does not pop in; without them the page goes on.
  if (!template || methods.isPending) return <QueryState error={error} />;
  const method = methods.data?.find((m) => m.slug === template.methodology);

  return (
    <div className="flex flex-col gap-10">
      <header className="grid items-center gap-6 sm:grid-cols-[14rem_1fr]">
        {template.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- covers are static files of any size
          <img src={template.coverUrl} alt="" className="aspect-square w-56 rounded-3xl border border-border object-cover" />
        )}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold text-accent">
            {t("common.years", { min: template.ageMin, max: template.ageMax })}
            {method && ` · ${method.name}`}
          </p>
          <h1 data-testid="template-title" className="text-4xl font-extrabold leading-tight">
            {template.title}
          </h1>
          <p className="text-lg text-muted">{template.summary}</p>
          {method && (
            <p className="text-sm text-muted">
              {method.summary} {t("template.basis", { source: method.source })}
            </p>
          )}
          <PriceTag kind="template" />
          <a
            href={`#${FORM_ID}`}
            data-testid="template-start"
            className={`${primaryButton} sm:self-start`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(FORM_ID)?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {t("sample.cta")}
            <ArrowDown className="size-5" />
          </a>
        </div>
      </header>
      {sample?.status === "done" && <SampleBook book={sample} template={template} />}
      <Changes template={template} method={method?.name} />
      <section id={FORM_ID} data-testid={FORM_ID} className="scroll-mt-20">
        <BookForm template={template} />
      </section>
    </div>
  );
}

/**
 * A finished book from this template, with the words that will be the parent's own marked: in the
 * visitor's language, else in the one they read next (the API picks it).
 */
function SampleBook({ book, template }: { book: Book; template: Template }) {
  const { t, locale } = useI18n();
  const details = template.sampleDetails;
  const toy = book.toy?.name ?? details?.toyName;
  const highlights: Highlight[] = [
    { value: book.childName, hint: t("sample.hint.name") },
    ...(details ? [{ value: details.city, hint: t("sample.hint.city") }] : []),
    ...(toy ? [{ value: toy, hint: t("sample.hint.toy") }] : []),
    ...(details?.pet ? [{ value: details.pet, hint: t("sample.hint.pet") }] : []),
    ...template.questions.flatMap((q) => {
      const answer = details?.answers[q.key]?.trim();
      return answer ? [{ value: answer, hint: t("sample.hint.answer", { label: q.label }) }] : [];
    }),
  ];

  return (
    <section data-testid="sample-book" className="flex flex-col gap-4">
      <SectionHeader size="xl" title={t("sample.title")} lead={t("sample.lead", { name: book.childName })}>
        <p className="text-sm text-muted">
          <mark className="rounded bg-accent/20 px-1 font-semibold text-foreground underline decoration-accent decoration-dotted underline-offset-4">
            {book.childName}
          </mark>{" "}
          — {t("sample.legend")}
        </p>
        {book.language !== locale && (
          <p data-testid="sample-language" data-language={book.language} className="text-sm text-muted">
            {t("sample.otherLanguage", { language: LANGUAGE_NAMES[book.language] })}
          </p>
        )}
      </SectionHeader>
      <BookReader book={book} highlights={highlights} />
    </section>
  );
}

/** What the parent's answers change in the book, and what stays as the template has it. */
function Changes({ template, method }: { template: Template; method?: string }) {
  const { t } = useI18n();
  const items = [
    { icon: Baby, text: t("template.changes.name") },
    { icon: MapPin, text: t("template.changes.city") },
    { icon: Heart, text: t("template.changes.interests") },
    { icon: PawPrint, text: t("template.changes.pet") },
    { icon: Camera, text: t("template.changes.toy") },
    ...template.questions.map((q) => ({ icon: MessageCircleQuestion, text: `«${q.label}» — ${t("template.changes.answer")}` })),
  ];

  return (
    <Card data-testid="template-changes" radius="lg" padding="fluid" shadow="sm" className="flex flex-col gap-4">
      <SectionHeader title={t("template.changes.title")} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Icon className="size-5" />
            </span>
            <span className="pt-1.5 text-sm leading-snug">{text}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-3 border-t border-border pt-4 text-sm text-muted">
        <BookOpen className="mt-0.5 size-5 shrink-0" />
        {method ? t("template.changes.same", { method }) : t("template.changes.same.plain")}
      </p>
    </Card>
  );
}
