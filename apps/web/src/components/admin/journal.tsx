"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  JOURNAL_PERIODS,
  MODEL_CALL_KINDS,
  type ClientErrorGroup,
  type JournalPeriod,
  type ModelCall,
  type ModelCallKind,
  type ModelCallStatus,
} from "@fabulka/shared";
import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { journalCall, journalCalls, journalErrors, journalStats } from "@/lib/admin-api";
import { Card, formatSpendUsd, ghostButton, input, PageTitle, table, useAdminI18n } from "./ui";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorText, Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";

export function CallStatus({ status }: { status: ModelCallStatus }) {
  const { t } = useAdminI18n();
  return <Badge tone={status === "ok" ? "success" : "danger"}>{t(`admin.journal.status.${status}`)}</Badge>;
}

/** Tokens in → out, or the number of images: what the call was billed for. */
function useUsage() {
  const { t, number } = useAdminI18n();
  return (call: ModelCall) => {
    if (call.images) return t("admin.journal.images", { count: call.images });
    if (call.inputTokens === null && call.outputTokens === null) return "—";
    return `${number(call.inputTokens ?? 0)} → ${number(call.outputTokens ?? 0)}`;
  };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** One call in full: the error and, for a failed call, what was sent and what came back. */
export function CallDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, date, ms } = useAdminI18n();
  const usage = useUsage();
  const call = useQuery({ queryKey: ["admin", "journal", "call", id], queryFn: () => journalCall(id) });
  const c = call.data;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        data-testid="journal-call-detail"
        className="flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{c ? t(`admin.journal.kind.${c.kind}`) : t("admin.journal.call")}</h2>
          <button type="button" aria-label={t("admin.close")} onClick={onClose} className="rounded-xl p-2 text-muted hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
        {!c && <QueryState error={call.error} scope="admin" />}
        {c && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <CallStatus status={c.status} />
              {c.attempt > 1 && <span className="text-sm text-muted">{t("admin.attempt", { n: c.attempt })}</span>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {(
                [
                  [t("admin.journal.time"), date(c.createdAt)],
                  [t("admin.journal.model"), c.model],
                  [t("admin.journal.duration"), ms(c.latencyMs)],
                  [t("admin.journal.usage"), usage(c)],
                  [t("admin.journal.cost"), formatSpendUsd(c.costUsd)],
                  [t("admin.journal.response"), c.responseId ?? "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
              <dt className="text-muted">{t("admin.journal.book")}</dt>
              <dd>
                {c.bookId ? (
                  <Link href={`/admin/books/${c.bookId}`} className="font-semibold text-accent">
                    {c.bookTitle ?? t("admin.untitled")}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {c.errorMessage && (
              <Notice as="p" role="alert" tone="danger" className="break-words">
                {c.errorCode && <span className="font-bold">{c.errorCode}: </span>}
                {c.errorMessage}
              </Notice>
            )}
            {[
              [t("admin.journal.prompt"), c.prompt],
              [t("admin.journal.output"), c.output],
            ].map(
              ([label, text]) =>
                text && (
                  <div key={label} className="flex flex-col gap-1">
                    <p className="text-sm font-semibold">{label}</p>
                    <pre className="max-h-80 overflow-auto rounded-xl bg-background p-3 text-xs whitespace-pre-wrap">{text}</pre>
                  </div>
                ),
            )}
            {c.status === "error" && !c.prompt && !c.output && (
              <p className="text-xs text-muted">{t("admin.journal.noPrompt")}</p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Summary({ period }: { period: JournalPeriod }) {
  const { t, number, percent, ms } = useAdminI18n();
  const stats = useQuery({ queryKey: ["admin", "journal", "stats", period], queryFn: () => journalStats(period), refetchInterval: 10_000 });
  if (stats.isError) return <ErrorText>{stats.error.message}</ErrorText>;
  const s = stats.data;
  return (
    <section data-testid="journal-summary" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label={t("admin.journal.calls")}
          value={s ? number(s.calls) : "…"}
          hint={t("admin.journal.forPeriod", { period: t(`admin.journal.period.${period}`) })}
        />
        <Stat
          label={t("admin.journal.errorShare")}
          value={s ? (s.calls ? percent(s.errors / s.calls, 1) : "—") : "…"}
          hint={s ? t("admin.journal.errors", { count: number(s.errors) }) : undefined}
        />
        <Stat label={t("admin.journal.spend")} value={s ? formatSpendUsd(s.costUsd) : "…"} />
        <Stat label={t("admin.journal.clientErrors")} value={s ? number(s.clientErrors) : "…"} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className={table}>
          <thead>
            <tr>
              <th>{t("admin.journal.kind")}</th>
              <th>{t("admin.journal.model")}</th>
              <th className="text-right">{t("admin.journal.calls")}</th>
              <th className="text-right">{t("admin.journal.errorsCol")}</th>
              <th className="text-right">p50</th>
              <th className="text-right">p95</th>
              <th className="text-right">{t("admin.journal.avgCost")}</th>
            </tr>
          </thead>
          <tbody>
            {s?.byModel.map((row) => (
              <tr key={`${row.kind}/${row.model}`}>
                <td className="whitespace-nowrap">{t(`admin.journal.kind.${row.kind}`)}</td>
                <td className="text-muted">{row.model}</td>
                <td className="text-right tabular-nums">{number(row.calls)}</td>
                <td className={`text-right tabular-nums ${row.errors ? "font-bold text-danger" : "text-muted"}`}>{number(row.errors)}</td>
                <td className="text-right tabular-nums">{ms(row.p50Ms)}</td>
                <td className="text-right tabular-nums">{ms(row.p95Ms)}</td>
                <td className="text-right tabular-nums">{formatSpendUsd(row.avgCostUsd)}</td>
              </tr>
            ))}
            {s?.byModel.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  {t("admin.journal.noCalls.period")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Calls({ period }: { period: JournalPeriod }) {
  const { t, date, ms } = useAdminI18n();
  const usage = useUsage();
  const [kind, setKind] = useState<ModelCallKind | "">("");
  const [status, setStatus] = useState<ModelCallStatus | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const calls = useInfiniteQuery({
    queryKey: ["admin", "journal", "calls", period, kind, status],
    queryFn: ({ pageParam }) => journalCalls({ period, kind: kind || undefined, status: status || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = calls.data?.pages.flatMap((page) => page.calls);

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-bold">{t("admin.journal.requests")}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select data-testid="journal-filter-kind" className={`${input} sm:w-48`} value={kind} onChange={(e) => setKind(e.target.value as ModelCallKind | "")}>
            <option value="">{t("admin.journal.allKinds")}</option>
            {MODEL_CALL_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`admin.journal.kind.${k}`)}
              </option>
            ))}
          </select>
          <select data-testid="journal-filter-status" className={`${input} sm:w-36`} value={status} onChange={(e) => setStatus(e.target.value as ModelCallStatus | "")}>
            <option value="">{t("admin.journal.all")}</option>
            <option value="ok">{t("admin.journal.ok")}</option>
            <option value="error">{t("admin.journal.failed")}</option>
          </select>
        </div>
      </div>
      {calls.isError && <ErrorText>{calls.error.message}</ErrorText>}
      <div className="-mx-5 overflow-x-auto">
        <table data-testid="journal-calls" className={table}>
          <thead>
            <tr>
              <th>{t("admin.journal.time")}</th>
              <th>{t("admin.journal.kind")}</th>
              <th>{t("admin.journal.status")}</th>
              <th className="text-right">{t("admin.journal.duration")}</th>
              <th className="text-right">{t("admin.journal.tokens")}</th>
              <th className="text-right">{t("admin.journal.price")}</th>
              <th>{t("admin.journal.book")}</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((call) => (
              <tr
                key={call.id}
                data-testid="journal-call-row"
                data-kind={call.kind}
                data-status={call.status}
                tabIndex={0}
                onClick={() => setOpen(call.id)}
                onKeyDown={(e) => e.key === "Enter" && setOpen(call.id)}
                className="cursor-pointer hover:bg-background/60"
              >
                <td className="whitespace-nowrap text-muted">{date(call.createdAt)}</td>
                <td>
                  <span className="font-semibold whitespace-nowrap">{t(`admin.journal.kind.${call.kind}`)}</span>
                  <div className="text-xs text-muted">
                    {call.model}
                    {call.attempt > 1 && ` · ${t("admin.attempt", { n: call.attempt })}`}
                  </div>
                </td>
                <td>
                  <CallStatus status={call.status} />
                  {call.errorCode && <div className="text-xs text-danger">{call.errorCode}</div>}
                </td>
                <td className="text-right tabular-nums">{ms(call.latencyMs)}</td>
                <td className="text-right whitespace-nowrap tabular-nums text-muted">{usage(call)}</td>
                <td className="text-right tabular-nums">{formatSpendUsd(call.costUsd)}</td>
                <td>
                  {call.bookId ? (
                    <Link href={`/admin/books/${call.bookId}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent">
                      {t("admin.journal.open")}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  {t("admin.journal.noCalls")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {calls.hasNextPage && (
        <button type="button" data-testid="journal-more" disabled={calls.isFetchingNextPage} onClick={() => void calls.fetchNextPage()} className={`${ghostButton} self-center`}>
          {calls.isFetchingNextPage ? t("admin.loading") : t("admin.journal.more")}
        </button>
      )}
      {open && <CallDetail id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function ErrorRow({ group }: { group: ClientErrorGroup }) {
  const { t, date, number } = useAdminI18n();
  const [open, setOpen] = useState(false);
  return (
    <li data-testid="journal-error-row" className="border-t border-border first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-background/60">
        <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold break-words">{group.message}</span>
          <span className="text-xs text-muted">
            {group.path} · {t("admin.journal.lastSeen", { date: date(group.lastSeen) })}
          </span>
        </span>
        <Badge tone="danger" className="shrink-0 tabular-nums">{number(group.count)}</Badge>
      </button>
      {open && (
        <ul className="flex flex-col gap-2 px-5 pb-4 pl-12 text-xs text-muted">
          {group.recent.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {date(e.createdAt)} · {t(`admin.journal.errorKind.${e.kind}`)}
                {e.status !== null && ` · ${e.status}`}
                {e.code && ` · ${e.code}`}
                {e.locale && ` · ${e.locale}`}
              </span>
              {e.userAgent && <span className="break-all">{e.userAgent}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Errors({ period }: { period: JournalPeriod }) {
  const { t } = useAdminI18n();
  const errors = useQuery({ queryKey: ["admin", "journal", "errors", period], queryFn: () => journalErrors(period), refetchInterval: 10_000 });
  return (
    <section data-testid="journal-errors" className="overflow-hidden rounded-2xl border border-border bg-card">
      {!errors.data && <QueryState error={errors.error} scope="admin" className="p-5" />}
      {errors.data?.length === 0 && <EmptyState variant="plain">{t("admin.journal.noErrors")}</EmptyState>}
      <ul>
        {errors.data?.map((group) => (
          <ErrorRow key={`${group.path}\n${group.message}`} group={group} />
        ))}
      </ul>
    </section>
  );
}

/** Model calls and the errors visitors ran into, for finding what breaks and what it costs. */
export function Journal() {
  const { t } = useAdminI18n();
  const [period, setPeriod] = useState<JournalPeriod>("24h");
  const [tab, setTab] = useState<"calls" | "errors">("calls");
  const tabClass = (active: boolean) => `rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap ${active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`;

  return (
    <>
      <PageTitle
        aside={
          <select data-testid="journal-period" className={`${input} sm:w-40`} value={period} onChange={(e) => setPeriod(e.target.value as JournalPeriod)}>
            {JOURNAL_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.journal.period.${p}`)}
              </option>
            ))}
          </select>
        }
      >
        {t("admin.journal.title")}
      </PageTitle>
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        <button type="button" role="tab" aria-selected={tab === "calls"} data-testid="journal-tab-calls" onClick={() => setTab("calls")} className={tabClass(tab === "calls")}>
          {t("admin.journal.tab.calls")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "errors"} data-testid="journal-tab-errors" onClick={() => setTab("errors")} className={tabClass(tab === "errors")}>
          {t("admin.journal.tab.errors")}
        </button>
      </div>
      {tab === "calls" ? (
        <>
          <Summary period={period} />
          <Calls period={period} />
        </>
      ) : (
        <Errors period={period} />
      )}
    </>
  );
}
