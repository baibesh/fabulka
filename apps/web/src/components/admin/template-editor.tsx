"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminTemplate, TemplateQuestion } from "@fabulka/shared";
import { Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { adminTemplate, updateTemplate } from "@/lib/admin-api";
import { button, Card, ghostButton, input, PageTitle, useAdminI18n } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";

const label = "flex flex-col gap-1.5 text-sm font-semibold";

export function TemplateEditor({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t } = useAdminI18n();
  const template = useQuery({ queryKey: ["admin", "template", slug], queryFn: () => adminTemplate(slug) });
  if (template.isError) return <p role="alert" className="text-red-600">{template.error.message}</p>;
  if (!template.data) return <p className="text-muted">{t("admin.loading")}</p>;
  // Keyed so the form starts over from the saved book after each save.
  return <Editor key={template.data.title + template.data.plot.join()} initial={template.data} />;
}

function Editor({ initial }: { initial: AdminTemplate }) {
  const { t, locale } = useAdminI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const methods = useAdminMethodologies();
  const [plot, setPlot] = useState(initial.plot.join("\n"));
  const set = <K extends keyof AdminTemplate>(key: K, value: AdminTemplate[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setQuestion = (index: number, patch: Partial<TemplateQuestion>) =>
    set(
      "questions",
      draft.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );

  const save = useMutation({
    mutationFn: () =>
      updateTemplate(initial.slug, {
        title: draft.title,
        summary: draft.summary,
        ageMin: draft.ageMin,
        ageMax: draft.ageMax,
        methodology: draft.methodology,
        theme: draft.theme,
        plot: plot.split("\n").map((line) => line.trim()).filter(Boolean),
        questions: draft.questions,
        stylePrompt: draft.stylePrompt?.trim() || null,
        published: draft.published,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin", "template", initial.slug], saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
    },
  });

  return (
    <form
      data-testid="template-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-6"
    >
      <Link href="/admin/catalog" className="text-sm font-semibold text-accent">
        {t("admin.template.back")}
      </Link>
      <PageTitle
        aside={
          <div className="flex items-center gap-3">
            {save.isSuccess && <span data-testid="template-saved" className="text-sm text-emerald-600">{t("admin.saved")}</span>}
            <button type="submit" data-testid="template-save" disabled={save.isPending} className={`${button} flex items-center gap-2`}>
              <Save className="size-4" />
              {t("admin.save")}
            </button>
          </div>
        }
      >
        {initial.title}
      </PageTitle>
      {save.isError && <p role="alert" className="text-red-600">{save.error.message}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("admin.template.card")}>
          <label className={label}>
            {t("admin.template.title")}
            <input data-testid="template-title-input" className={input} value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className={label}>
            {t("admin.template.summary")}
            <textarea className={`${input} min-h-20`} value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("admin.template.ageMin")}
              <input type="number" min={2} max={10} className={input} value={draft.ageMin} onChange={(e) => set("ageMin", Number(e.target.value))} />
            </label>
            <label className={label}>
              {t("admin.template.ageMax")}
              <input type="number" min={2} max={10} className={input} value={draft.ageMax} onChange={(e) => set("ageMax", Number(e.target.value))} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={draft.published} onChange={(e) => set("published", e.target.checked)} />
            {t("admin.template.published")}
          </label>
        </Card>

        <Card title={t("admin.template.story")}>
          <label className={label}>
            {t("admin.template.method")}
            <select className={input} value={draft.methodology} onChange={(e) => set("methodology", e.target.value)}>
              {/* The saved slug stays selectable while the list loads. */}
              {!methods.data?.some((m) => m.slug === draft.methodology) && <option value={draft.methodology}>{draft.methodology}</option>}
              {methods.data?.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {t(m.published ? "admin.template.method.option" : "admin.template.method.draft", {
                    name: m.texts[locale].name || m.texts.ru.name,
                    min: m.ageMin,
                    max: m.ageMax,
                  })}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t("admin.template.theme")}
            <input className={input} value={draft.theme} onChange={(e) => set("theme", e.target.value)} />
          </label>
          <label className={label}>
            {t("admin.template.plot")}
            <textarea className={`${input} min-h-40 font-mono text-xs`} value={plot} onChange={(e) => setPlot(e.target.value)} />
          </label>
          <label className={label}>
            {t("admin.template.style")}
            <textarea className={`${input} min-h-16 text-xs`} value={draft.stylePrompt ?? ""} onChange={(e) => set("stylePrompt", e.target.value)} />
          </label>
        </Card>
      </div>

      <Card
        title={t("admin.template.questions")}
        action={
          <button
            type="button"
            className={`${ghostButton} flex items-center gap-1 py-1 text-sm`}
            onClick={() =>
              set("questions", [...draft.questions, { key: `q${draft.questions.length + 1}`, label: "", kind: "text", required: false }])
            }
          >
            <Plus className="size-4" />
            {t("admin.template.question.add")}
          </button>
        }
      >
        {draft.questions.map((q, i) => (
          <div key={i} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[8rem_1fr_8rem_auto]">
            <input className={`${input} font-mono text-xs`} value={q.key} placeholder={t("admin.template.question.key")} onChange={(e) => setQuestion(i, { key: e.target.value })} />
            <input className={input} value={q.label} placeholder={t("admin.template.question.label")} onChange={(e) => setQuestion(i, { label: e.target.value })} />
            <select className={input} value={q.kind} onChange={(e) => setQuestion(i, { kind: e.target.value as TemplateQuestion["kind"] })}>
              <option value="text">{t("admin.template.question.text")}</option>
              <option value="choice">{t("admin.template.question.choice")}</option>
            </select>
            <button type="button" aria-label={t("admin.template.question.remove")} className="text-muted hover:text-red-600" onClick={() => set("questions", draft.questions.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </button>
            {q.kind === "choice" ? (
              <input
                className={`${input} md:col-span-3`}
                defaultValue={q.options?.join(", ") ?? ""}
                placeholder={t("admin.template.question.options")}
                onBlur={(e) => setQuestion(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
              />
            ) : (
              <input
                className={`${input} md:col-span-3`}
                value={q.placeholder ?? ""}
                placeholder={t("admin.template.question.placeholder")}
                onChange={(e) => setQuestion(i, { placeholder: e.target.value || undefined })}
              />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={q.required} onChange={(e) => setQuestion(i, { required: e.target.checked })} />
              {t("admin.template.question.required")}
            </label>
          </div>
        ))}
      </Card>
    </form>
  );
}
