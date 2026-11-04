"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FORMAT_PAGES_MAX,
  FORMAT_PAGES_MIN,
  FRAME_CONCURRENCY,
  PRESET_GRIDS,
  TEXT_KINDS,
  UpdateStoryFormatSchema,
  framesRange,
  samConceptsFor,
  type AdminStoryFormat,
  type FrameGrid,
  type NodeStats,
  type PipelineGraphNode,
  type PipelineStats,
  type TextKind,
  type UpdateStoryFormat,
} from "@fabulka/shared";
import { ExternalLink, Save } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorText, Notice } from "@/components/ui/notice";
import { updateStoryFormat } from "@/lib/admin-api";
import { GridThumb } from "../grid-thumb";
import { formatSpendUsd, useAdminI18n } from "../ui";
import { useAdminHref, useCan } from "../working-country";

/** The format's fields a PUT takes, as the admin has them. */
const bodyOf = (f: AdminStoryFormat): UpdateStoryFormat => ({
  texts: f.texts,
  ageMin: f.ageMin,
  ageMax: f.ageMax,
  pageCount: f.pageCount,
  grids: f.grids,
  textRules: f.textRules,
  rules: f.rules,
  artStyle: f.artStyle,
  frameDirection: f.frameDirection,
  castSheets: f.castSheets,
  theme: f.theme,
  gutterMm: f.gutterMm,
  borderMm: f.borderMm,
  published: f.published,
  sortOrder: f.sortOrder,
});

/** The numbers of a node in the period, as a small grid. */
export function NodeStatsGrid({ stats }: { stats?: NodeStats }) {
  const { t, number, ms, percent } = useAdminI18n();
  if (!stats) return <p className="text-sm text-muted">{t("admin.pipeline.stat.none")}</p>;
  const cells: [string, ReactNode][] = [
    [t("admin.pipeline.stat.calls"), number(stats.calls)],
    [t("admin.pipeline.stat.books"), number(stats.books)],
    [t("admin.pipeline.stat.avgCost"), formatSpendUsd(stats.avgCostUsd)],
    [t("admin.pipeline.stat.latency"), ms(stats.avgLatencyMs)],
    [t("admin.pipeline.stat.errors"), percent(stats.errorRate, 1)],
    [t("admin.pipeline.stat.refusals"), number(stats.refusals)],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2" data-testid="pipeline-node-stats">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border px-3 py-2">
          <dt className="text-[11px] text-muted">{label}</dt>
          <dd className="text-base font-extrabold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Which of the format's settings each node shows. */
type Section = "pages" | "grids" | "texts" | "rules" | "artStyle" | "frameDirection" | "concurrency" | "cast" | "concepts" | "print" | "references";
const SECTIONS: Partial<Record<PipelineGraphNode["id"], Section[]>> = {
  "story.write": ["pages", "grids", "texts", "rules"],
  "sheet.hero": ["artStyle", "references"],
  "sheet.cast": ["cast", "artStyle"],
  "frame.draw": ["artStyle", "frameDirection", "concurrency", "references"],
  "frame.mask": ["concepts", "texts"],
  "cover.draw": ["artStyle", "references"],
  "layout.check": ["print"],
  "text.shorten": ["texts"],
  "story.translate": ["texts"],
};

/** The settings of the format a node uses, editable with the story_formats right; saved with a PUT (logged in Activity). */
export function FormatParams({ node, format, references }: { node: PipelineGraphNode; format: AdminStoryFormat; references: PipelineStats["references"] }) {
  const { t } = useAdminI18n();
  const adminHref = useAdminHref();
  const canEdit = useCan("story_formats");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<UpdateStoryFormat>(() => bodyOf(format));
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<UpdateStoryFormat>) => {
    setSaved(false);
    setProblem(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const save = useMutation({
    mutationFn: (body: UpdateStoryFormat) => updateStoryFormat(format.slug, body),
    onSuccess: (next) => {
      queryClient.setQueryData(["admin", "story-format", next.slug], next);
      void queryClient.invalidateQueries({ queryKey: ["admin", "story-formats"] });
      setSaved(true);
    },
    onError: (error: Error) => setProblem(error.message),
  });
  const sections = SECTIONS[node.id] ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(bodyOf(format));
  const submit = () => {
    const parsed = UpdateStoryFormatSchema.safeParse(draft);
    if (!parsed.success) return setProblem(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    save.mutate(parsed.data);
  };

  const kindRule = (kind: TextKind) => draft.textRules.find((r) => r.kind === kind);
  const setKind = (kind: TextKind, rule: { maxWords: number; perFrame: number } | null) =>
    set({ textRules: TEXT_KINDS.flatMap((k) => (k === kind ? (rule ? [{ kind, ...rule }] : []) : (draft.textRules.filter((r) => r.kind === k) as typeof draft.textRules))) });
  const gridChoices: FrameGrid[] = [...draft.grids, ...format.grids.filter((g) => !draft.grids.some((d) => d.id === g.id)), ...PRESET_GRIDS.filter((p) => !draft.grids.some((d) => d.id === p.id) && !format.grids.some((g) => g.id === p.id))];
  const range = framesRange(draft);
  const ro = !canEdit;

  if (!sections.length) return <p className="text-sm text-muted">{t("admin.pipeline.panel.noParams")}</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="pipeline-params">
      {ro && <Notice tone="subtle">{t("admin.pipeline.panel.readonly")}</Notice>}
      {sections.includes("pages") && (
        <Field label={t("admin.format.pageCount")} hint={t("admin.format.pageCount.hint")}>
          <Input
            type="number"
            min={FORMAT_PAGES_MIN}
            max={FORMAT_PAGES_MAX}
            disabled={ro}
            data-testid="pipeline-param-pages"
            value={draft.pageCount ?? ""}
            onChange={(e) => set({ pageCount: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
      )}
      {sections.includes("grids") && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("admin.format.grids")}</legend>
          <p className="text-xs text-muted">{t("admin.format.framesPerPage", { range: range.min === range.max ? String(range.min) : `${range.min}-${range.max}` })}</p>
          <div className="grid grid-cols-4 gap-2">
            {gridChoices.map((grid) => {
              const on = draft.grids.some((g) => g.id === grid.id);
              return (
                <label key={grid.id} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] ${on ? "border-accent bg-accent/5" : "border-border opacity-60"}`}>
                  <GridThumb grid={grid} size={44} />
                  <span className="flex items-center gap-1">
                    <Checkbox
                      checked={on}
                      disabled={ro || (on && draft.grids.length === 1)}
                      data-testid={`pipeline-grid-${grid.id}`}
                      onChange={() => set({ grids: on ? draft.grids.filter((g) => g.id !== grid.id) : [...draft.grids, grid] })}
                    />
                    {grid.id}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {sections.includes("texts") && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("admin.format.textRules")}</legend>
          {TEXT_KINDS.map((kind) => {
            const rule = kindRule(kind);
            return (
              <div key={kind} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2">
                <ChoiceLabel>
                  <Checkbox
                    checked={!!rule}
                    disabled={ro || (!!rule && draft.textRules.length === 1)}
                    data-testid={`pipeline-kind-${kind}`}
                    onChange={() => setKind(kind, rule ? null : { maxWords: kind === "narration" ? 60 : kind === "sfx" ? 2 : 12, perFrame: kind === "speech" ? 2 : 1 })}
                  />
                  <span className="text-sm">{t(`admin.format.kind.${kind}`)}</span>
                </ChoiceLabel>
                <Input
                  type="number"
                  small
                  min={1}
                  max={150}
                  aria-label={`${t(`admin.format.kind.${kind}`)}: ${t("admin.format.kind.maxWords")}`}
                  title={t("admin.format.kind.maxWords")}
                  disabled={ro || !rule}
                  value={rule?.maxWords ?? ""}
                  onChange={(e) => rule && setKind(kind, { ...rule, maxWords: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  small
                  min={1}
                  max={6}
                  aria-label={`${t(`admin.format.kind.${kind}`)}: ${t("admin.format.kind.perFrame")}`}
                  title={t("admin.format.kind.perFrame")}
                  disabled={ro || !rule}
                  value={rule?.perFrame ?? ""}
                  onChange={(e) => rule && setKind(kind, { ...rule, perFrame: Number(e.target.value) })}
                />
              </div>
            );
          })}
          <p className="text-right text-[11px] text-muted">
            {t("admin.format.kind.maxWords")} · {t("admin.format.kind.perFrame")}
          </p>
        </fieldset>
      )}
      {sections.includes("concepts") && (
        <p className="text-sm">
          <span className="font-semibold">{t("admin.pipeline.param.concepts")}: </span>
          {samConceptsFor(draft.textRules.map((r) => r.kind))
            .map((c) => t(`admin.pipeline.concept.${c}`))
            .join(", ")}
        </p>
      )}
      {sections.includes("rules") && (
        <Field label={t("admin.format.rules")}>
          <Textarea rows={6} disabled={ro} data-testid="pipeline-param-rules" value={draft.rules.join("\n")} onChange={(e) => set({ rules: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} />
        </Field>
      )}
      {sections.includes("cast") && (
        <div className="flex flex-col gap-2">
          <ChoiceLabel>
            <Checkbox checked={draft.castSheets > 0} disabled={ro} data-testid="pipeline-optional-cast" onChange={() => set({ castSheets: draft.castSheets > 0 ? 0 : Math.max(1, format.castSheets) })} />
            <span className="text-sm font-semibold">{t("admin.pipeline.panel.optional")}</span>
          </ChoiceLabel>
          <Field label={t("admin.format.castSheets")} hint={t("admin.format.castSheets.hint")}>
            <Input type="number" min={0} max={4} disabled={ro} value={draft.castSheets} onChange={(e) => set({ castSheets: Math.max(0, Math.min(4, Number(e.target.value))) })} />
          </Field>
        </div>
      )}
      {sections.includes("artStyle") && (
        <Field label={t("admin.format.artStyle")} hint={t("admin.format.artStyle.hint")}>
          <Textarea rows={3} disabled={ro} data-testid="pipeline-param-art-style" value={draft.artStyle ?? ""} onChange={(e) => set({ artStyle: e.target.value.trim() ? e.target.value : null })} />
        </Field>
      )}
      {sections.includes("frameDirection") && (
        <Field label={t("admin.format.frameDirection")} hint={t("admin.format.frameDirection.hint")}>
          <Textarea rows={3} disabled={ro} value={draft.frameDirection ?? ""} onChange={(e) => set({ frameDirection: e.target.value.trim() ? e.target.value : null })} />
        </Field>
      )}
      {sections.includes("concurrency") && <p className="text-sm text-muted">{t("admin.pipeline.param.concurrency", { n: FRAME_CONCURRENCY })}</p>}
      {sections.includes("print") && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("admin.format.gutter")}>
            <Input type="number" step={0.5} min={0} max={12} disabled={ro} value={draft.gutterMm} onChange={(e) => set({ gutterMm: Number(e.target.value) })} />
          </Field>
          <Field label={t("admin.format.border")}>
            <Input type="number" step={0.1} min={0} max={3} disabled={ro} value={draft.borderMm} onChange={(e) => set({ borderMm: Number(e.target.value) })} />
          </Field>
          <Field label={t("admin.format.theme")} hint={t("admin.format.theme.hint")} className="col-span-2">
            <Input disabled={ro} value={draft.theme ?? ""} onChange={(e) => set({ theme: e.target.value.trim() ? e.target.value.trim() : null })} />
          </Field>
        </div>
      )}
      {sections.includes("references") && (
        <div className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold">{t("admin.pipeline.param.references")}</p>
          {references.length ? (
            references.map((r) => (
              <p key={r.kind} className="text-muted">
                {t("admin.pipeline.param.references.count", { kind: t(`admin.references.kind.${r.kind as "style" | "composition" | "character_guide"}`), enabled: r.enabled, total: r.total })}
              </p>
            ))
          ) : (
            <p className="text-muted">{t("admin.pipeline.param.references.none")}</p>
          )}
          <Link href={adminHref("/admin/references")} className="mt-1 inline-flex items-center gap-1 font-semibold text-accent hover:underline">
            {t("admin.pipeline.param.references.manage")}
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      )}
      {canEdit && (
        <div className="flex flex-col gap-2">
          <Button data-testid="pipeline-save" icon={<Save className="size-4" />} loading={save.isPending} disabled={!dirty} onClick={submit}>
            {t("admin.pipeline.panel.save")}
          </Button>
          {saved && (
            <Notice tone="success" data-testid="pipeline-saved">
              {t("admin.pipeline.panel.saved")}
            </Notice>
          )}
          {problem && <ErrorText>{problem}</ErrorText>}
        </div>
      )}
    </div>
  );
}
