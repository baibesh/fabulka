"use client";

import { ART_OUTCOMES, type GraphNodeId, type PipelineTrace } from "@fabulka/shared";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { formatSpendUsd, useAdminI18n } from "../ui";
import { clock } from "./replay";

const ART_TONE: Record<(typeof ART_OUTCOMES)[number], BadgeTone> = { drawn: "success", softened: "warning", rewritten: "warning", refused: "danger" };

/** The refusal ladder a frame took: drawn, softened, rewritten, refused, with the reached rung lit. */
function Ladder({ art }: { art: (typeof ART_OUTCOMES)[number] | null }) {
  const { t } = useAdminI18n();
  const reached = art ? ART_OUTCOMES.indexOf(art) : -1;
  return (
    <ol className="flex items-center gap-1" aria-label={art ? t(`admin.pipeline.trace.art.${art}`) : undefined}>
      {ART_OUTCOMES.map((rung, i) => (
        <li
          key={rung}
          title={t(`admin.pipeline.trace.art.${rung}`)}
          className={cx("h-1.5 w-5 rounded-full", i > reached ? "bg-border" : i === reached ? (rung === "drawn" ? "bg-success" : rung === "refused" ? "bg-danger" : "bg-warning") : "bg-muted/50")}
        />
      ))}
    </ol>
  );
}

/** One node of a book's run: its totals, pictures, frames (with the refusal ladder) and calls. */
export function TracePanel({ node, trace }: { node: GraphNodeId; trace: PipelineTrace }) {
  const { t, number, ms } = useAdminI18n();
  const share = trace.nodes[node];
  const calls = trace.calls.filter((c) => c.node === node);
  const start = trace.calls.length ? Date.parse(trace.calls[0].startedAt) : 0;
  const pictures = trace.images[node] ?? [];
  const frames = node.startsWith("frame.") ? trace.frames : [];
  if (!share) return <p className="text-sm text-muted">{t("admin.pipeline.trace.nodeNone")}</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="pipeline-trace-panel">
      <dl className="grid grid-cols-2 gap-2">
        {(
          [
            [t("admin.pipeline.stat.calls"), number(share.calls)],
            [t("admin.journal.cost"), formatSpendUsd(share.costUsd)],
            [t("admin.pipeline.trace.modelTime"), ms(share.latencyMs)],
            [t("admin.pipeline.stat.refusals"), number(share.refusals)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border px-3 py-2">
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="text-base font-extrabold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {pictures.length > 0 && node !== "book.pdf" && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">{t("admin.pipeline.trace.pictures")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {pictures.map((p) => (
              <figure key={p.url} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- a stored model picture, any size */}
                <img src={p.url} alt={p.label} className="aspect-square w-full rounded-lg border border-border bg-background object-cover" />
                <figcaption className="truncate text-center text-[11px] text-muted">{p.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      {frames.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">{t("admin.pipeline.trace.frames")}</h3>
          <ul className="flex flex-col gap-2" data-testid="pipeline-trace-frames">
            {frames.map((f) => (
              <li key={`${f.page}.${f.frame}`} className="flex gap-3 rounded-xl border border-border p-2">
                {f.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- a stored model picture */
                  <img src={f.imageUrl} alt="" className="size-14 shrink-0 rounded-lg border border-border object-cover" />
                ) : (
                  <span className="size-14 shrink-0 rounded-lg border border-dashed border-border" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{t("admin.pipeline.trace.frame", { page: f.page, frame: f.frame })}</span>
                    {f.art && <Badge tone={ART_TONE[f.art]}>{t(`admin.pipeline.trace.art.${f.art}`)}</Badge>}
                  </div>
                  <Ladder art={f.art} />
                  <p className="text-[11px] text-muted tabular-nums">
                    {t("admin.pipeline.trace.calls", { n: f.calls })} · {formatSpendUsd(f.costUsd)} · {ms(f.latencyMs)}
                    {f.refusals > 0 && <span className="font-bold text-danger"> · {t("admin.pipeline.stat.refusals")}: {f.refusals}</span>}
                  </p>
                  <p className="line-clamp-2 text-[11px]" title={f.scene}>
                    <span className="font-semibold">{t("admin.pipeline.trace.scene")}: </span>
                    {f.scene}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">{t("admin.pipeline.trace.callsTitle")}</h3>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-xs">
          {calls.slice(0, 80).map((c) => (
            <li key={c.id} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center gap-2 tabular-nums">
                <span className="w-10 text-muted">+{clock(Date.parse(c.startedAt) - start)}</span>
                <Badge tone={c.status === "ok" ? "success" : c.errorCode === "content_policy" ? "warning" : "danger"}>{c.status === "ok" ? "ok" : (c.errorCode ?? "error")}</Badge>
                {c.page !== null && <span className="font-semibold">{c.frame !== null ? `${c.page}.${c.frame}` : c.page}</span>}
                {c.attempt > 1 && <span className="text-muted">{t("admin.pipeline.trace.attempt", { n: c.attempt })}</span>}
                <span className="ml-auto text-muted">{ms(c.latencyMs)}</span>
                <span className="w-14 text-right">{formatSpendUsd(c.costUsd)}</span>
              </div>
              {(c.prompt || c.output) && (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-muted">{c.prompt ? t("admin.pipeline.trace.prompt") : t("admin.pipeline.trace.output")}</summary>
                  {c.prompt && <p className="mt-1 rounded-lg bg-background p-2 font-mono break-words whitespace-pre-wrap">{c.prompt}</p>}
                  {c.output && <p className="mt-1 rounded-lg bg-background p-2 font-mono break-words whitespace-pre-wrap">{c.output}</p>}
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
