"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BASE_LANGUAGES,
  CreateStoryFormatSchema,
  DEFAULT_LANGUAGE,
  FORMAT_PAGES_MAX,
  FORMAT_PAGES_MIN,
  FrameGridSchema,
  LANGUAGES,
  LANGUAGE_NAMES,
  PICTURE_BOOK,
  PRESET_GRIDS,
  STORY_FORMAT_IN_USE,
  TEXT_KINDS,
  UpdateStoryFormatSchema,
  framesRange,
  storyFormatText,
  type AdminStoryFormat,
  type FrameGrid,
  type Language,
  type StoryFormatTexts,
  type TextKind,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { adminStoryFormat, createStoryFormat, deleteStoryFormat, updateStoryFormat } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { GridThumb } from "./grid-thumb";
import { Card, useAdminI18n } from "./ui";
import { useAdminStoryFormats } from "./use-story-formats";
import { ErrorText, Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { BackLink, PageHeader } from "@/components/ui/page";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { useAdminHref, useCan } from "./working-country";

/** One kind of text as the form holds it: whether the format uses it, its words and how many a frame. */
interface KindDraft {
  enabled: boolean;
  maxWords: number;
  perFrame: number;
}

/** What the form holds; the page count and the theme as typed ("" for none). */
interface Draft {
  slug: string;
  texts: StoryFormatTexts;
  ageMin: number;
  ageMax: number;
  pageCount: string;
  grids: FrameGrid[];
  kinds: Record<TextKind, KindDraft>;
  rules: string;
  artStyle: string;
  frameDirection: string;
  castSheets: number;
  theme: string;
  gutterMm: number;
  borderMm: number;
  published: boolean;
  /** Null for a new format until the owner types one: it then goes after the existing ones. */
  sortOrder: number | null;
}

/** What a kind starts at when the owner switches it on. */
const KIND_DEFAULTS: Record<TextKind, KindDraft> = {
  narration: { enabled: false, maxWords: 60, perFrame: 1 },
  caption: { enabled: false, maxWords: 12, perFrame: 1 },
  speech: { enabled: false, maxWords: 14, perFrame: 2 },
  sfx: { enabled: false, maxWords: 2, perFrame: 1 },
};

const toDraft = (f: AdminStoryFormat): Draft => ({
  slug: f.slug,
  texts: f.texts,
  ageMin: f.ageMin,
  ageMax: f.ageMax,
  pageCount: f.pageCount === null ? "" : String(f.pageCount),
  grids: f.grids,
  kinds: Object.fromEntries(
    TEXT_KINDS.map((kind) => {
      const rule = f.textRules.find((r) => r.kind === kind);
      return [kind, rule ? { enabled: true, maxWords: rule.maxWords, perFrame: rule.perFrame } : KIND_DEFAULTS[kind]];
    }),
  ) as Record<TextKind, KindDraft>,
  rules: f.rules.join("\n"),
  artStyle: f.artStyle ?? "",
  frameDirection: f.frameDirection ?? "",
  castSheets: f.castSheets,
  theme: f.theme ?? "",
  gutterMm: f.gutterMm,
  borderMm: f.borderMm,
  published: f.published,
  sortOrder: f.sortOrder,
});

const blank: Draft = {
  slug: "",
  texts: {},
  ageMin: 4,
  ageMax: 12,
  pageCount: "",
  grids: [PRESET_GRIDS[0]],
  kinds: { ...KIND_DEFAULTS, narration: { ...KIND_DEFAULTS.narration, enabled: true } },
  rules: "",
  artStyle: "",
  frameDirection: "",
  castSheets: 0,
  theme: "",
  gutterMm: 3,
  borderMm: 0.8,
  published: false,
  sortOrder: null,
};

const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const orNull = (text: string) => (text.trim() ? text.trim() : null);
const fields = (d: Draft, sortOrder: number) => ({
  texts: d.texts,
  ageMin: d.ageMin,
  ageMax: d.ageMax,
  pageCount: d.pageCount.trim() ? Number(d.pageCount) : null,
  grids: d.grids,
  textRules: TEXT_KINDS.filter((kind) => d.kinds[kind].enabled).map((kind) => ({ kind, maxWords: d.kinds[kind].maxWords, perFrame: d.kinds[kind].perFrame })),
  rules: lines(d.rules),
  artStyle: orNull(d.artStyle),
  frameDirection: orNull(d.frameDirection),
  castSheets: d.castSheets,
  theme: orNull(d.theme),
  gutterMm: d.gutterMm,
  borderMm: d.borderMm,
  published: d.published,
  sortOrder,
});

const empty = { name: "", summary: "" };

/** /admin/story-formats/[slug]: loads the format, then edits it. */
export function StoryFormatPage() {
  const { slug } = useParams<{ slug: string }>();
  const format = useQuery({ queryKey: ["admin", "story-format", slug], queryFn: () => adminStoryFormat(slug) });
  if (!format.data) return <QueryState error={format.error} scope="admin" />;
  // Keyed by the format; after a save the editor takes the saved values itself (and says it saved).
  return <StoryFormatEditor key={format.data.slug} initial={format.data} />;
}

/** The methods and books the API said use a format it refused to delete. */
function inUse(error: Error): { methods: string; books: number } {
  const body = (error instanceof ApiError ? error.body : null) as { methodologies?: unknown; books?: unknown } | null;
  const methods = Array.isArray(body?.methodologies) ? body.methodologies.join(", ") : "";
  return { methods: methods || "-", books: Number(body?.books ?? 0) };
}

/** Edits a story format, or with no `initial` creates one. */
export function StoryFormatEditor({ initial }: { initial?: AdminStoryFormat }) {
  const adminHref = useAdminHref();
  const canEdit = useCan("story_formats");
  const router = useRouter();
  const { t, locale } = useAdminI18n();
  const queryClient = useQueryClient();
  const all = useAdminStoryFormats();
  const [draft, setDraft] = useState<Draft>(() => (initial ? toDraft(initial) : blank));
  const tabs = useTabsId();
  const [lang, setLang] = useState<Language>(DEFAULT_LANGUAGE);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const sortOrder = draft.sortOrder ?? (all.data?.at(-1)?.sortOrder ?? -10) + 10;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setText = (key: "name" | "summary", value: string) =>
    setDraft((d) => ({ ...d, texts: { ...d.texts, [lang]: { ...(d.texts[lang] ?? empty), [key]: value } } }));
  const setKind = (kind: TextKind, patch: Partial<KindDraft>) => setDraft((d) => ({ ...d, kinds: { ...d.kinds, [kind]: { ...d.kinds[kind], ...patch } } }));
  const moveGrid = (from: number, to: number) =>
    setDraft((d) => {
      if (to < 0 || to >= d.grids.length) return d;
      const grids = [...d.grids];
      const [grid] = grids.splice(from, 1);
      grids.splice(to, 0, grid);
      return { ...d, grids };
    });

  // The shared schema words its refusals in English; the usual ones are shown in the admin's language.
  const problemText = (issue: { path: PropertyKey[]; message: string; code: string }) => {
    const path = issue.path.join(".");
    if (path === "ageMax" && issue.code === "custom") return t("admin.format.error.ages");
    if (path === "texts.ru.name") return t("admin.format.error.ruName");
    if (path === "published") return t("admin.format.error.publish", { languages: BASE_LANGUAGES.join(", ") });
    if (path.startsWith("textRules")) return t("admin.format.error.textRules");
    if (path.startsWith("grids")) return t("admin.format.error.grids");
    return `${path}: ${issue.message}`;
  };

  const save = useMutation({
    mutationFn: async (next: Draft) => {
      // Checked here with the API's own rules, so each problem is shown next to its field.
      const body = { ...fields(next, sortOrder), slug: next.slug };
      const parsed = initial ? UpdateStoryFormatSchema.safeParse(body) : CreateStoryFormatSchema.safeParse(body);
      if (!parsed.success) {
        setProblems(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), problemText(issue)])));
        return null;
      }
      setProblems({});
      return initial ? updateStoryFormat(initial.slug, UpdateStoryFormatSchema.parse(body)) : createStoryFormat(CreateStoryFormatSchema.parse(body));
    },
    onSuccess: (saved) => {
      if (!saved) return;
      if (initial) setDraft(toDraft(saved));
      queryClient.setQueryData(["admin", "story-format", saved.slug], saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "story-formats"] });
      if (!initial) router.replace(adminHref(`/admin/story-formats/${saved.slug}`));
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteStoryFormat(initial!.slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "story-formats"] });
      router.push(adminHref("/admin/story-formats"));
    },
    onSettled: () => setConfirming(false),
  });
  const refused = remove.error instanceof ApiError && remove.error.code === STORY_FORMAT_IN_USE;

  /** The grids typed as JSON, checked one by one with the shared schema before they replace the list. */
  const applyJson = () => {
    try {
      const grids = z.array(FrameGridSchema).min(1).max(12).parse(JSON.parse(json ?? "[]"));
      set("grids", grids);
      setJson(null);
      setJsonError(null);
    } catch (error) {
      setJsonError(t("admin.format.grid.json.error", { error: error instanceof Error ? error.message.slice(0, 200) : String(error) }));
    }
  };

  const range = draft.grids.length ? framesRange(draft) : null;
  const langProblem = (code: Language) => Object.keys(problems).some((path) => path.startsWith(`texts.${code}.`));
  const unfilled = (code: Language) => (BASE_LANGUAGES as readonly Language[]).includes(code) && !draft.texts[code]?.name;
  const savedNow = save.isSuccess && save.data !== null;
  const presets = PRESET_GRIDS.filter((p) => !draft.grids.some((g) => g.id === p.id));

  return (
    <form
      data-testid="story-format-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(draft);
      }}
      className="flex flex-col gap-6"
    >
      <fieldset disabled={!canEdit} className="contents">
        <BackLink href={adminHref("/admin/story-formats")}>{t("admin.format.back")}</BackLink>
        <PageHeader
          size="sm"
          title={initial ? storyFormatText(initial.texts, locale).name || initial.slug : t("admin.format.newTitle")}
          aside={
            <div className="flex flex-wrap items-center gap-3">
              {savedNow && (
                <span data-testid="story-format-saved" className="text-sm text-success">
                  {t("admin.saved")}
                </span>
              )}
              {initial && canEdit && initial.slug !== PICTURE_BOOK && (
                <Button
                  variant="danger-outline"
                  data-testid="story-format-delete"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => {
                    remove.reset();
                    setConfirming(true);
                  }}
                >
                  {t("admin.delete")}
                </Button>
              )}
              {canEdit && (
                <Button type="submit" data-testid="story-format-save" loading={save.isPending} icon={<Save className="size-4" />}>
                  {t("admin.save")}
                </Button>
              )}
            </div>
          }
        />

        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => remove.mutate()}
          pending={remove.isPending}
          title={t("admin.format.remove.confirm")}
          confirmLabel={t("admin.format.remove.yes")}
          cancelLabel={t("admin.format.remove.no")}
          closeLabel={t("admin.close")}
          testId="story-format-delete-dialog"
          confirmTestId="story-format-delete-confirm"
        />
        {remove.isError && (
          <Notice data-testid="story-format-delete-error" role="alert" tone="warning">
            <p>
              {initial?.slug === PICTURE_BOOK
                ? t("admin.format.error.pictureBook")
                : refused
                  ? t("admin.format.error.inUse", inUse(remove.error))
                  : remove.error.message}
            </p>
          </Notice>
        )}
        {save.isError && <ErrorText>{save.error.message}</ErrorText>}
        {Object.keys(problems).length > 0 && (
          <Notice role="alert" data-testid="story-format-problems" tone="danger">
            <p>{t("admin.format.check")}</p>
            <ul className="list-disc pl-5">
              {[...new Set(Object.values(problems))].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Notice>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title={t("admin.format.texts")}>
            <Tabs
              base={tabs}
              variant="segmented"
              value={lang}
              onChange={setLang}
              items={LANGUAGES.map((code) => ({
                id: code,
                testId: `story-format-tab-${code}`,
                label: (
                  <>
                    {LANGUAGE_NAMES[code]}
                    {(unfilled(code) || langProblem(code)) && <span className={`size-1.5 rounded-full ${langProblem(code) ? "bg-danger" : "bg-warning"}`} />}
                  </>
                ),
              }))}
            />
            <div {...tabPanelProps(tabs, lang)} className="flex flex-col gap-4 outline-none">
              <Field label={t("admin.format.name")} error={problems[`texts.${lang}.name`]}>
                <Input key={`name-${lang}`} data-testid={`story-format-name-${lang}`} value={draft.texts[lang]?.name ?? ""} onChange={(e) => setText("name", e.target.value)} />
              </Field>
              <Field label={t("admin.format.summary")}>
                <Textarea
                  key={`summary-${lang}`}
                  data-testid={`story-format-summary-${lang}`}
                  className="min-h-20"
                  value={draft.texts[lang]?.summary ?? ""}
                  onChange={(e) => setText("summary", e.target.value)}
                />
              </Field>
            </div>
            <p className="text-xs text-muted">{t("admin.format.texts.hint")}</p>
          </Card>

          <Card title={t("admin.format.basics")}>
            <Field label={t("admin.format.slug")} error={problems["slug"]}>
              <Input data-testid="story-format-slug" code value={draft.slug} disabled={Boolean(initial)} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("admin.format.ageMin")} error={problems["ageMin"]}>
                <Input type="number" data-testid="story-format-age-min" min={2} max={12} value={draft.ageMin} onChange={(e) => set("ageMin", Number(e.target.value))} />
              </Field>
              <Field label={t("admin.format.ageMax")} error={problems["ageMax"]}>
                <Input type="number" data-testid="story-format-age-max" min={2} max={12} value={draft.ageMax} onChange={(e) => set("ageMax", Number(e.target.value))} />
              </Field>
              <Field label={t("admin.format.pageCount")} hint={t("admin.format.pageCount.hint")} error={problems["pageCount"]}>
                <Input
                  type="number"
                  data-testid="story-format-pages"
                  min={FORMAT_PAGES_MIN}
                  max={FORMAT_PAGES_MAX}
                  value={draft.pageCount}
                  onChange={(e) => set("pageCount", e.target.value)}
                />
              </Field>
              <Field label={t("admin.format.sortOrder")} error={problems["sortOrder"]}>
                <Input type="number" data-testid="story-format-sort" min={0} value={sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
              </Field>
            </div>
            <ChoiceLabel strong>
              <Checkbox data-testid="story-format-published" checked={draft.published} onChange={(e) => set("published", e.target.checked)} />
              {t("admin.format.published")}
            </ChoiceLabel>
            {initial && (
              <div data-testid="story-format-estimate" className="flex flex-col gap-1 rounded-xl bg-background p-3 text-sm">
                <p className="font-semibold">{t("admin.format.estimate")}</p>
                <p>
                  {t("admin.format.estimate.text", {
                    images: initial.estimate.images,
                    sam: initial.estimate.samCalls,
                    usd: initial.estimate.usd.toFixed(2),
                    minutes: Math.max(1, Math.round(initial.estimate.seconds / 60)),
                  })}
                </p>
                <p data-testid="story-format-usage" className="text-muted">
                  {t("admin.format.usage", { methods: initial.methodologies.join(", ") || t("admin.format.usage.none"), books: initial.books })}
                </p>
              </div>
            )}
          </Card>
        </div>

        <Card title={t("admin.format.grids")}>
          <p className="text-sm text-muted">{t("admin.format.grids.hint")}</p>
          {range && (
            <p data-testid="story-format-frames" className="text-sm font-semibold">
              {t("admin.format.framesPerPage", { range: range.min === range.max ? String(range.min) : `${range.min}-${range.max}` })}
            </p>
          )}
          <ol className="flex flex-col gap-2">
            {draft.grids.map((grid, i) => (
              <li key={grid.id} data-testid={`story-format-grid-${grid.id}`} className="flex items-center gap-3 rounded-xl border border-border p-2">
                <GridThumb grid={grid} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-sm">{grid.id}</span>
                  <span className="text-xs text-muted">{t("admin.format.grid.frames", { count: grid.frames.length })}</span>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <IconButton label={t("admin.format.grid.up")} disabled={i === 0} onClick={() => moveGrid(i, i - 1)}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={t("admin.format.grid.down")} disabled={i === draft.grids.length - 1} onClick={() => moveGrid(i, i + 1)}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton
                      label={t("admin.format.grid.remove")}
                      data-testid={`story-format-grid-remove-${grid.id}`}
                      disabled={draft.grids.length === 1}
                      onClick={() => set("grids", draft.grids.filter((g) => g.id !== grid.id))}
                    >
                      <X className="size-4" />
                    </IconButton>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {problems["grids"] && <p className="text-sm text-danger">{problems["grids"]}</p>}
          {canEdit && presets.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{t("admin.format.grid.add")}</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`story-format-grid-add-${preset.id}`}
                    onClick={() => set("grids", [...draft.grids, preset])}
                    className="flex items-center gap-2 rounded-xl border border-dashed border-border p-2 text-left hover:border-accent"
                  >
                    <GridThumb grid={preset} size={36} />
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1 font-mono text-xs">
                        <Plus className="size-3" />
                        {preset.id}
                      </span>
                      <span className="text-xs text-muted">{t("admin.format.grid.frames", { count: preset.frames.length })}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <details
            className="text-sm"
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open && json === null) setJson(JSON.stringify(draft.grids, null, 1));
            }}
          >
            <summary className="cursor-pointer font-semibold">{t("admin.format.grid.json")}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-muted">{t("admin.format.grid.json.hint")}</p>
              <Textarea data-testid="story-format-grids-json" code className="min-h-40" value={json ?? ""} onChange={(e) => setJson(e.target.value)} />
              {jsonError && <p className="text-sm text-danger">{jsonError}</p>}
              {canEdit && (
                <Button variant="secondary" size="sm" className="self-start" data-testid="story-format-grids-apply" onClick={applyJson}>
                  {t("admin.format.grid.json.apply")}
                </Button>
              )}
            </div>
          </details>
        </Card>

        <Card title={t("admin.format.textRules")}>
          <p className="text-sm text-muted">{t("admin.format.textRules.hint")}</p>
          <div className="flex flex-col gap-2">
            {TEXT_KINDS.map((kind) => {
              const k = draft.kinds[kind];
              return (
                <div key={kind} data-testid={`story-format-kind-${kind}`} className="grid grid-cols-1 items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_8rem_8rem]">
                  <ChoiceLabel strong className="sm:pb-2">
                    <Checkbox data-testid={`story-format-kind-${kind}-on`} checked={k.enabled} onChange={(e) => setKind(kind, { enabled: e.target.checked })} />
                    {t(`admin.format.kind.${kind}`)}
                  </ChoiceLabel>
                  <Field label={t("admin.format.kind.maxWords")}>
                    <Input
                      type="number"
                      small
                      data-testid={`story-format-kind-${kind}-words`}
                      min={1}
                      max={150}
                      disabled={!k.enabled}
                      value={k.maxWords}
                      onChange={(e) => setKind(kind, { maxWords: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={t("admin.format.kind.perFrame")}>
                    <Input
                      type="number"
                      small
                      data-testid={`story-format-kind-${kind}-per-frame`}
                      min={1}
                      max={6}
                      disabled={!k.enabled}
                      value={k.perFrame}
                      onChange={(e) => setKind(kind, { perFrame: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
          {problems["textRules"] && <p className="text-sm text-danger">{problems["textRules"]}</p>}
        </Card>

        <Card title={t("admin.format.prompt")}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label={t("admin.format.rules")} error={problems["rules"]}>
              <Textarea data-testid="story-format-rules" code className="min-h-40" value={draft.rules} onChange={(e) => set("rules", e.target.value)} />
            </Field>
            <div className="flex flex-col gap-4">
              <Field label={t("admin.format.artStyle")} hint={t("admin.format.artStyle.hint")} error={problems["artStyle"]}>
                <Textarea data-testid="story-format-art-style" className="min-h-20" value={draft.artStyle} onChange={(e) => set("artStyle", e.target.value)} />
              </Field>
              <Field label={t("admin.format.frameDirection")} hint={t("admin.format.frameDirection.hint")} error={problems["frameDirection"]}>
                <Textarea data-testid="story-format-direction" className="min-h-20" value={draft.frameDirection} onChange={(e) => set("frameDirection", e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Field label={t("admin.format.castSheets")} hint={t("admin.format.castSheets.hint")} error={problems["castSheets"]}>
              <Input type="number" data-testid="story-format-cast" min={0} max={4} value={draft.castSheets} onChange={(e) => set("castSheets", Number(e.target.value))} />
            </Field>
            <Field label={t("admin.format.theme")} hint={t("admin.format.theme.hint")} error={problems["theme"]}>
              <Input data-testid="story-format-theme" code value={draft.theme} onChange={(e) => set("theme", e.target.value)} />
            </Field>
            <Field label={t("admin.format.gutter")} error={problems["gutterMm"]}>
              <Input type="number" data-testid="story-format-gutter" min={0} max={12} step={0.1} value={draft.gutterMm} onChange={(e) => set("gutterMm", Number(e.target.value))} />
            </Field>
            <Field label={t("admin.format.border")} error={problems["borderMm"]}>
              <Input type="number" data-testid="story-format-border" min={0} max={3} step={0.1} value={draft.borderMm} onChange={(e) => set("borderMm", Number(e.target.value))} />
            </Field>
          </div>
        </Card>
      </fieldset>
    </form>
  );
}
