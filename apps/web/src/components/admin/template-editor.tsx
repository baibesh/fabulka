"use client";

import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BLOCK_LIMITS,
  DEFAULT_ADDABLE,
  DEFAULT_BLOCKS,
  OPTIONAL_KINDS,
  BOOK_THEMES,
  CHILD_AGE_MAX,
  CHILD_AGE_MIN,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_NAMES,
  SAMPLE_BOOKS,
  TemplateBlocksSchema,
  allowedFor,
  defaultThemeId,
  inLanguageOrder,
  methodologyText,
  newLayout,
  pickLanguage,
  themesFor,
  withTheme,
  type AdminBook,
  type AdminTemplate,
  type BookTheme,
  type CountriesMode,
  type Language,
  type TemplateBlocks,
  type TemplateSamples,
  type TemplateQuestion,
} from "@fabulka/shared";
import { BookPage, BookStyles, PX_PER_MM, useRenderedBook, type PreviewableBook } from "@/components/book/book-pages";
import { themeName } from "@/lib/themes";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { adminBook, adminTemplate, adminThemes, setTemplateSample, setTemplateVisibility, updateTemplate } from "@/lib/admin-api";
import { useCountryName } from "@/hooks/use-country-name";
import { Notice } from "@/components/ui/notice";
import { useCatalogError } from "./catalog-table";
import { CountriesField } from "./countries-field";
import { Card, PageTitle, useAdminI18n } from "./ui";
import { useAdminHref, useWorkingCountry } from "./working-country";
import { useAdminMethodologies } from "./use-methodologies";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { BackLink } from "@/components/ui/page";

export function TemplateEditor() {
  const { slug } = useParams<{ slug: string }>();
  const template = useQuery({ queryKey: ["admin", "template", slug], queryFn: () => adminTemplate(slug) });
  if (!template.data) return <QueryState error={template.error} scope="admin" />;
  // Keyed so the form starts over from the saved book after each save.
  return <Editor key={template.data.title + template.data.plot.join()} initial={template.data} />;
}

function Editor({ initial }: { initial: AdminTemplate }) {
  const adminHref = useAdminHref();
  const { t, locale } = useAdminI18n();
  const queryClient = useQueryClient();
  const { access } = useWorkingCountry();
  // Content, countries and global samples are the same everywhere: only global staff change them.
  // A country manager sees them read-only and changes their countries' visibility and samples.
  const global = allowedFor(access, "catalog", null);
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
  // Published themes whose fonts cover every language of the book (the curated ones while loading).
  const allThemes = useQuery({ queryKey: ["admin", "themes"], queryFn: adminThemes });
  const themes: BookTheme[] = allThemes.data
    ? allThemes.data.filter((x) => x.status === "published" && draft.languages.every((l) => x.theme.languages.includes(l))).map((x) => x.theme)
    : themesFor(draft.languages);
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
        layoutTheme: draft.layoutTheme ?? null,
        samples: Object.fromEntries(LANGUAGES.map((l) => [l, draft.samples[l] ?? null])),
        countries: draft.countries,
        countriesMode: draft.countriesMode,
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
      <BackLink href={adminHref("/admin/catalog")}>{t("admin.template.back")}</BackLink>
      <PageTitle
        aside={
          <div className="flex items-center gap-3">
            {save.isSuccess && <span data-testid="template-saved" className="text-sm text-success">{t("admin.saved")}</span>}
            {global && (
              <Button type="submit" data-testid="template-save" loading={save.isPending} disabled={!blocksOk} icon={<Save className="size-4" />}>
                {t("admin.save")}
              </Button>
            )}
          </div>
        }
      >
        {initial.title}
      </PageTitle>
      {save.isError && <ErrorText>{save.error.message}</ErrorText>}
      {!global && <Notice data-testid="template-readonly">{t("admin.template.readonly")}</Notice>}
      {!global && <CountryVisibility template={initial} />}

      <fieldset disabled={!global} className="contents">
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
                <Input type="number" min={CHILD_AGE_MIN} max={CHILD_AGE_MAX} value={draft.ageMin} onChange={(e) => set("ageMin", Number(e.target.value))} />
              </Field>
              <Field label={t("admin.template.ageMax")}>
                <Input type="number" min={CHILD_AGE_MIN} max={CHILD_AGE_MAX} value={draft.ageMax} onChange={(e) => set("ageMax", Number(e.target.value))} />
              </Field>
            </div>
            <ChoiceLabel strong>
              <Checkbox checked={draft.published} onChange={(e) => set("published", e.target.checked)} />
              {t("admin.template.published")}
            </ChoiceLabel>
            {global && (
              <TemplateCountries
                value={draft.countries}
                mode={draft.countriesMode}
                onChange={(countries) => set("countries", countries)}
                onModeChange={(mode) => set("countriesMode", mode)}
              />
            )}
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
                data-options={themes.map((theme) => theme.id).join(" ")}
                data-loaded={allThemes.data ? "true" : "false"}
                value={draft.layoutTheme ?? ""}
                onChange={(e) => set("layoutTheme", e.target.value || null)}
              >
                <option value="">{t("admin.template.layoutTheme.auto")}</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {themeName(theme, t, locale)}
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
      </fieldset>

      <SamplesCard template={draft} countrySamples={initial.countrySamples} global={global} onChange={(samples) => set("samples", samples)} />

      <TemplatePreview template={draft} blocks={blocksOk ? blocks : null} theme={themes.find((x) => x.id === draft.layoutTheme) ?? null} />

      <fieldset disabled={!global} className="contents">
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
      </fieldset>
    </form>
  );
}

/** Where the catalog lists the book (or, "everywhere except…", where it does not); none means everywhere. */
function TemplateCountries({
  value,
  mode,
  onChange,
  onModeChange,
}: {
  value: string[];
  mode: CountriesMode;
  onChange: (next: string[]) => void;
  onModeChange: (mode: CountriesMode) => void;
}) {
  const { t } = useAdminI18n();
  return (
    <CountriesField
      testId="template-countries"
      chipTestId="template-country"
      label={t("admin.template.countries")}
      hint={t("admin.template.countries.hint")}
      empty={
        <span data-testid="template-countries-all" className="text-sm text-muted">
          {t("admin.template.countries.all")}
        </span>
      }
      value={value}
      mode={mode}
      onModeChange={onModeChange}
      onChange={onChange}
    />
  );
}

/**
 * A country manager's one change to a catalog book's listing: shown or hidden in each of their
 * countries (the others stay as they are).
 */
function CountryVisibility({ template }: { template: AdminTemplate }) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const countryName = useCountryName("admin");
  const errorText = useCatalogError();
  const { options } = useWorkingCountry();
  const toggle = useMutation({
    mutationFn: ({ country, visible }: { country: string; visible: boolean }) => setTemplateVisibility(template.slug, country, visible),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin", "template", template.slug], saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
    },
  });
  const rule = { mode: template.countriesMode, countries: template.countries };
  return (
    <Card title={t("admin.template.visibility")} data-testid="template-visibility">
      <ul className="flex flex-wrap gap-3">
        {options.map((country) => {
          const visible = rule.countries.length === 0 || rule.countries.includes(country) === (rule.mode === "include");
          return (
            <li key={country}>
              <ChoiceLabel>
                <Checkbox
                  data-testid={`template-visible-${country}`}
                  checked={visible}
                  disabled={toggle.isPending}
                  onChange={(e) => toggle.mutate({ country, visible: e.target.checked })}
                />
                {countryName(country)}
              </ChoiceLabel>
            </li>
          );
        })}
      </ul>
      {toggle.isError && <ErrorText>{errorText(toggle.error)}</ErrorText>}
    </Card>
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

/**
 * The sample book per language, globally or for one country: a finished book from this template in
 * that language, picked from the ones made so far (a country's from the books made there). Visitors
 * see their country's sample, else the global one, else one in the language they read next. Global
 * samples are saved with the form (global staff only); a country's are saved at once.
 */
function SamplesCard({
  template,
  countrySamples,
  global,
  onChange,
}: {
  template: AdminTemplate;
  /** The countries' samples as saved (they are saved at once, not with the form). */
  countrySamples: AdminTemplate["countrySamples"];
  global: boolean;
  onChange: (samples: TemplateSamples) => void;
}) {
  const adminHref = useAdminHref();
  const { t, date } = useAdminI18n();
  const queryClient = useQueryClient();
  const countryName = useCountryName("admin");
  const errorText = useCatalogError();
  const { country: working, options: countries, me } = useWorkingCountry();
  const books = me.permissions.includes("books");
  const [scope, setScope] = useState<string>(working ?? (global ? "" : (countries[0] ?? "")));
  const country = scope || null;
  const save = useMutation({
    mutationFn: ({ language, bookId }: { language: Language; bookId: string | null }) => setTemplateSample(template.slug, country, language, bookId),
    onSuccess: (saved) => queryClient.setQueryData(["admin", "template", template.slug], saved),
  });
  const own = country ? (countrySamples[country] ?? {}) : template.samples;
  return (
    <Card
      title={t("admin.template.samples")}
      data-testid="template-samples"
      data-country={country ?? ""}
      action={
        <Select data-testid="template-samples-country" aria-label={t("admin.template.samples.country")} value={scope} onChange={(e) => setScope(e.target.value)}>
          {global && <option value="">{t("admin.template.samples.global")}</option>}
          {countries.map((code) => (
            <option key={code} value={code}>
              {countryName(code)}
            </option>
          ))}
        </Select>
      }
    >
      <p className="-mt-2 text-sm text-muted">{country ? t("admin.template.samples.countryHint") : t("admin.template.samples.hint")}</p>
      <ul className="flex flex-col gap-2">
        {LANGUAGES.map((language) => {
          const options = template.sampleOptions.filter((o) => o.language === language && (!country || o.country === country));
          const current = own[language] ?? "";
          const fallback = country ? template.samples[language] : undefined;
          return (
            <li key={language} className="grid items-center gap-2 sm:grid-cols-[8rem_1fr_auto]">
              <span className="text-sm font-medium">{LANGUAGE_NAMES[language]}</span>
              <Select
                data-testid={`template-sample-${language}`}
                data-value={current}
                aria-label={`${t("admin.template.samples")}: ${LANGUAGE_NAMES[language]}`}
                value={current}
                disabled={(!options.length && !current) || save.isPending || (!country && !global)}
                onChange={(e) =>
                  country ? save.mutate({ language, bookId: e.target.value || null }) : onChange({ ...template.samples, [language]: e.target.value || undefined })
                }
              >
                <option value="">
                  {country && fallback ? t("admin.template.samples.usesGlobal") : options.length ? t("admin.template.samples.none") : t("admin.template.samples.empty")}
                </option>
                {/* A sample that is not among the options (an older book) stays selectable. */}
                {current && !options.some((o) => o.id === current) && <option value={current}>{current}</option>}
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {t("admin.template.samples.option", { title: o.title ?? o.id, name: o.childName, date: date(o.createdAt) })}
                  </option>
                ))}
              </Select>
              {current && books ? (
                <Link href={adminHref(`/admin/books/${current}`)} className="flex items-center gap-1 text-sm font-semibold text-accent">
                  <ExternalLink className="size-4" />
                  {t("admin.template.samples.open")}
                </Link>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      {save.isSuccess && (
        <span data-testid="template-sample-saved" className="text-sm text-success">
          {t("admin.saved")}
        </span>
      )}
      {save.isError && <ErrorText>{errorText(save.error)}</ErrorText>}
    </Card>
  );
}

/**
 * The template's sample book as it will print, through the same renderer as the reader and the PDF,
 * in a chosen language: the sample in that language (else in its fallback) with its own text when
 * it is in that language, the shared sample text otherwise, always with its pictures; in the theme
 * and blocks picked above (saved or not).
 */
function TemplatePreview({ template, blocks, theme }: { template: AdminTemplate; blocks: TemplateBlocks | null; theme: BookTheme | null }) {
  const { t } = useAdminI18n();
  const [language, setLanguage] = useState<Language>(inLanguageOrder(template.languages)[0] ?? DEFAULT_LANGUAGE);
  const sampleLanguage = pickLanguage(
    LANGUAGES.filter((l) => template.samples[l]),
    language,
  );
  const sampleId = sampleLanguage ? template.samples[sampleLanguage] : undefined;
  const sample = useQuery({
    queryKey: ["admin", "book", sampleId],
    queryFn: () => adminBook(sampleId!),
    enabled: !!sampleId,
  });
  const book = previewBook(sample.data ?? null, language, theme ?? BOOK_THEMES[defaultThemeId(template.ageMin)], blocks, template.ageMin);
  return (
    <Card
      title={t("admin.template.preview")}
      data-testid="template-preview"
      data-language={language}
      data-theme={book.layout.theme.id}
      action={
        <Select data-testid="template-preview-language" aria-label={t("admin.template.preview.language")} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </Select>
      }
    >
      <p className="-mt-2 text-sm text-muted">{sampleId ? t("admin.template.preview.hint") : t("admin.template.preview.noSample")}</p>
      <PreviewPages book={book} />
    </Card>
  );
}

/** The book a template preview shows (see TemplatePreview). */
function previewBook(sample: AdminBook | null, language: Language, theme: BookTheme, blocks: TemplateBlocks | null, age: number): PreviewableBook {
  const text = SAMPLE_BOOKS[language];
  const own = sample?.language === language;
  const count = sample?.pages.length ?? text.pages.length;
  const pages = Array.from({ length: count }, (_, i) => ({
    page: sample?.pages[i]?.page ?? i + 1,
    text: own ? sample.pages[i].text : text.pages[i % text.pages.length],
    imageUrl: sample?.pages[i]?.imageUrl ?? null,
  }));
  const base = sample ? withTheme(sample.layout, theme) : newLayout(theme, age);
  const layout = { ...base, blocks: blocks?.order ?? base.blocks, addable: blocks?.addable ?? base.addable, dedication: null };
  return {
    title: own ? sample.title : text.title,
    childName: own ? sample.childName : text.childName,
    language,
    heroImageUrl: sample?.heroImageUrl ?? null,
    pages,
    talkQuestions: own ? sample.talkQuestions : text.talkQuestions,
    layout,
  };
}

/** Every page small, in print order. */
function PreviewPages({ book }: { book: PreviewableBook }) {
  const rendered = useRenderedBook(book);
  const { widthMm, heightMm } = book.layout.format;
  const width = 150;
  const scale = width / (widthMm * PX_PER_MM);
  if (!rendered) return null;
  return (
    <ol className="flex flex-wrap gap-3" style={{ ["--fb-scale" as string]: String(scale) }}>
      <BookStyles />
      {rendered.pages.map((page) => (
        <li key={page.key} data-testid="template-preview-page" data-key={page.key} className="flex flex-col items-center gap-1">
          <div className="overflow-hidden rounded border border-border shadow-sm" style={{ width, height: (width * heightMm) / widthMm }}>
            <BookPage html={page.html} widthMm={widthMm} heightMm={heightMm} />
          </div>
          <span className="text-xs text-muted">{page.index + 1}</span>
        </li>
      ))}
    </ol>
  );
}
