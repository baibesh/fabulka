"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { methodologyText, themesFor, type AdminTemplate, type SelectableTheme, type TemplateQuestion } from "@fabulka/shared";
import { Plus, Save, Trash2 } from "lucide-react";
import { use, useState } from "react";
import { adminTemplate, updateTemplate } from "@/lib/admin-api";
import { Card, PageTitle, useAdminI18n } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { BackLink } from "@/components/ui/page";

export function TemplateEditor({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const template = useQuery({ queryKey: ["admin", "template", slug], queryFn: () => adminTemplate(slug) });
  if (!template.data) return <QueryState error={template.error} scope="admin" />;
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
        layoutTheme: (draft.layoutTheme as SelectableTheme | null) ?? null,
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
      <BackLink href="/admin/catalog">{t("admin.template.back")}</BackLink>
      <PageTitle
        aside={
          <div className="flex items-center gap-3">
            {save.isSuccess && <span data-testid="template-saved" className="text-sm text-success">{t("admin.saved")}</span>}
            <Button type="submit" data-testid="template-save" loading={save.isPending} icon={<Save className="size-4" />}>
              {t("admin.save")}
            </Button>
          </div>
        }
      >
        {initial.title}
      </PageTitle>
      {save.isError && <ErrorText>{save.error.message}</ErrorText>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("admin.template.card")}>
          <Field label={t("admin.template.title")}>
            <Input data-testid="template-title-input" value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label={t("admin.template.summary")}>
            <Textarea className="min-h-20" value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("admin.template.ageMin")}>
              <Input type="number" min={2} max={10} value={draft.ageMin} onChange={(e) => set("ageMin", Number(e.target.value))} />
            </Field>
            <Field label={t("admin.template.ageMax")}>
              <Input type="number" min={2} max={10} value={draft.ageMax} onChange={(e) => set("ageMax", Number(e.target.value))} />
            </Field>
          </div>
          <ChoiceLabel strong>
            <Checkbox checked={draft.published} onChange={(e) => set("published", e.target.checked)} />
            {t("admin.template.published")}
          </ChoiceLabel>
        </Card>

        <Card title={t("admin.template.story")}>
          <Field label={t("admin.template.method")}>
            <Select value={draft.methodology} onChange={(e) => set("methodology", e.target.value)}>
              {/* The saved slug stays selectable while the list loads. */}
              {!methods.data?.some((m) => m.slug === draft.methodology) && <option value={draft.methodology}>{draft.methodology}</option>}
              {methods.data?.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {t(m.published ? "admin.template.method.option" : "admin.template.method.draft", {
                    name: methodologyText(m.texts, locale).name,
                    min: m.ageMin,
                    max: m.ageMax,
                  })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("admin.template.theme")}>
            <Input value={draft.theme} onChange={(e) => set("theme", e.target.value)} />
          </Field>
          <Field label={t("admin.template.plot")}>
            <Textarea code className="min-h-40" value={plot} onChange={(e) => setPlot(e.target.value)} />
          </Field>
          <Field label={t("admin.template.layoutTheme")} hint={t("admin.template.layoutTheme.hint")}>
            <Select
              data-testid="template-layout-theme"
              value={draft.layoutTheme ?? ""}
              onChange={(e) => set("layoutTheme", e.target.value || null)}
            >
              <option value="">{t("admin.template.layoutTheme.auto")}</option>
              {themesFor(draft.languages).map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {t(`design.theme.${theme.id as SelectableTheme}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("admin.template.style")}>
            <Textarea code className="min-h-16" value={draft.stylePrompt ?? ""} onChange={(e) => set("stylePrompt", e.target.value)} />
          </Field>
        </Card>
      </div>

      <Card
        title={t("admin.template.questions")}
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() =>
              set("questions", [...draft.questions, { key: `q${draft.questions.length + 1}`, label: "", kind: "text", required: false }])
            }
          >
            {t("admin.template.question.add")}
          </Button>
        }
      >
        {draft.questions.map((q, i) => (
          <div key={i} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[8rem_1fr_8rem_auto]">
            <Input
              code
              aria-label={t("admin.template.question.key")}
              value={q.key}
              placeholder={t("admin.template.question.key")}
              onChange={(e) => setQuestion(i, { key: e.target.value })}
            />
            <Input aria-label={t("admin.template.question.label")} value={q.label} placeholder={t("admin.template.question.label")} onChange={(e) => setQuestion(i, { label: e.target.value })} />
            <Select value={q.kind} onChange={(e) => setQuestion(i, { kind: e.target.value as TemplateQuestion["kind"] })}>
              <option value="text">{t("admin.template.question.text")}</option>
              <option value="choice">{t("admin.template.question.choice")}</option>
            </Select>
            <IconButton variant="ghost" label={t("admin.template.question.remove")} onClick={() => set("questions", draft.questions.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </IconButton>
            {q.kind === "choice" ? (
              <Input
                className="md:col-span-3"
                aria-label={t("admin.template.question.options")}
                defaultValue={q.options?.join(", ") ?? ""}
                placeholder={t("admin.template.question.options")}
                onBlur={(e) => setQuestion(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
              />
            ) : (
              <Input
                className="md:col-span-3"
                aria-label={t("admin.template.question.placeholder")}
                value={q.placeholder ?? ""}
                placeholder={t("admin.template.question.placeholder")}
                onChange={(e) => setQuestion(i, { placeholder: e.target.value || undefined })}
              />
            )}
            <ChoiceLabel>
              <Checkbox checked={q.required} onChange={(e) => setQuestion(i, { required: e.target.checked })} />
              {t("admin.template.question.required")}
            </ChoiceLabel>
          </div>
        ))}
      </Card>
    </form>
  );
}
