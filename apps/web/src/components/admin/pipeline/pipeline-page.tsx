"use client";

import { useQuery } from "@tanstack/react-query";
import {
  PICTURE_BOOK,
  PIPELINE_PERIODS,
  allowedFor,
  pipelineGraph,
  storyFormatText,
  type GraphEdgeKind,
  type GraphNodeId,
  type PipelinePeriod,
  type PipelineTrace,
} from "@fabulka/shared";
import { ExternalLink, Pause, Play, RotateCcw, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import { QueryState } from "@/components/ui/query-state";
import { Tabs } from "@/components/ui/tabs";
import { pipelineBooks, pipelineStats, pipelineTrace } from "@/lib/admin-api";
import { formatSpendUsd, useAdminI18n } from "../ui";
import { useAdminStoryFormats } from "../use-story-formats";
import { useAdminHref, useWorkingCountry } from "../working-country";
import { FormatParams, NodeStatsGrid } from "./format-panel";
import { GraphCanvas } from "./graph-canvas";
import type { LayoutMode } from "./layout";
import { MODEL_STYLE, REPLAY_SECONDS, REPLAY_SPEEDS, clock, replayAt, runSpan } from "./replay";
import { TracePanel } from "./trace-panel";

type Mode = "format" | "trace";

/**
 * /admin/pipeline: the generation graph of a format with each step's live numbers and settings
 * (?format=), or one book's run on it with a replay (?book=). The address keeps both, so a book's
 * admin page links straight to its trace.
 */
export function PipelinePage() {
  const { t, locale } = useAdminI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { access } = useWorkingCountry();
  const canStats = ["journal", "story_formats", "story_formats.read"].some((r) => allowedFor(access, r as "journal", null));
  const canTrace = ["journal", "books"].some((r) => allowedFor(access, r as "journal", null));
  const bookId = params.get("book");
  const mode: Mode = canTrace && (bookId || params.get("mode") === "trace") ? "trace" : "format";
  const [period, setPeriod] = useState<PipelinePeriod>("7d");
  const [layout, setLayout] = useState<LayoutMode>("stages");
  const [selected, setSelected] = useState<GraphNodeId | null>(null);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const trace = useQuery({ queryKey: ["admin", "pipeline", "trace", bookId], queryFn: () => pipelineTrace(bookId!), enabled: mode === "trace" && !!bookId });
  const formats = useAdminStoryFormats();
  const formatSlug = mode === "trace" && trace.data ? trace.data.book.format : (params.get("format") ?? PICTURE_BOOK);
  const format = formats.data?.find((f) => f.slug === formatSlug) ?? formats.data?.find((f) => f.slug === PICTURE_BOOK);
  const graph = useMemo(() => (format ? pipelineGraph(format) : null), [format]);
  const stats = useQuery({ queryKey: ["admin", "pipeline", "stats", format?.slug, period], queryFn: () => pipelineStats(format!.slug, period), enabled: !!format && canStats });

  if (!formats.data || !graph || !format) return <QueryState error={formats.error} scope="admin" />;
  const formatName = (slug: string) => {
    const f = formats.data.find((x) => x.slug === slug);
    return (f && storyFormatText(f.texts, locale).name) || slug;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" data-testid="pipeline-page">
      <PageHeader size="sm" title={t("admin.pipeline.title")} lead={t("admin.pipeline.lead")} />
      <div className="flex flex-wrap items-center gap-3">
        {canTrace && (
          <Tabs<Mode>
            base="pipeline-mode"
            variant="segmented"
            label={t("admin.pipeline.mode")}
            value={mode}
            onChange={(next) => {
              setSelected(null);
              setParams(next === "trace" ? { mode: "trace" } : { mode: null, book: null });
            }}
            items={[
              { id: "format", label: t("admin.pipeline.mode.format"), testId: "pipeline-mode-format" },
              { id: "trace", label: t("admin.pipeline.mode.trace"), testId: "pipeline-mode-trace" },
            ]}
          />
        )}
        {mode === "format" && (
          <>
            <Select small aria-label={t("admin.pipeline.format")} data-testid="pipeline-format" className="w-auto" value={format.slug} onChange={(e) => (setSelected(null), setParams({ format: e.target.value }))}>
              {formats.data.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {formatName(f.slug)}
                </option>
              ))}
            </Select>
            {canStats && (
              <Select small aria-label={t("admin.pipeline.period")} data-testid="pipeline-period" className="w-auto" value={period} onChange={(e) => setPeriod(e.target.value as PipelinePeriod)}>
                {PIPELINE_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`admin.pipeline.period.${p}`)}
                  </option>
                ))}
              </Select>
            )}
            {stats.data && (
              <span className="text-sm text-muted" data-testid="pipeline-summary">
                {t("admin.pipeline.summary", { books: stats.data.books, cost: formatSpendUsd(stats.data.costUsd) })}
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1 rounded-xl border border-border p-1 text-sm" role="group" aria-label={t("admin.pipeline.layout")}>
          {(["stages", "flow"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={layout === l}
              data-testid={`pipeline-layout-${l}`}
              onClick={() => setLayout(l)}
              className={cx("rounded-lg px-3 py-1 font-semibold", layout === l ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground")}
            >
              {t(`admin.pipeline.layout.${l}`)}
            </button>
          ))}
        </div>
      </div>

      {mode === "trace" && <BookPicker bookId={bookId} trace={trace.data} formatName={formatName} onPick={(id) => (setSelected(null), setParams({ book: id, mode: "trace" }))} />}
      {mode === "trace" && trace.error && <QueryState error={trace.error} scope="admin" />}

      <Board
        key={`${mode}-${bookId ?? ""}`}
        mode={mode}
        graph={graph}
        layout={layout}
        selected={selected}
        onSelect={setSelected}
        stats={stats.data}
        trace={mode === "trace" ? (trace.data ?? null) : null}
        format={format}
      />
    </div>
  );
}

/** The canvas with its legend, the replay bar (trace mode) and the side panel of the selected node. */
function Board({
  mode,
  graph,
  layout,
  selected,
  onSelect,
  stats,
  trace,
  format,
}: {
  mode: Mode;
  graph: ReturnType<typeof pipelineGraph>;
  layout: LayoutMode;
  selected: GraphNodeId | null;
  onSelect: (id: GraphNodeId | null) => void;
  stats: Awaited<ReturnType<typeof pipelineStats>> | undefined;
  trace: PipelineTrace | null;
  format: NonNullable<ReturnType<typeof useAdminStoryFormats>["data"]>[number];
}) {
  const { t } = useAdminI18n();
  const span = useMemo(() => runSpan(trace?.calls ?? []), [trace]);
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof REPLAY_SPEEDS)[number]>(1);
  const frame = useRef<number | null>(null);
  const length = span.end - span.start;

  useEffect(() => {
    if (!playing || !length) return;
    let last = performance.now();
    const tick = (now: number) => {
      const step = ((now - last) / 1000) * (length / REPLAY_SECONDS) * speed;
      last = now;
      let done = false;
      setAt((prev) => {
        const next = (prev ?? span.start) + step;
        if (next >= span.end) {
          done = true;
          return span.end;
        }
        return next;
      });
      if (done) setPlaying(false);
      else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [playing, length, speed, span]);

  const replay = useMemo(() => (trace && at !== null ? replayAt(trace.calls, at) : null), [trace, at]);
  const node = selected ? graph.nodes.find((n) => n.id === selected) : undefined;
  const play = () => {
    if (at === null || at >= span.end) setAt(span.start);
    setPlaying(true);
  };

  return (
    <div className="relative min-h-[560px] flex-1 overflow-hidden rounded-[1.5rem] border border-border bg-card" style={{ height: "calc(100vh - 15rem)" }}>
      {mode === "trace" && !trace ? (
        <div className="flex h-full items-center justify-center p-8 text-center text-muted" data-testid="pipeline-trace-empty">
          {t("admin.pipeline.trace.pick")}
        </div>
      ) : (
        <GraphCanvas
          graph={graph}
          layout={layout}
          selected={selected}
          onSelect={onSelect}
          stats={mode === "format" ? stats?.nodes : undefined}
          trace={trace ? { nodes: trace.nodes, replay } : undefined}
        />
      )}

      <Legend />

      {trace && length > 0 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur" data-testid="pipeline-replay">
          {playing ? (
            <IconButton size="sm" variant="secondary" label={t("admin.pipeline.trace.pause")} data-testid="pipeline-pause" onClick={() => setPlaying(false)}>
              <Pause className="size-4" />
            </IconButton>
          ) : (
            <Button size="sm" data-testid="pipeline-play" icon={<Play className="size-4" />} onClick={play}>
              {t("admin.pipeline.trace.play")}
            </Button>
          )}
          <IconButton
            size="sm"
            variant="ghost"
            label={t("admin.pipeline.trace.restart")}
            onClick={() => {
              setAt(span.start);
              setPlaying(true);
            }}
          >
            <RotateCcw className="size-4" />
          </IconButton>
          <input
            type="range"
            aria-label={t("admin.pipeline.trace.scrub")}
            data-testid="pipeline-scrub"
            min={0}
            max={length}
            step={Math.max(1, Math.round(length / 500))}
            value={at === null ? length : at - span.start}
            onChange={(e) => {
              setPlaying(false);
              setAt(span.start + Number(e.target.value));
            }}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="w-20 text-right text-xs text-muted tabular-nums" data-testid="pipeline-clock">
            {clock(at === null ? length : at - span.start)} / {clock(length)}
          </span>
          <select
            aria-label={t("admin.pipeline.trace.speed")}
            data-testid="pipeline-speed"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) as (typeof REPLAY_SPEEDS)[number])}
            className="rounded-lg border border-border bg-card px-1.5 py-1 text-xs font-semibold"
          >
            {REPLAY_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </div>
      )}

      {node && (
        <aside
          data-testid="pipeline-panel"
          aria-label={t(`admin.pipeline.node.${node.id}`)}
          className="absolute inset-y-3 right-3 z-20 flex w-[min(25rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4" style={{ ["--model" as string]: MODEL_STYLE[node.model].color }}>
            <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full bg-[var(--model)]" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="text-lg leading-tight font-extrabold">{t(`admin.pipeline.node.${node.id}`)}</h2>
              <p className="text-xs font-semibold text-muted">
                {MODEL_STYLE[node.model].name} · {t(`admin.pipeline.per.${node.per}`)}
                {node.step && <span className="font-mono"> · {node.step}</span>}
              </p>
            </div>
            <IconButton size="sm" variant="ghost" label={t("admin.close")} data-testid="pipeline-panel-close" onClick={() => onSelect(null)}>
              <X className="size-4" />
            </IconButton>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
            <p className="text-sm">{t(`admin.pipeline.nodeText.${node.id}`)}</p>
            {node.optional && <Badge tone="warning" className="self-start">{t(`admin.pipeline.when.${node.when}`)}</Badge>}
            {trace ? (
              <TracePanel node={node.id} trace={trace} />
            ) : (
              <>
                {stats && (
                  <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-bold">{t("admin.pipeline.panel.stats")}</h3>
                    <NodeStatsGrid stats={stats.nodes[node.id]} />
                  </section>
                )}
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold">{t("admin.pipeline.panel.params")}</h3>
                  <FormatParams key={`${format.slug}-${node.id}-${format.updatedAt}`} node={node} format={format} references={stats?.references ?? []} />
                  <p className="text-[11px] text-muted">{t("admin.pipeline.panel.shape")}</p>
                  <FormatLink slug={format.slug} />
                </section>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function FormatLink({ slug }: { slug: string }) {
  const { t } = useAdminI18n();
  const adminHref = useAdminHref();
  return (
    <Link href={adminHref(`/admin/story-formats/${slug}`)} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
      {t("admin.pipeline.panel.openFormat")}
      <ExternalLink className="size-3.5" />
    </Link>
  );
}

const LEGEND: { kind: GraphEdgeKind; color: string; dash?: string; width: number }[] = [
  { kind: "data", color: "var(--muted)", width: 1.5 },
  { kind: "chain", color: MODEL_STYLE["muse-image"].color, dash: "6 4", width: 3 },
  { kind: "photo", color: MODEL_STYLE["muse-voice"].color, dash: "2 4", width: 2 },
  { kind: "retry", color: "var(--warning)", dash: "2 4", width: 1.5 },
];

/** Models by colour and what each kind of line means. */
function Legend() {
  const { t } = useAdminI18n();
  return (
    <div className="pointer-events-none absolute top-4 left-4 z-10 hidden max-w-[16rem] flex-col gap-2 rounded-2xl border border-border bg-card/95 px-3.5 py-3 text-[11px] shadow-sm backdrop-blur md:flex" data-testid="pipeline-legend">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {(Object.keys(MODEL_STYLE) as (keyof typeof MODEL_STYLE)[]).map((m) => (
          <span key={m} className="inline-flex items-center gap-1 font-semibold">
            <span className="size-2 rounded-full" style={{ background: MODEL_STYLE[m].color }} />
            {MODEL_STYLE[m].name}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-muted">
        {LEGEND.map((l) => (
          <li key={l.kind} className="flex items-center gap-2">
            <svg width="28" height="6" aria-hidden className="shrink-0">
              <line x1="0" y1="3" x2="28" y2="3" stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash} />
            </svg>
            {t(`admin.pipeline.legend.${l.kind}`)}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="h-3 w-7 shrink-0 rounded border border-dashed border-muted" />
          {t("admin.pipeline.legend.optional")}
        </li>
      </ul>
    </div>
  );
}

/** Finds a book to trace (title, child, id), or shows the one being traced with its totals. */
function BookPicker({ bookId, trace, formatName, onPick }: { bookId: string | null; trace: PipelineTrace | undefined; formatName: (slug: string) => string; onPick: (id: string) => void }) {
  const { t, date, ms } = useAdminI18n();
  const adminHref = useAdminHref();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!bookId);
  const deferred = useDeferredValue(query.trim());
  const books = useQuery({ queryKey: ["admin", "pipeline", "books", deferred], queryFn: () => pipelineBooks(deferred), enabled: open, staleTime: 10_000 });
  const span = trace ? runSpan(trace.calls) : null;

  return (
    <div className="relative flex flex-wrap items-center gap-3">
      {trace && !open ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-card px-4 py-2.5" data-testid="pipeline-trace-book">
          <span className="truncate font-extrabold">{trace.book.title ?? trace.book.childName}</span>
          <Badge>{formatName(trace.book.format)}</Badge>
          <span className="text-sm text-muted">
            {trace.book.childName} · {date(trace.book.createdAt)}
          </span>
          <span className="text-sm font-semibold tabular-nums" data-testid="pipeline-trace-total">
            {t("admin.pipeline.trace.total", {
              calls: trace.calls.length,
              cost: formatSpendUsd(trace.book.costUsd),
              time: span ? ms(span.end - span.start) : "-",
            })}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Link href={adminHref(`/admin/books/${trace.book.id}`)} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
              {t("admin.pipeline.trace.open")}
              <ExternalLink className="size-3.5" />
            </Link>
            <Button size="sm" variant="secondary" data-testid="pipeline-trace-change" icon={<Search className="size-4" />} onClick={() => setOpen(true)}>
              {t("admin.pipeline.trace.search")}
            </Button>
          </span>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              autoFocus
              data-testid="pipeline-book-search"
              aria-label={t("admin.pipeline.trace.search")}
              placeholder={t("admin.pipeline.trace.search")}
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && trace && setOpen(false)}
            />
          </div>
          <p className="text-xs font-bold tracking-widest text-muted uppercase">{deferred ? t("admin.pipeline.trace.search") : t("admin.pipeline.trace.latest")}</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="pipeline-book-results">
            {books.data?.length === 0 && <li className="text-sm text-muted">{t("admin.pipeline.trace.none")}</li>}
            {books.data?.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  data-testid={`pipeline-book-${b.id}`}
                  onClick={() => {
                    setOpen(false);
                    onPick(b.id);
                  }}
                  className="flex w-full flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2 text-left hover:border-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold">{b.title ?? b.childName}</span>
                    <Badge>{formatName(b.format)}</Badge>
                  </span>
                  <span className="truncate text-xs text-muted">
                    {b.childName} · {t("admin.pipeline.trace.calls", { n: b.calls })} · {date(b.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
