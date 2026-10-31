"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateMethodologySchema,
  METHODOLOGY_AGE_MAX,
  METHODOLOGY_AGE_MIN,
  METHODOLOGY_IN_USE,
  UpdateMethodologySchema,
  type AdminMethodology,
  type MethodologyTexts,
} from "@fabulka/shared";
import { Eye, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { adminMethodology, createMethodology, deleteMethodology, previewMethodology, updateMethodology } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { button, Card, ghostButton, input, PageTitle } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";

/** The page's words, kept together for the admin's translation. */
const TEXT = {
  back: "← Методики",
  newTitle: "Новая методика",
  loading: "Загружаем…",
  save: "Сохранить",
  saved: "Сохранено",
  texts: "Название и описание для родителей",
  textsHint: "Для публикации нужны все три языка; черновик можно сохранить с одним русским.",
  name: "Название",
  summary: "Описание",
  missing: "не заполнено",
  basics: "Основное",
  slug: "Адрес (латиница, цифры и дефисы; потом не меняется)",
  source: "Источник: на чём основана методика",
  ageMin: "Возраст от",
  ageMax: "до",
  published: "Опубликована: предлагается родителям",
  sortOrder: "Порядок в списках (меньше — выше)",
  prompt: "Для Muse Spark (по-английски, по одному пункту в строке)",
  structure: "Шаги сюжета по порядку",
  rules: "Правила",
  avoid: "Чего избегать",
  preview: "Предпросмотр промпта",
  previewLead: (age: number) => `Так методика попадёт в промпт Muse Spark — пример для ребёнка ${age} лет:`,
  usage: (templates: number, books: number) => `Используют: книг каталога — ${templates}, книг — ${books}.`,
  remove: "Удалить",
  removeConfirm: "Удалить методику навсегда?",
  removeYes: "Да, удалить",
  removeNo: "Отмена",
  unpublish: "Снять с публикации",
  check: "Проверьте поля:",
};

const LANGS = [
  { code: "ru", label: "Русский" },
  { code: "kk", label: "Қазақша" },
  { code: "en", label: "English" },
] as const;
type Lang = (typeof LANGS)[number]["code"];

const label = "flex flex-col gap-1.5 text-sm font-semibold";
const error = "text-sm font-normal text-red-600";

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
  published: m.published,
  sortOrder: m.sortOrder,
});

const empty = { name: "", summary: "" };
const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const fields = (d: Draft, sortOrder: number) => ({
  texts: d.texts,
  source: d.source,
  ageMin: d.ageMin,
  ageMax: d.ageMax,
  structure: lines(d.structure),
  rules: lines(d.rules),
  avoid: lines(d.avoid),
  published: d.published,
  sortOrder,
});

/** /admin/methodologies/[slug]: loads the method, then edits it. */
export function MethodologyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const method = useQuery({ queryKey: ["admin", "methodology", slug], queryFn: () => adminMethodology(slug) });
  if (method.isError) return <p role="alert" className="text-red-600">{method.error.message}</p>;
  if (!method.data) return <p className="text-muted">{TEXT.loading}</p>;
  // Keyed so the form starts over from the saved method after each save.
  return <MethodologyEditor key={method.data.updatedAt} initial={method.data} />;
}

/** Edits a method, or with no `initial` creates one. */
export function MethodologyEditor({ initial }: { initial?: AdminMethodology }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const all = useAdminMethodologies();
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? toDraft(initial)
      : {
          slug: "",
          texts: { ru: empty, kk: empty, en: empty },
          source: "",
          ageMin: 4,
          ageMax: 8,
          structure: "",
          rules: "",
          avoid: "",
          published: false,
          sortOrder: null,
        },
  );
  const [lang, setLang] = useState<Lang>("ru");
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const sortOrder = draft.sortOrder ?? (all.data?.at(-1)?.sortOrder ?? -10) + 10;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setText = (key: "name" | "summary", value: string) =>
    setDraft((d) => ({ ...d, texts: { ...d.texts, [lang]: { ...d.texts[lang], [key]: value } } }));
  const refresh = (saved: AdminMethodology) => {
    queryClient.setQueryData(["admin", "methodology", saved.slug], saved);
    void queryClient.invalidateQueries({ queryKey: ["admin", "methodologies"] });
    // The site's lists pick the change up on their next load.
    void queryClient.invalidateQueries({ queryKey: ["methodologies"] });
  };

  const save = useMutation({
    mutationFn: async (next: Draft) => {
      // Checked here with the API's own rules, so each problem is shown next to its field.
      const body = { ...fields(next, sortOrder), slug: next.slug };
      const parsed = initial ? UpdateMethodologySchema.safeParse(body) : CreateMethodologySchema.safeParse(body);
      if (!parsed.success) {
        setProblems(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
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

  const problem = (path: string) => problems[path] && <span className={error}>{problems[path]}</span>;
  const langProblem = (code: Lang) => Object.keys(problems).some((path) => path.startsWith(`texts.${code}.`));
  const unfilled = (code: Lang) => !draft.texts[code].name || !draft.texts[code].summary;
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
      <Link href="/admin/methodologies" className="text-sm font-semibold text-accent">
        {TEXT.back}
      </Link>
      <PageTitle
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {savedNow && <span data-testid="methodology-saved" className="text-sm text-emerald-600">{TEXT.saved}</span>}
            {initial && !confirming && (
              <button
                type="button"
                data-testid="methodology-delete"
                onClick={() => {
                  remove.reset();
                  setConfirming(true);
                }}
                className={`${ghostButton} flex items-center gap-2 text-red-600`}
              >
                <Trash2 className="size-4" />
                {TEXT.remove}
              </button>
            )}
            <button type="submit" data-testid="methodology-save" disabled={save.isPending} className={`${button} flex items-center gap-2`}>
              <Save className="size-4" />
              {TEXT.save}
            </button>
          </div>
        }
      >
        {initial ? initial.texts.ru.name || initial.slug : TEXT.newTitle}
      </PageTitle>

      {confirming && (
        <div role="alertdialog" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <span className="font-semibold">{TEXT.removeConfirm}</span>
          <button
            type="button"
            data-testid="methodology-delete-confirm"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {TEXT.removeYes}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={ghostButton}>
            {TEXT.removeNo}
          </button>
        </div>
      )}
      {remove.isError && (
        <div data-testid="methodology-delete-error" role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p>{remove.error.message}</p>
          {inUse && draft.published && (
            <button
              type="button"
              data-testid="methodology-unpublish"
              disabled={save.isPending}
              onClick={() => {
                const next = { ...draft, published: false };
                setDraft(next);
                save.mutate(next);
              }}
              className={`${ghostButton} self-start`}
            >
              {TEXT.unpublish}
            </button>
          )}
        </div>
      )}
      {save.isError && <p role="alert" className="text-red-600">{save.error.message}</p>}
      {Object.keys(problems).length > 0 && (
        <div role="alert" data-testid="methodology-problems" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-600">
          {TEXT.check}
          <ul className="list-disc pl-5">
            {Object.values(problems).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={TEXT.texts}>
          <div role="tablist" className="flex gap-1 rounded-xl bg-background p-1">
            {LANGS.map(({ code, label: name }) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={lang === code}
                data-testid={`methodology-tab-${code}`}
                onClick={() => setLang(code)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  lang === code ? "bg-card shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                {name}
                {(unfilled(code) || langProblem(code)) && (
                  <span title={TEXT.missing} className={`size-1.5 rounded-full ${langProblem(code) ? "bg-red-600" : "bg-amber-500"}`} />
                )}
              </button>
            ))}
          </div>
          <label className={label}>
            {TEXT.name}
            <input
              key={`name-${lang}`}
              data-testid={`methodology-name-${lang}`}
              className={input}
              value={draft.texts[lang].name}
              onChange={(e) => setText("name", e.target.value)}
            />
            {problem(`texts.${lang}.name`)}
          </label>
          <label className={label}>
            {TEXT.summary}
            <textarea
              key={`summary-${lang}`}
              data-testid={`methodology-summary-${lang}`}
              className={`${input} min-h-24`}
              value={draft.texts[lang].summary}
              onChange={(e) => setText("summary", e.target.value)}
            />
            {problem(`texts.${lang}.summary`)}
          </label>
          <p className="text-xs text-muted">{TEXT.textsHint}</p>
        </Card>

        <Card title={TEXT.basics}>
          <label className={label}>
            {TEXT.slug}
            <input
              data-testid="methodology-slug"
              className={`${input} font-mono text-sm disabled:opacity-60`}
              value={draft.slug}
              disabled={Boolean(initial)}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
            />
            {problem("slug")}
          </label>
          <label className={label}>
            {TEXT.source}
            <input data-testid="methodology-source" className={input} value={draft.source} onChange={(e) => set("source", e.target.value)} />
            {problem("source")}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {TEXT.ageMin}
              <input
                type="number"
                data-testid="methodology-age-min"
                min={METHODOLOGY_AGE_MIN}
                max={METHODOLOGY_AGE_MAX}
                className={input}
                value={draft.ageMin}
                onChange={(e) => set("ageMin", Number(e.target.value))}
              />
              {problem("ageMin")}
            </label>
            <label className={label}>
              {TEXT.ageMax}
              <input
                type="number"
                data-testid="methodology-age-max"
                min={METHODOLOGY_AGE_MIN}
                max={METHODOLOGY_AGE_MAX}
                className={input}
                value={draft.ageMax}
                onChange={(e) => set("ageMax", Number(e.target.value))}
              />
              {problem("ageMax")}
            </label>
          </div>
          <label className={label}>
            {TEXT.sortOrder}
            <input
              type="number"
              data-testid="methodology-sort"
              min={0}
              className={input}
              value={sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
            />
            {problem("sortOrder")}
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              data-testid="methodology-published"
              checked={draft.published}
              onChange={(e) => set("published", e.target.checked)}
            />
            {TEXT.published}
          </label>
          {problem("published")}
          {initial && (
            <p data-testid="methodology-usage" className="text-sm text-muted">
              {TEXT.usage(initial.templates, initial.books)}
            </p>
          )}
        </Card>
      </div>

      <Card
        title={TEXT.prompt}
        action={
          <button
            type="button"
            data-testid="methodology-preview"
            disabled={preview.isPending}
            onClick={() => preview.mutate()}
            className={`${ghostButton} flex items-center gap-2 py-1 text-sm`}
          >
            <Eye className="size-4" />
            {TEXT.preview}
          </button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <label className={label}>
            {TEXT.structure}
            <textarea
              data-testid="methodology-structure"
              className={`${input} min-h-48 font-mono text-xs`}
              value={draft.structure}
              onChange={(e) => set("structure", e.target.value)}
            />
            {problem("structure")}
          </label>
          <label className={label}>
            {TEXT.rules}
            <textarea
              data-testid="methodology-rules"
              className={`${input} min-h-48 font-mono text-xs`}
              value={draft.rules}
              onChange={(e) => set("rules", e.target.value)}
            />
            {problem("rules")}
          </label>
          <label className={label}>
            {TEXT.avoid}
            <textarea
              data-testid="methodology-avoid"
              className={`${input} min-h-48 font-mono text-xs`}
              value={draft.avoid}
              onChange={(e) => set("avoid", e.target.value)}
            />
            {problem("avoid")}
          </label>
        </div>
        {preview.isError && <p role="alert" className="text-red-600">{preview.error.message}</p>}
        {preview.data && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{TEXT.previewLead(preview.data.age)}</p>
            <pre data-testid="methodology-preview-text" className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-background p-4 font-mono text-xs leading-relaxed">
              {preview.data.prompt}
            </pre>
          </div>
        )}
      </Card>
    </form>
  );
}
