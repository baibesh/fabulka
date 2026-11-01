"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BLOCK_LIMITS,
  DEFAULT_ADDABLE,
  DEFAULT_BLOCKS,
  OPTIONAL_KINDS,
  TemplateBlocksSchema,
  methodologyText,
  themesFor,
  type AdminTemplate,
  type SelectableTheme,
  type TemplateBlocks,
  type TemplateQuestion,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
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

  const [blocks, setBlocks] = useState<TemplateBlocks>(() => initial.blocks ?? { order: DEFAULT_BLOCKS, addable: [...DEFAULT_ADDABLE] as TemplateBlocks["addable"] });
  const blocksOk = TemplateBlocksSchema.safeParse(blocks).success;
  const save = useMutation({
    mutationFn: () =>
      updateTemplate(initial.slug, {
        blocks,
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
            <Button type="submit" data-testid="template-save" loading={save.isPending} disabled={!blocksOk} icon={<Save className="size-4" />}>
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

      <BlocksCard blocks={blocks} onChange={setBlocks} valid={blocksOk} />

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

/**
 * The blocks the template's books get, in order, and what parents may do with them: move a block,
 * leave it out, add the optional kinds ticked below. The cover, the story and the end never move.
 */
function BlocksCard({ blocks, onChange, valid }: { blocks: TemplateBlocks; onChange: (next: TemplateBlocks) => void; valid: boolean }) {
  const { t } = useAdminI18n();
  const { order, addable } = blocks;
  const optional = (kind: string) => (OPTIONAL_KINDS as readonly string[]).includes(kind);
  const setOrder = (next: TemplateBlocks["order"]) => onChange({ ...blocks, order: next });
  const move = (i: number, by: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setOrder(next);
  };
  const canMove = (i: number, by: -1 | 1) => optional(order[i].kind) && i + by > 0 && i + by < order.length - 1;
  return (
    <Card title={t("admin.template.blocks")} data-testid="template-blocks">
      <p className="-mt-2 text-sm text-muted">{t("admin.template.blocks.hint")}</p>
      <ol className="flex flex-col gap-2">
        {order.map((block, i) => (
          <li key={`${block.kind}-${i}`} data-testid="template-block" data-kind={block.kind} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2 text-sm">
            <span className="w-6 text-right text-muted">{i + 1}</span>
            <span className="min-w-32 flex-1 font-medium">{t(`admin.template.block.${block.kind}`)}</span>
            {optional(block.kind) && (
              <>
                <ChoiceLabel>
                  <Checkbox
                    data-testid={`template-block-movable-${i}`}
                    checked={block.movable}
                    onChange={(e) => setOrder(order.map((b, j) => (j === i ? { ...b, movable: e.target.checked } : b)))}
                  />
                  {t("admin.template.block.movable")}
                </ChoiceLabel>
                <ChoiceLabel>
                  <Checkbox
                    data-testid={`template-block-optional-${i}`}
                    checked={block.optional}
                    onChange={(e) => setOrder(order.map((b, j) => (j === i ? { ...b, optional: e.target.checked } : b)))}
                  />
                  {t("admin.template.block.optional")}
                </ChoiceLabel>
                <IconButton label={t("admin.reference.city.up")} disabled={!canMove(i, -1)} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label={t("admin.reference.city.down")} disabled={!canMove(i, 1)} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton
                  data-testid={`template-block-remove-${i}`}
                  variant="ghost"
                  label={t("admin.template.block.remove")}
                  onClick={() => setOrder(order.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {OPTIONAL_KINDS.filter((kind) => order.filter((b) => b.kind === kind).length < BLOCK_LIMITS[kind]).map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            size="sm"
            data-testid={`template-block-add-${kind}`}
            icon={<Plus className="size-4" />}
            onClick={() => {
              const next = [...order];
              next.splice(next.length - 1, 0, { kind, movable: true, optional: true });
              setOrder(next);
            }}
          >
            {t(`admin.template.block.${kind}`)}
          </Button>
        ))}
      </div>
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="mb-1 font-semibold">{t("admin.template.blocks.addable")}</legend>
        {OPTIONAL_KINDS.map((kind) => (
          <ChoiceLabel key={kind}>
            <Checkbox
              data-testid={`template-addable-${kind}`}
              checked={addable.includes(kind)}
              onChange={(e) => onChange({ ...blocks, addable: e.target.checked ? [...addable, kind] : addable.filter((k) => k !== kind) })}
            />
            {t(`admin.template.block.${kind}`)}
          </ChoiceLabel>
        ))}
      </fieldset>
      {!valid && <ErrorText>{t("admin.template.blocks.invalid")}</ErrorText>}
    </Card>
  );
}
