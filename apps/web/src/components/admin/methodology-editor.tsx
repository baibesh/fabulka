"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateMethodologySchema,
  METHODOLOGY_AGE_MAX,
  METHODOLOGY_AGE_MIN,
  METHODOLOGY_WORDS_MAX,
  METHODOLOGY_WORDS_MIN,
  METHODOLOGY_IN_USE,
  BASE_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_NAMES,
  UpdateMethodologySchema,
  methodologyText,
  type AdminMethodology,
  type Language,
  type MethodologyTexts,
} from "@fabulka/shared";
import { Eye, Save, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { adminMethodology, createMethodology, deleteMethodology, previewMethodology, updateMethodology } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { Card, useAdminI18n } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";
import { ErrorText, Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { BackLink, PageHeader } from "@/components/ui/page";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";

/** Languages a method must have to be published; the others are optional. */
const isBase = (language: Language) => (BASE_LANGUAGES as readonly Language[]).includes(language);


/** What the form holds: lists as one item per line, the way the owner types them. */
interface Draft {
  slug: string;
  texts: MethodologyTexts;
  source: string;
  ageMin: number;
  ageMax: number;
  structure: string;
  rules: string;
  avoid: string;
  /** The method's own words-per-page limit, as typed; "" for none (the age norm). */
  maxWords: string;
  published: boolean;
  /** Null for a new method until the owner types one: it then goes after the existing ones. */
  sortOrder: number | null;
}

const toDraft = (m: AdminMethodology): Draft => ({
  slug: m.slug,
  texts: m.texts,
  source: m.source,
  ageMin: m.ageMin,
  ageMax: m.ageMax,
  structure: m.structure.join("\n"),
  rules: m.rules.join("\n"),
  avoid: m.avoid.join("\n"),
  maxWords: m.maxWordsPerPage === null ? "" : String(m.maxWordsPerPage),
  published: m.published,
  sortOrder: m.sortOrder,
});

const empty = { name: "", summary: "" };
const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const maxWords = (d: Draft) => (d.maxWords.trim() ? Number(d.maxWords) : null);
const fields = (d: Draft, sortOrder: number) => ({
  texts: d.texts,
  source: d.source,
  ageMin: d.ageMin,
  ageMax: d.ageMax,
  structure: lines(d.structure),
  rules: lines(d.rules),
  avoid: lines(d.avoid),
  maxWordsPerPage: maxWords(d),
  published: d.published,
  sortOrder,
});

/** /admin/methodologies/[slug]: loads the method, then edits it. */
export function MethodologyPage() {
  const { slug } = useParams<{ slug: string }>();
  const method = useQuery({ queryKey: ["admin", "methodology", slug], queryFn: () => adminMethodology(slug) });
  if (!method.data) return <QueryState error={method.error} scope="admin" />;
  // Keyed so the form starts over from the saved method after each save.
  return <MethodologyEditor key={method.data.updatedAt} initial={method.data} />;
}

/** How many catalog books and created books follow a method the API refused to delete. */
function inUseCounts(error: Error): { templates: number; books: number } {
  const body = (error instanceof ApiError ? error.body : null) as { templates?: unknown; books?: unknown } | null;
  return { templates: Number(body?.templates ?? 0), books: Number(body?.books ?? 0) };
}

/** Edits a method, or with no `initial` creates one. */
export function MethodologyEditor({ initial }: { initial?: AdminMethodology }) {
  const router = useRouter();
  const { t, locale } = useAdminI18n();
  const queryClient = useQueryClient();
  const all = useAdminMethodologies();
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? toDraft(initial)
      : {
          slug: "",
          texts: {},
          source: "",
          ageMin: 4,
          ageMax: 8,
          structure: "",
          rules: "",
          avoid: "",
          maxWords: "",
          published: false,
          sortOrder: null,
        },
  );
  const tabs = useTabsId();
  const [lang, setLang] = useState<Language>(DEFAULT_LANGUAGE);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const sortOrder = draft.sortOrder ?? (all.data?.at(-1)?.sortOrder ?? -10) + 10;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setText = (key: "name" | "summary", value: string) =>
    setDraft((d) => ({ ...d, texts: { ...d.texts, [lang]: { ...(d.texts[lang] ?? empty), [key]: value } } }));
  const refresh = (saved: AdminMethodology) => {
    queryClient.setQueryData(["admin", "methodology", saved.slug], saved);
    void queryClient.invalidateQueries({ queryKey: ["admin", "methodologies"] });
    // The site's lists pick the change up on their next load.
    void queryClient.invalidateQueries({ queryKey: ["methodologies"] });
  };

  // The shared schema words its own refusals in Russian; the ones it adds are shown in the admin's language.
  const problemText = (issue: { path: PropertyKey[]; message: string; code: string }, texts: MethodologyTexts) => {
    const path = issue.path.join(".");
    if (issue.code === "too_small" && path === "source") return t("admin.method.error.source");
    if (issue.code === "too_small" && path === "structure") return t("admin.method.error.structure");
    if (path === "maxWordsPerPage") return t("admin.method.error.maxWords", { min: METHODOLOGY_WORDS_MIN, max: METHODOLOGY_WORDS_MAX });
    if (issue.code !== "custom") return issue.message;
    if (path === "ageMax") return t("admin.method.error.ages");
    if (path === "texts.ru.name") return t("admin.method.error.ruName");
    if (path === "texts.ru.summary") return t("admin.method.error.ruSummary");
    if (path === "published") {
      const missing = BASE_LANGUAGES.filter((l) => !texts[l]?.name || !texts[l]?.summary);
      return t("admin.method.error.publish", { languages: BASE_LANGUAGES.join(", "), missing: missing.join(", ") });
    }
    return issue.message;
  };

  const save = useMutation({
    mutationFn: async (next: Draft) => {
      // Checked here with the API's own rules, so each problem is shown next to its field.
      const body = { ...fields(next, sortOrder), slug: next.slug };
      const parsed = initial ? UpdateMethodologySchema.safeParse(body) : CreateMethodologySchema.safeParse(body);
      if (!parsed.success) {
        setProblems(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), problemText(issue, body.texts)])));
        return null;
      }
      setProblems({});
      return initial ? updateMethodology(initial.slug, UpdateMethodologySchema.parse(body)) : createMethodology(CreateMethodologySchema.parse(body));
    },
    onSuccess: (saved) => {
      if (!saved) return;
      refresh(saved);
      if (!initial) router.replace(`/admin/methodologies/${saved.slug}`);
    },
  });

  const preview = useMutation({
    mutationFn: () =>
      previewMethodology({
        slug: draft.slug,
        source: draft.source,
        ageMin: draft.ageMin,
        ageMax: draft.ageMax,
        structure: lines(draft.structure),
        rules: lines(draft.rules),
        avoid: lines(draft.avoid),
        // A limit the schema would refuse is left out of the preview; saving shows the problem.
        maxWordsPerPage: Number.isInteger(maxWords(draft)) ? maxWords(draft) : null,
      }),
  });

  const remove = useMutation({
    mutationFn: () => deleteMethodology(initial!.slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "methodologies"] });
      void queryClient.invalidateQueries({ queryKey: ["methodologies"] });
      router.push("/admin/methodologies");
    },
    onSettled: () => setConfirming(false),
  });
  const inUse = remove.error instanceof ApiError && remove.error.code === METHODOLOGY_IN_USE;

  const langProblem = (code: Language) => Object.keys(problems).some((path) => path.startsWith(`texts.${code}.`));
  // Marked only where publishing needs it: an optional language falls back to the base ones.
  const unfilled = (code: Language) => isBase(code) && (!draft.texts[code]?.name || !draft.texts[code]?.summary);
  const savedNow = save.isSuccess && save.data !== null;

  return (
    <form
      data-testid="methodology-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(draft);
      }}
      className="flex flex-col gap-6"
    >
      <BackLink href="/admin/methodologies">{t("admin.method.back")}</BackLink>
      <PageHeader
        size="sm"
        title={initial ? methodologyText(initial.texts, locale).name || initial.slug : t("admin.method.newTitle")}
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {savedNow && <span data-testid="methodology-saved" className="text-sm text-success">{t("admin.saved")}</span>}
            {initial && (
              <Button
                variant="danger-outline"
                data-testid="methodology-delete"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  remove.reset();
                  setConfirming(true);
                }}
              >
                {t("admin.delete")}
              </Button>
            )}
            <Button type="submit" data-testid="methodology-save" loading={save.isPending} icon={<Save className="size-4" />}>
              {t("admin.save")}
            </Button>
          </div>
        }
      />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        pending={remove.isPending}
        title={t("admin.method.remove.confirm")}
        confirmLabel={t("admin.method.remove.yes")}
        cancelLabel={t("admin.method.remove.no")}
        closeLabel={t("admin.close")}
        testId="methodology-delete-dialog"
        confirmTestId="methodology-delete-confirm"
      />
      {remove.isError && (
        <Notice data-testid="methodology-delete-error" role="alert" tone="warning" className="items-start">
          <p>{inUse ? t("admin.method.error.inUse", inUseCounts(remove.error)) : remove.error.message}</p>
          {inUse && draft.published && (
            <Button
              variant="secondary"
              data-testid="methodology-unpublish"
              disabled={save.isPending}
              onClick={() => {
                const next = { ...draft, published: false };
                setDraft(next);
                save.mutate(next);
              }}
              className="mt-2 self-start"
            >
              {t("admin.method.unpublish")}
            </Button>
          )}
        </Notice>
      )}
      {save.isError && <ErrorText>{save.error.message}</ErrorText>}
      {Object.keys(problems).length > 0 && (
        <Notice role="alert" data-testid="methodology-problems" tone="danger">
          <p>{t("admin.method.check")}</p>
          <ul className="list-disc pl-5">
            {Object.values(problems).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("admin.method.texts")}>
          <Tabs
            base={tabs}
            variant="segmented"
            value={lang}
            onChange={setLang}
            items={LANGUAGES.map((code) => ({
              id: code,
              testId: `methodology-tab-${code}`,
              label: (
                <>
                  {LANGUAGE_NAMES[code]}
                  {(unfilled(code) || langProblem(code)) && (
                    <span title={t("admin.method.missing")} className={`size-1.5 rounded-full ${langProblem(code) ? "bg-danger" : "bg-warning"}`} />
                  )}
                </>
              ),
            }))}
          />
          <div {...tabPanelProps(tabs, lang)} className="flex flex-col gap-4 outline-none">
            <Field label={t("admin.method.name")} error={problems[`texts.${lang}.name`]}>
              <Input
                key={`name-${lang}`}
                data-testid={`methodology-name-${lang}`}
                value={draft.texts[lang]?.name ?? ""}
                onChange={(e) => setText("name", e.target.value)}
              />
            </Field>
            <Field label={t("admin.method.summary")} error={problems[`texts.${lang}.summary`]}>
              <Textarea
                key={`summary-${lang}`}
                data-testid={`methodology-summary-${lang}`}
                className="min-h-24"
                value={draft.texts[lang]?.summary ?? ""}
                onChange={(e) => setText("summary", e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-muted">{t("admin.method.texts.hint")}</p>
        </Card>

        <Card title={t("admin.method.basics")}>
          <Field label={t("admin.method.slug")} error={problems["slug"]}>
            <Input
              data-testid="methodology-slug"
              code
              value={draft.slug}
              disabled={Boolean(initial)}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
            />
          </Field>
          <Field label={t("admin.method.source")} error={problems["source"]}>
            <Input data-testid="methodology-source" value={draft.source} onChange={(e) => set("source", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("admin.method.ageMin")} error={problems["ageMin"]}>
              <Input
                type="number"
                data-testid="methodology-age-min"
                min={METHODOLOGY_AGE_MIN}
                max={METHODOLOGY_AGE_MAX}
                value={draft.ageMin}
                onChange={(e) => set("ageMin", Number(e.target.value))}
              />
            </Field>
            <Field label={t("admin.method.ageMax")} error={problems["ageMax"]}>
              <Input
                type="number"
                data-testid="methodology-age-max"
                min={METHODOLOGY_AGE_MIN}
                max={METHODOLOGY_AGE_MAX}
                value={draft.ageMax}
                onChange={(e) => set("ageMax", Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label={t("admin.method.maxWords")} hint={t("admin.method.maxWordsHint")} error={problems["maxWordsPerPage"]}>
            <Input
              type="number"
              data-testid="methodology-max-words"
              min={METHODOLOGY_WORDS_MIN}
              max={METHODOLOGY_WORDS_MAX}
              value={draft.maxWords}
              onChange={(e) => set("maxWords", e.target.value)}
            />
          </Field>
          <Field label={t("admin.method.sortOrder")} error={problems["sortOrder"]}>
            <Input
              type="number"
              data-testid="methodology-sort"
              min={0}
              value={sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
            />
          </Field>
          <ChoiceLabel strong>
            <Checkbox data-testid="methodology-published" checked={draft.published} onChange={(e) => set("published", e.target.checked)} />
            {t("admin.method.published")}
          </ChoiceLabel>
          {problems.published && <p className="text-sm text-danger">{problems.published}</p>}
          {initial && (
            <p data-testid="methodology-usage" className="text-sm text-muted">
              {t("admin.method.usage", { templates: initial.templates, books: initial.books })}
            </p>
          )}
        </Card>
      </div>

      <Card
        title={t("admin.method.prompt")}
        action={
          <Button variant="secondary" size="sm" data-testid="methodology-preview" loading={preview.isPending} icon={<Eye className="size-4" />} onClick={() => preview.mutate()}>
            {t("admin.method.preview")}
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label={t("admin.method.structure")} error={problems["structure"]}>
            <Textarea
              data-testid="methodology-structure"
              code className="min-h-48"
              value={draft.structure}
              onChange={(e) => set("structure", e.target.value)}
            />
          </Field>
          <Field label={t("admin.method.rules")} error={problems["rules"]}>
            <Textarea
              data-testid="methodology-rules"
              code className="min-h-48"
              value={draft.rules}
              onChange={(e) => set("rules", e.target.value)}
            />
          </Field>
          <Field label={t("admin.method.avoid")} error={problems["avoid"]}>
            <Textarea
              data-testid="methodology-avoid"
              code className="min-h-48"
              value={draft.avoid}
              onChange={(e) => set("avoid", e.target.value)}
            />
          </Field>
        </div>
        {preview.isError && <ErrorText>{preview.error.message}</ErrorText>}
        {preview.data && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t("admin.method.preview.lead", { age: preview.data.age })}</p>
            <pre data-testid="methodology-preview-text" className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-background p-4 font-mono text-xs leading-relaxed">
              {preview.data.prompt}
            </pre>
          </div>
        )}
      </Card>
    </form>
  );
}
