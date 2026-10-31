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
import { Badge, Card, formatDate, formatUsd, ghostButton, input, PageTitle, table } from "./ui";

export const CALL_KIND: Record<ModelCallKind, string> = {
  story: "Сказка",
  review: "Проверка сказки",
  "toy-cutout": "Вырезка игрушки",
  "toy-describe": "Описание игрушки",
  "toy-sheet": "Лист игрушки",
  hero: "Герой",
  pet: "Питомец",
  page: "Страница",
  "voice-transcribe": "Распознавание голоса",
  "voice-extract": "Анкета из голоса",
};

const PERIOD: Record<JournalPeriod, string> = { "24h": "24 часа", "7d": "7 дней", "30d": "30 дней" };

const ERROR_KIND = { js: "ошибка JS", api: "ответ API", unhandled: "необработанная" } as const;

export const formatMs = (ms: number | null) => (ms === null ? "—" : ms < 1000 ? `${Math.round(ms)} мс` : `${(ms / 1000).toFixed(1)} с`);

export function CallStatus({ status }: { status: ModelCallStatus }) {
  return status === "ok" ? <Badge tone="bg-emerald-500/15 text-emerald-600">ок</Badge> : <Badge tone="bg-red-500/15 text-red-600">ошибка</Badge>;
}

/** Tokens in → out, or the number of images: what the call was billed for. */
function usage(call: ModelCall) {
  if (call.images) return `${call.images} изобр.`;
  if (call.inputTokens === null && call.outputTokens === null) return "—";
  return `${call.inputTokens ?? 0} → ${call.outputTokens ?? 0}`;
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
          <h2 className="text-lg font-bold">{c ? CALL_KIND[c.kind] : "Запрос"}</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="rounded-xl p-2 text-muted hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
        {call.isError && <p role="alert" className="text-red-600">{call.error.message}</p>}
        {!c && !call.isError && <p className="text-muted">Загружаем…</p>}
        {c && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <CallStatus status={c.status} />
              {c.attempt > 1 && <span className="text-sm text-muted">попытка {c.attempt}</span>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {(
                [
                  ["Время", formatDate(c.createdAt)],
                  ["Модель", c.model],
                  ["Длительность", formatMs(c.latencyMs)],
                  ["Токены / изображения", usage(c)],
                  ["Стоимость", formatUsd(c.costUsd)],
                  ["Ответ", c.responseId ?? "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
              <dt className="text-muted">Книга</dt>
              <dd>
                {c.bookId ? (
                  <Link href={`/admin/books/${c.bookId}`} className="font-semibold text-accent">
                    {c.bookTitle ?? "Без названия"}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {c.errorMessage && (
              <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm break-words text-red-600">
                {c.errorCode && <span className="font-bold">{c.errorCode}: </span>}
                {c.errorMessage}
              </p>
            )}
            {[
              ["Запрос", c.prompt],
              ["Ответ модели", c.output],
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
              <p className="text-xs text-muted">Текст запроса не сохранён: его нет у этого вызова или прошло 30 дней.</p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Summary({ period }: { period: JournalPeriod }) {
  const stats = useQuery({ queryKey: ["admin", "journal", "stats", period], queryFn: () => journalStats(period), refetchInterval: 10_000 });
  if (stats.isError) return <p role="alert" className="text-red-600">{stats.error.message}</p>;
  const s = stats.data;
  return (
    <section data-testid="journal-summary" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Запросов" value={s ? String(s.calls) : "…"} hint={`за ${PERIOD[period]}`} />
        <Stat label="Доля ошибок" value={s ? (s.calls ? `${((s.errors / s.calls) * 100).toFixed(1)}%` : "—") : "…"} hint={s ? `ошибок: ${s.errors}` : undefined} />
        <Stat label="Расход" value={s ? formatUsd(s.costUsd) : "…"} />
        <Stat label="Ошибок у пользователей" value={s ? String(s.clientErrors) : "…"} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className={table}>
          <thead>
            <tr>
              <th>Тип</th>
              <th>Модель</th>
              <th className="text-right">Запросов</th>
              <th className="text-right">Ошибок</th>
              <th className="text-right">p50</th>
              <th className="text-right">p95</th>
              <th className="text-right">Ср. цена</th>
            </tr>
          </thead>
          <tbody>
            {s?.byModel.map((row) => (
              <tr key={`${row.kind}/${row.model}`}>
                <td className="whitespace-nowrap">{CALL_KIND[row.kind]}</td>
                <td className="text-muted">{row.model}</td>
                <td className="text-right tabular-nums">{row.calls}</td>
                <td className={`text-right tabular-nums ${row.errors ? "font-bold text-red-600" : "text-muted"}`}>{row.errors}</td>
                <td className="text-right tabular-nums">{formatMs(row.p50Ms)}</td>
                <td className="text-right tabular-nums">{formatMs(row.p95Ms)}</td>
                <td className="text-right tabular-nums">{formatUsd(row.avgCostUsd)}</td>
              </tr>
            ))}
            {s?.byModel.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  Запросов за этот период не было
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
        <h2 className="font-bold">Запросы</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select data-testid="journal-filter-kind" className={`${input} sm:w-48`} value={kind} onChange={(e) => setKind(e.target.value as ModelCallKind | "")}>
            <option value="">Все типы</option>
            {MODEL_CALL_KINDS.map((k) => (
              <option key={k} value={k}>
                {CALL_KIND[k]}
              </option>
            ))}
          </select>
          <select data-testid="journal-filter-status" className={`${input} sm:w-36`} value={status} onChange={(e) => setStatus(e.target.value as ModelCallStatus | "")}>
            <option value="">Все</option>
            <option value="ok">Успешные</option>
            <option value="error">Ошибки</option>
          </select>
        </div>
      </div>
      {calls.isError && <p role="alert" className="text-red-600">{calls.error.message}</p>}
      <div className="-mx-5 overflow-x-auto">
        <table data-testid="journal-calls" className={table}>
          <thead>
            <tr>
              <th>Время</th>
              <th>Тип</th>
              <th>Статус</th>
              <th className="text-right">Длительность</th>
              <th className="text-right">Токены</th>
              <th className="text-right">Цена</th>
              <th>Книга</th>
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
                <td className="whitespace-nowrap text-muted">{formatDate(call.createdAt)}</td>
                <td>
                  <span className="font-semibold whitespace-nowrap">{CALL_KIND[call.kind]}</span>
                  <div className="text-xs text-muted">
                    {call.model}
                    {call.attempt > 1 && ` · попытка ${call.attempt}`}
                  </div>
                </td>
                <td>
                  <CallStatus status={call.status} />
                  {call.errorCode && <div className="text-xs text-red-600">{call.errorCode}</div>}
                </td>
                <td className="text-right tabular-nums">{formatMs(call.latencyMs)}</td>
                <td className="text-right whitespace-nowrap tabular-nums text-muted">{usage(call)}</td>
                <td className="text-right tabular-nums">{formatUsd(call.costUsd)}</td>
                <td>
                  {call.bookId ? (
                    <Link href={`/admin/books/${call.bookId}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent">
                      открыть
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
                  Запросов нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {calls.hasNextPage && (
        <button type="button" data-testid="journal-more" disabled={calls.isFetchingNextPage} onClick={() => void calls.fetchNextPage()} className={`${ghostButton} self-center`}>
          {calls.isFetchingNextPage ? "Загружаем…" : "Показать ещё"}
        </button>
      )}
      {open && <CallDetail id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function ErrorRow({ group }: { group: ClientErrorGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <li data-testid="journal-error-row" className="border-t border-border first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-background/60">
        <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold break-words">{group.message}</span>
          <span className="text-xs text-muted">
            {group.path} · последний раз {formatDate(group.lastSeen)}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-600 tabular-nums">{group.count}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-2 px-5 pb-4 pl-12 text-xs text-muted">
          {group.recent.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {formatDate(e.createdAt)} · {ERROR_KIND[e.kind]}
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
  const errors = useQuery({ queryKey: ["admin", "journal", "errors", period], queryFn: () => journalErrors(period), refetchInterval: 10_000 });
  return (
    <section data-testid="journal-errors" className="overflow-hidden rounded-2xl border border-border bg-card">
      {errors.isError && <p role="alert" className="p-5 text-red-600">{errors.error.message}</p>}
      {!errors.data && !errors.isError && <p className="p-5 text-muted">Загружаем…</p>}
      {errors.data?.length === 0 && <p className="p-8 text-center text-muted">Ошибок у пользователей за этот период не было</p>}
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
                {PERIOD[p]}
              </option>
            ))}
          </select>
        }
      >
        Журнал
      </PageTitle>
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        <button type="button" role="tab" aria-selected={tab === "calls"} data-testid="journal-tab-calls" onClick={() => setTab("calls")} className={tabClass(tab === "calls")}>
          Запросы к моделям
        </button>
        <button type="button" role="tab" aria-selected={tab === "errors"} data-testid="journal-tab-errors" onClick={() => setTab("errors")} className={tabClass(tab === "errors")}>
          Ошибки пользователей
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
