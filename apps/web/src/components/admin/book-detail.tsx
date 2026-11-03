"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Flag, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { addExampleVersion, adminBook, adminExamples, bookCalls, bookFlags, createExample, deleteBook, flagPage, pinLayout } from "@/lib/admin-api";
import { Menu, MenuItem } from "@/components/ui/menu";
import { EXAMPLES_QUERY, useExampleError } from "./examples-page";
import { CallDetail } from "./journal/call-detail";
import { CallStatus } from "./journal/call-status";
import { BOOK_STATUS_TONE, Card, formatSpendUsd, PageTitle, useAdminI18n } from "./ui";
import { useMethodologyName } from "./use-methodologies";
import { Badge } from "@/components/ui/badge";
import { ErrorText, Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Button, buttonClass } from "@/components/ui/button";
import { BackLink } from "@/components/ui/page";
import { ConfirmDialog } from "@/components/ui/dialog";
import { BookReader } from "@/components/book/book-reader";
import { LANGUAGE_NAMES, PAGE_VARIANTS, displayVersion, type AdminBook, type LayoutQa, type PageVariant } from "@fabulka/shared";
import { themeName } from "@/lib/themes";
import { Select, Textarea } from "@/components/ui/input";
import { pageLabel } from "./references-page";
import { useAdminHref, useCan } from "./working-country";

const QA_TONE: Record<LayoutQa["status"], "success" | "warning" | "danger" | "neutral"> = {
  ok: "success",
  shrunk: "warning",
  blocked: "danger",
  pending: "neutral",
};

/** The book's theme and what render QA found: shrunk pages, and what blocks printing. */
function BookLayoutCard({ book }: { book: AdminBook }) {
  const { t, locale } = useAdminI18n();
  const canPin = useCan("books");
  const queryClient = useQueryClient();
  const pin = useMutation({
    mutationFn: (pins: Record<string, PageVariant | null>) => pinLayout(book.id, { pins }),
    onSuccess: (updated) => queryClient.setQueryData(["admin", "book", book.id], updated),
  });
  const { layout } = book;
  const shrunk = Object.entries(layout.fits).map(([page, fit]) => `${page} ${Math.round(fit * 100)}%`);
  return (
    <Card title={t("admin.book.layout")}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">{t("admin.book.layout.theme")}</dt>
        <dd data-testid="layout-theme" data-theme={layout.theme.id}>
          {themeName(layout.theme, t, locale)} · {layout.theme.fonts.body.family} / {layout.theme.fonts.heading.family}
          {layout.headingFallback && ` → ${layout.theme.fonts.body.family}`}
        </dd>
        <dt className="text-muted">{t("admin.book.layout.format")}</dt>
        <dd data-testid="layout-format" data-format={layout.format.id}>
          {layout.format.id} · {layout.format.widthMm}×{layout.format.heightMm} {t("admin.orders.mm")}
        </dd>
        {book.print && (
          <>
            <dt className="text-muted">{t("admin.book.print")}</dt>
            <dd
              data-testid="print-spec"
              data-interior={book.print.interiorPages}
              data-spine-soft={book.print.soft.spineMm}
              data-spine-hard={book.print.hard.spineMm}
            >
              {t("admin.book.print.value", {
                pages: book.print.interiorPages,
                soft: book.print.soft.spineMm,
                hard: book.print.hard.spineMm,
              })}
              {!book.print.soft.spineText && <span className="block text-xs text-muted">{t("admin.book.print.thin")}</span>}
            </dd>
          </>
        )}
        <dt className="text-muted">{t("admin.book.layout.qa")}</dt>
        <dd>
          <Badge data-testid="render-qa" data-status={layout.qa.status} tone={QA_TONE[layout.qa.status]}>
            {t(`admin.book.layout.qa.${layout.qa.status}`)}
          </Badge>
        </dd>
      </dl>
      {shrunk.length > 0 && <p className="text-sm text-muted">{t("admin.book.layout.shrunk", { pages: shrunk.join(", ") })}</p>}
      {layout.qa.issues.length > 0 && (
        <ul data-testid="render-issues" className="flex flex-col gap-1 text-sm">
          {layout.qa.issues.map((issue, i) => (
            <li key={i} className="text-danger">
              <span className="font-semibold">{issue.page}</span> — {t(`admin.book.layout.issue.${issue.kind}`)}
              <span className="block text-xs text-muted">{issue.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {layout.qa.notes.length > 0 && (
        <ul data-testid="render-notes" className="flex flex-col gap-1 text-sm">
          {layout.qa.notes.map((note, i) => (
            <li key={i} data-kind={note.kind} className="text-warning">
              <span className="font-semibold">{note.page}</span> — {t(`admin.book.layout.note.${note.kind}`)}
              <span className="block text-xs text-muted">{note.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Staff may pin any layout; a two-page one only takes effect where it can start on a left page. */}
      <div className={`flex flex-col gap-2 text-sm ${canPin ? "" : "hidden"}`}>
        <p className="font-semibold">{t("admin.book.layout.pins")}</p>
        {book.pages.map(({ page }) => {
          const state = layout.pages[String(page)];
          return (
            <label key={page} className="flex items-center gap-2">
              <span className="w-16 text-muted">{t("design.page", { page })}</span>
              <Select
                small
                data-testid={`pin-${page}`}
                value={state?.pin ?? ""}
                disabled={pin.isPending}
                onChange={(e) => pin.mutate({ [String(page)]: (e.target.value || null) as PageVariant | null })}
              >
                <option value="">{t("admin.book.layout.auto")}</option>
                {PAGE_VARIANTS.map((variant) => (
                  <option key={variant} value={variant}>
                    {t(`design.variant.${variant}`)}
                  </option>
                ))}
              </Select>
            </label>
          );
        })}
        {pin.isPending && <span className="text-muted">{t("admin.book.layout.saving")}</span>}
        {pin.isError && <ErrorText>{pin.error.message}</ErrorText>}
      </div>
    </Card>
  );
}

/**
 * The book among the home page's examples: which example it is the version of, or — for a finished
 * book — «Make an example» (a new one with this book) and «Add as <language> version to an
 * example…», listing the examples with no version in the book's language.
 */
function ExampleActions({ book }: { book: AdminBook }) {
  const adminHref = useAdminHref();
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useExampleError();
  const language = LANGUAGE_NAMES[book.language];
  const examples = useQuery({ queryKey: EXAMPLES_QUERY, queryFn: adminExamples, enabled: !book.example && book.status === "done" });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "book", book.id] });
    void queryClient.invalidateQueries({ queryKey: EXAMPLES_QUERY });
  };
  const make = useMutation({ mutationFn: () => createExample(book.id), onSuccess: done });
  const add = useMutation({ mutationFn: (exampleId: string) => addExampleVersion(exampleId, book.id), onSuccess: done });

  if (book.example) {
    return (
      <Link href={adminHref("/admin/examples")} data-testid="book-example" data-example-id={book.example.id} className={buttonClass({ variant: "secondary" })}>
        <Sparkles className="size-4" />
        {t("admin.book.example.is", { language: LANGUAGE_NAMES[book.example.language] })}
      </Link>
    );
  }
  if (book.status !== "done") return null;
  const open = examples.data?.filter((e) => !e.versions.some((v) => v.language === book.language)) ?? [];
  return (
    <>
      <Button variant="secondary" data-testid="make-example" loading={make.isPending} icon={<Sparkles className="size-4" />} onClick={() => make.mutate()}>
        {t("admin.book.example.make")}
      </Button>
      <Menu
        data-testid="add-to-example-menu"
        className="w-80"
        trigger={({ props }) => (
          <Button {...props} variant="secondary" data-testid="add-to-example" loading={add.isPending}>
            {t("admin.book.example.add", { language })}
          </Button>
        )}
      >
        {(close) =>
          open.length ? (
            open.map((example) => {
              const shown = displayVersion(example.versions, book.language);
              return (
                <MenuItem
                  key={example.id}
                  data-testid={`add-to-example-${example.id}`}
                  onClick={() => {
                    add.mutate(example.id);
                    close();
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{shown?.title ?? t("admin.untitled")}</span>
                  <span className="text-xs text-muted">{example.versions.map((v) => v.language.toUpperCase()).join(" ")}</span>
                </MenuItem>
              );
            })
          ) : (
            <p className="px-3 py-2 text-sm text-muted">{t("admin.book.example.none", { language })}</p>
          )
        }
      </Menu>
      {(make.isError || add.isError) && <ErrorText data-testid="example-action-error">{errorText(make.error ?? add.error)}</ErrorText>}
    </>
  );
}

/** The book's model calls in order, timed from the first: where generation spent its time and money. */
function BookCalls({ id, generating }: { id: string; generating: boolean }) {
  const { t, ms, seconds } = useAdminI18n();
  const [open, setOpen] = useState<string | null>(null);
  const calls = useQuery({ queryKey: ["admin", "book", id, "calls"], queryFn: () => bookCalls(id), refetchInterval: generating ? 3000 : false });
  const start = calls.data?.[0] ? new Date(calls.data[0].createdAt).getTime() : 0;
  return (
    <Card title={t("admin.book.calls")}>
      {calls.isError && <ErrorText>{calls.error.message}</ErrorText>}
      <ol data-testid="book-calls" className="flex flex-col text-sm">
        {calls.data?.map((call) => (
          <li key={call.id} className="border-t border-border first:border-t-0">
            <button type="button" onClick={() => setOpen(call.id)} className="grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-3 py-2 text-left hover:bg-background/60 sm:grid-cols-[3.5rem_1fr_auto_5rem_4.5rem]">
              <span className="tabular-nums text-muted">+{seconds((new Date(call.createdAt).getTime() - start) / 1000)}</span>
              <span className="min-w-0">
                <span className="font-semibold">{t(`admin.journal.kind.${call.kind}`)}</span>
                {call.attempt > 1 && <span className="text-muted"> · {t("admin.attempt", { n: call.attempt })}</span>}
                {call.references.length > 0 && (
                  <span data-testid="call-references" data-references={call.references.join(" ")} className="text-muted">
                    {" "}
                    · {t("admin.journal.references", { n: call.references.length })}
                  </span>
                )}
                {call.errorMessage && <span className="block truncate text-xs text-danger">{call.errorMessage}</span>}
              </span>
              <CallStatus status={call.status} />
              <span className="hidden text-right tabular-nums sm:block">{ms(call.latencyMs)}</span>
              <span className="hidden text-right tabular-nums text-muted sm:block">{formatSpendUsd(call.costUsd)}</span>
            </button>
          </li>
        ))}
        {calls.data?.length === 0 && <li className="py-4 text-muted">{t("admin.book.calls.empty")}</li>}
      </ol>
      {open && <CallDetail id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

/** An illustrator flags a page with a note (admin «References» lists the flags). */
function FlagButton({ bookId, page }: { bookId: string; page: string }) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => flagPage(bookId, { page, note: note.trim() }),
    onSuccess: () => {
      setOpen(false);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "book", bookId, "flags"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "flags"] });
    },
  });
  if (!open)
    return (
      <Button size="sm" variant="ghost" data-testid={`flag-${page}`} icon={<Flag className="size-4" />} onClick={() => setOpen(true)}>
        {t("admin.flag.add")}
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Textarea data-testid="flag-note" className="min-h-16" maxLength={500} placeholder={t("admin.flag.note")} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" type="submit" data-testid="flag-save" loading={save.isPending} disabled={!note.trim()}>
          {t("admin.flag.save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("admin.team.cancel")}
        </Button>
      </div>
      {save.isError && <ErrorText>{save.error.message}</ErrorText>}
    </form>
  );
}

/** The book's flagged pages, newest first. */
function BookFlags({ id }: { id: string }) {
  const { t, date } = useAdminI18n();
  const flags = useQuery({ queryKey: ["admin", "book", id, "flags"], queryFn: () => bookFlags(id) });
  if (!flags.data?.length) return null;
  return (
    <Card title={t("admin.flag.title")}>
      <ul data-testid="book-flags" className="flex flex-col gap-2 text-sm">
        {flags.data.map((flag) => (
          <li key={flag.id} data-testid="book-flag" data-page={flag.page} className={flag.resolved ? "opacity-60" : ""}>
            <Badge tone={flag.resolved ? "success" : "warning"}>{pageLabel(flag.page, t)}</Badge>{" "}
            <span className="text-muted">
              {date(flag.createdAt)}
              {flag.createdBy ? ` · ${flag.createdBy}` : ""}
            </span>
            <p className="whitespace-pre-line">{flag.note}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function BookDetail() {
  const adminHref = useAdminHref();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, date, bookStatus } = useAdminI18n();
  const book = useQuery({ queryKey: ["admin", "book", id], queryFn: () => adminBook(id) });
  const methodName = useMethodologyName();
  const canManage = useCan("books");
  const canExamples = useCan("examples");
  const canFlag = useCan("books.review");
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({ mutationFn: () => deleteBook(id), onSuccess: () => router.replace(adminHref("/admin/books")), onSettled: () => setConfirming(false) });
  if (!book.data) return <QueryState error={book.error} scope="admin" />;
  const b = book.data;
  const facts: [string, string][] = [
    [
      t("admin.book.child"),
      t("admin.book.child.value", {
        name: b.child.name,
        age: b.child.age,
        gender: b.child.gender === "girl" ? t("admin.book.girl") : t("admin.book.boy"),
        city: b.child.city,
      }),
    ],
    [t("admin.book.interests"), b.child.interests.join(", ")],
    [t("admin.book.pet"), b.child.pet ?? "—"],
    [t("admin.book.method"), methodName(b.methodology)],
    [t("admin.book.template"), b.template ?? t("admin.books.custom")],
    [t("admin.book.theme"), b.theme ?? "—"],
    [t("admin.book.language"), b.language.toUpperCase()],
    [t("admin.book.country"), b.country ?? "—"],
    [t("admin.book.spend"), formatSpendUsd(b.costUsd)],
    [t("admin.book.created"), date(b.createdAt)],
  ];

  return (
    <>
      <BackLink href={adminHref("/admin/books")}>{t("admin.book.back")}</BackLink>
      <PageTitle
        aside={
          <div className="flex flex-wrap gap-2">
            <Link href={`/books/${b.id}`} target="_blank" className={buttonClass({ variant: "secondary" })}>
              <ExternalLink className="size-4" />
              {t("admin.book.open")}
            </Link>
            {canExamples && <ExampleActions book={b} />}
            {b.pdfUrl && (
              <a href={b.pdfUrl} download className={buttonClass({ variant: "secondary" })}>
                <Download className="size-4" />
                {t("admin.book.pdf")}
              </a>
            )}
            {canManage && (
              <Button variant="danger-outline" data-testid="delete-book" loading={remove.isPending} icon={<Trash2 className="size-4" />} onClick={() => setConfirming(true)}>
                {t("admin.delete")}
              </Button>
            )}
          </div>
        }
      >
        {b.title ?? t("admin.untitled")}
      </PageTitle>
      <div>
        <Badge tone={BOOK_STATUS_TONE[b.status]}>{bookStatus(b.status)}</Badge>
        {b.demo && <span className="ml-2 text-sm text-muted">{t("admin.book.demo")}</span>}
      </div>
      {b.error && (
        <Notice as="p" role="alert" tone="danger">
          {b.error}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card title={t("admin.book.facts")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {b.answers && Object.keys(b.answers).length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-semibold">{t("admin.book.answers")}</p>
              {Object.entries(b.answers).map(([key, value]) => (
                <p key={key}>
                  <span className="text-muted">{key}:</span> {value}
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card title={t("admin.book.pages")}>
          <ol className="grid gap-4 sm:grid-cols-2">
            {b.coverImageUrl && (
              <li data-testid="admin-cover" className="overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API */}
                <img src={b.coverImageUrl} alt="" className="aspect-square w-full object-cover" />
                <div className="flex flex-col gap-2 p-3 text-sm">
                  <p className="font-semibold">{t("admin.flag.page.cover")}</p>
                  {b.blurb && <p className="text-muted">{b.blurb}</p>}
                  {canFlag && <FlagButton bookId={b.id} page="cover" />}
                </div>
              </li>
            )}
            {b.pages.map((page) => (
              <li key={page.page} data-testid="admin-page" className="overflow-hidden rounded-xl border border-border">
                {page.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
                  <img src={page.imageUrl} alt="" className="aspect-[3/2] w-full object-cover" />
                ) : (
                  <div className="aspect-[3/2] w-full bg-border" />
                )}
                <div className="flex flex-col gap-2 p-3 text-sm">
                  <p className="whitespace-pre-line">{page.text}</p>
                  {canFlag && <FlagButton bookId={b.id} page={`story-${page.page}`} />}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      {b.status === "done" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <BookLayoutCard book={b} />
          <Card title={t("admin.book.preview")}>
            <BookReader book={b} />
          </Card>
        </div>
      )}
      {canFlag && <BookFlags id={b.id} />}
      <BookCalls id={b.id} generating={b.status !== "done" && b.status !== "failed"} />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        pending={remove.isPending}
        title={t("admin.book.deleteConfirm")}
        confirmLabel={t("admin.method.remove.yes")}
        cancelLabel={t("admin.method.remove.no")}
        closeLabel={t("admin.close")}
        testId="delete-book-dialog"
        confirmTestId="delete-book-confirm"
      />
    </>
  );
}
