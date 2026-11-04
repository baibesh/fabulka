"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AGE_GROUPS,
  AGE_LIMITS,
  BOOK_FONTS,
  LANGUAGES,
  LANGUAGE_NAMES,
  MIN_DECOR_CONTRAST,
  MIN_LARGE_CONTRAST,
  MIN_TEXT_CONTRAST,
  ORNAMENTS,
  PAGE_VARIANTS,
  PALETTE_ROLES,
  PRESET_GRIDS,
  SAMPLE_BOOKS,
  SAMPLE_COMIC,
  THEME_REFUSED,
  ThemeEditSchema,
  ThemeRefusalSchema,
  applyEdit,
  blankPage,
  checksPass,
  contrast,
  editOf,
  isTwoPage,
  layoutPanels,
  luminance,
  newLayout,
  quickChecks,
  type AdminTheme,
  type AgeGroup,
  type BookTheme,
  type Language,
  type PageVariant,
  type PaletteRole,
  type ThemeCheck,
  type ThemeEdit,
  type ThemeRefinement,
  type TypeScale,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, History, Save, Sparkles, Upload, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import "@/components/book/book-fonts";
import { BookPage, BookStyles, PX_PER_MM, useRenderedBook, type PreviewableBook } from "@/components/book/book-pages";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, ChoiceLabel, Radio } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ErrorText, Notice } from "@/components/ui/notice";
import { BackLink } from "@/components/ui/page";
import { QueryState } from "@/components/ui/query-state";
import { adminTheme, checkTheme, discardTheme, publishTheme, refineTheme, saveTheme, themeHistory, uploadThemeOrnament } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { themeName } from "@/lib/themes";
import { StaffBudgetNote, useCapError, useRefreshBudget } from "./staff-budget";
import { Checks, useThemeNameById } from "./themes-page";
import { Card, PageTitle, useAdminI18n } from "./ui";
import { useAdminHref, useCan } from "./working-country";

const FAMILIES = Object.keys(BOOK_FONTS);
/** The comic lettering a theme starts with when staff switch it on (the comic theme's). */
const DEFAULT_LETTERING = { font: { family: "Nunito", weight: 800 }, scale: 0.74 };
/** A child's age in each band, for the preview's type sizes. */
const AGE_OF: Record<AgeGroup, number> = { young: 3, middle: 6, older: 9 };
const SIZE_FIELDS = ["bodyPt", "lineHeight", "titlePt", "headingPt", "maxWords"] as const satisfies readonly (keyof TypeScale)[];
const SIZE_STEP: Record<(typeof SIZE_FIELDS)[number], number> = { bodyPt: 0.5, lineHeight: 0.01, titlePt: 0.5, headingPt: 0.5, maxWords: 1 };

/** /admin/themes/:id: a stored theme's editor (curated themes are duplicated first). */
export function ThemeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const theme = useQuery({ queryKey: ["admin", "theme", id], queryFn: () => adminTheme(id) });
  if (!theme.data) return <QueryState error={theme.error} scope="admin" />;
  return <ThemeEditor entry={theme.data} />;
}

/**
 * Edits a theme by hand: name, colors, fonts (with a sample in every script), sizes by age, page
 * layouts, the cover, the ornament and comic lettering, with a live preview drawn by the book
 * renderer and the checks inline. Saving runs every check (the sample book in five languages too);
 * a theme that fails stays a draft. A published theme's saves wait as pending changes. Muse Spark
 * can adjust the fields to the owner's words, shown as a diff before anything changes.
 */
function ThemeEditor({ entry }: { entry: AdminTheme }) {
  const { t, locale, date } = useAdminI18n();
  const adminHref = useAdminHref();
  const canEdit = useCan("themes");
  const queryClient = useQueryClient();
  const nameOf = useThemeNameById();
  const id = entry.theme.id;
  // What the editor edits: the pending changes when there are some, else the theme itself.
  const current = entry.draft?.theme ?? entry.theme;
  const baseline = useMemo(() => editOf(current), [current]);
  const [edit, setEdit] = useState<ThemeEdit>(baseline);
  const [notice, setNotice] = useState<"saved" | "savedFailed" | "applied" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(edit) !== JSON.stringify(baseline);
  const parsed = ThemeEditSchema.safeParse(edit);
  const preview = useMemo(() => applyEdit(current, edit), [current, edit]);
  const savedChecks = entry.draft?.checks ?? entry.checks;
  const live = useLiveChecks(parsed.success ? parsed.data : null, preview);
  const publishable = checksPass(savedChecks) && (entry.status === "draft" || !!entry.draft);

  const update = (next: AdminTheme) => {
    queryClient.setQueryData(["admin", "theme", id], next);
    void queryClient.invalidateQueries({ queryKey: ["admin", "themes"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "theme-history", id] });
  };
  const save = useMutation({
    mutationFn: () => saveTheme(id, ThemeEditSchema.parse(edit)),
    onSuccess: (next) => {
      update(next);
      setEdit(editOf(next.draft?.theme ?? next.theme));
      setNotice(checksPass(next.draft?.checks ?? next.checks) ? "saved" : "savedFailed");
    },
  });
  const publish = useMutation({ mutationFn: () => publishTheme(id), onSuccess: update });
  const discard = useMutation({
    mutationFn: () => discardTheme(id),
    onSuccess: (next) => {
      update(next);
      setEdit(editOf(next.theme));
      setConfirmDiscard(false);
    },
  });
  const refusal =
    publish.error instanceof ApiError && publish.error.code === THEME_REFUSED ? ThemeRefusalSchema.safeParse(publish.error.body).data : undefined;

  const set = (patch: Partial<ThemeEdit>) => {
    setNotice(null);
    setEdit((e) => ({ ...e, ...patch }));
  };

  return (
    <div className="flex flex-col gap-6" data-testid="theme-editor" data-id={id} data-status={entry.status} data-dirty={dirty}>
      <BackLink href={adminHref("/admin/themes")}>{t("admin.themeEditor.back")}</BackLink>
      <PageTitle
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={entry.status === "published" ? "success" : "warning"}>{t(`admin.themes.status.${entry.status}`)}</Badge>
            {entry.draft && <Badge tone="accent">{t("admin.themes.pending")}</Badge>}
            {dirty && (
              <span data-testid="theme-unsaved" className="text-sm text-muted">
                {t("admin.themeEditor.unsaved")}
              </span>
            )}
            {canEdit && (
              <>
                <Button
                  data-testid="theme-save"
                  icon={<Save className="size-4" />}
                  loading={save.isPending}
                  disabled={!parsed.success || (!dirty && !save.isError)}
                  onClick={() => save.mutate()}
                >
                  {t("admin.themeEditor.save")}
                </Button>
                {(entry.status === "draft" || entry.draft) && (
                  <Button
                    variant="success"
                    data-testid="theme-publish"
                    loading={publish.isPending}
                    disabled={!publishable || dirty}
                    title={dirty ? t("admin.themeEditor.publish.unsaved") : publishable ? undefined : t("admin.themes.publish.blocked")}
                    onClick={() => publish.mutate()}
                  >
                    {entry.draft ? t("admin.themeEditor.publishChanges") : t("admin.themeEditor.publish")}
                  </Button>
                )}
                {entry.draft &&
                  (confirmDiscard ? (
                    <Button variant="danger" data-testid="theme-discard-confirm" loading={discard.isPending} onClick={() => discard.mutate()}>
                      {t("admin.themeEditor.discard.confirm")}
                    </Button>
                  ) : (
                    <Button variant="danger-outline" data-testid="theme-discard" onClick={() => setConfirmDiscard(true)}>
                      {t("admin.themeEditor.discard")}
                    </Button>
                  ))}
              </>
            )}
          </div>
        }
      >
        {themeName(preview, t, locale)}
      </PageTitle>

      <div className="flex flex-col gap-2">
        {entry.basedOn && <p className="text-sm text-muted">{t("admin.themes.copyOf", { name: nameOf(entry.basedOn) })}</p>}
        <Notice tone={entry.status === "published" ? "accent" : "subtle"} data-testid="theme-behaviour">
          {entry.status === "published" ? t("admin.themeEditor.publishedNote") : t("admin.themeEditor.draftNote")}
        </Notice>
        {entry.draft && entry.updatedAt && (
          <p data-testid="theme-pending-note" className="text-sm text-muted">
            {t("admin.themeEditor.pendingNote", { date: date(entry.updatedAt) })}
          </p>
        )}
        {save.isPending && <p className="text-sm text-muted">{t("admin.themeEditor.saving")}</p>}
        {notice === "saved" && (
          <p data-testid="theme-saved" className="text-sm text-success">
            {t("admin.themeEditor.saved")}
          </p>
        )}
        {notice === "savedFailed" && (
          <p data-testid="theme-saved-failed" role="alert" className="text-sm font-semibold text-danger">
            {t("admin.themeEditor.savedFailed")}
          </p>
        )}
        {notice === "applied" && (
          <p data-testid="theme-refine-applied" className="text-sm text-success">
            {t("admin.themeEditor.refine.applied")}
          </p>
        )}
        {!parsed.success && (
          <ErrorText data-testid="theme-invalid">
            {t("admin.themeEditor.invalid", { fields: [...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ") })}
          </ErrorText>
        )}
        {refusal && (
          <div data-testid="theme-refused" role="alert" className="flex flex-col gap-1 rounded-xl bg-danger/10 p-3 text-sm">
            <p className="font-bold text-danger">{t("admin.themes.publish.blocked")}</p>
            <Checks checks={refusal.checks.filter((c) => !c.ok)} />
          </div>
        )}
        {(save.isError || discard.isError || (publish.isError && !refusal)) && <ErrorText>{(save.error ?? discard.error ?? publish.error)?.message}</ErrorText>}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
          <NameCard edit={edit} set={set} />
          <ColorsCard edit={edit} set={set} />
          <FontsCard edit={edit} set={set} checks={live.checks} />
          <SizesCard edit={edit} set={set} checks={live.checks} />
          <LayoutCard edit={edit} set={set} />
          <OrnamentCard id={id} edit={edit} set={set} />
          <LetteringCard edit={edit} set={set} />
        </fieldset>
        <div className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pb-2">
          <ThemePreview theme={preview} />
          <ChecksCard live={live} saved={savedChecks} dirty={dirty} />
          {canEdit && (
            <RefineCard
              id={id}
              edit={parsed.success ? parsed.data : null}
              onApply={(next) => {
                setEdit(next);
                setNotice("applied");
              }}
            />
          )}
          <HistoryCard id={id} onLoad={(theme) => set(editOf(theme))} canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}

type Section = { edit: ThemeEdit; set: (patch: Partial<ThemeEdit>) => void };

function NameCard({ edit, set }: Section) {
  const { t } = useAdminI18n();
  return (
    <Card title={t("admin.themeEditor.section.name")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {LANGUAGES.map((l) => (
          <Field key={l} label={LANGUAGE_NAMES[l]} error={edit.name[l].trim() ? undefined : " "}>
            <Input
              data-testid={`theme-name-${l}`}
              maxLength={40}
              value={edit.name[l]}
              onChange={(e) => set({ name: { ...edit.name, [l]: e.target.value } })}
            />
          </Field>
        ))}
      </div>
    </Card>
  );
}

/** Text pairs and the contrast each needs (checkContrast's pairs), shown under the colors. */
const PAIRS: { fg: PaletteRole; bg: PaletteRole; min: number }[] = [
  { fg: "ink", bg: "paper", min: MIN_TEXT_CONTRAST },
  { fg: "ink", bg: "plate", min: MIN_TEXT_CONTRAST },
  { fg: "ink", bg: "cover", min: MIN_LARGE_CONTRAST },
  { fg: "muted", bg: "paper", min: MIN_LARGE_CONTRAST },
  { fg: "accent", bg: "paper", min: MIN_DECOR_CONTRAST },
];

function ColorsCard({ edit, set }: Section) {
  const { t, number } = useAdminI18n();
  const hex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
  const setColor = (role: PaletteRole, value: string) => set({ palette: { ...edit.palette, [role]: value } });
  return (
    <Card title={t("admin.themeEditor.section.colors")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {PALETTE_ROLES.map((role) => (
          <div key={role} className="flex items-center gap-3">
            <input
              type="color"
              aria-label={t(`admin.themeEditor.color.${role}`)}
              data-testid={`theme-color-picker-${role}`}
              className="size-10 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent"
              value={hex(edit.palette[role]) ? edit.palette[role] : "#000000"}
              onChange={(e) => setColor(role, e.target.value)}
            />
            <Field label={t(`admin.themeEditor.color.${role}`)} hint={t(`admin.themeEditor.color.${role}.hint`)} className="min-w-0 flex-1">
              <Input
                code
                small
                data-testid={`theme-color-${role}`}
                invalid={!hex(edit.palette[role])}
                value={edit.palette[role]}
                onChange={(e) => setColor(role, e.target.value.trim())}
              />
            </Field>
          </div>
        ))}
      </div>
      <ul data-testid="theme-contrast" className="flex flex-col gap-1 text-sm">
        {PAIRS.map(({ fg, bg, min }) => {
          const a = edit.palette[fg];
          const b = edit.palette[bg];
          if (!hex(a) || !hex(b)) return null;
          const ratio = contrast(luminance(a), luminance(b));
          const ok = ratio >= min;
          return (
            <li key={`${fg}-${bg}`} data-testid="theme-contrast-pair" data-pair={`${fg}-${bg}`} data-ok={ok} className="flex items-center gap-2">
              <span className="inline-flex h-6 min-w-12 items-center justify-center rounded px-1.5 text-xs font-bold" style={{ background: b, color: a }}>
                Aa
              </span>
              <span className={ok ? "text-muted" : "font-semibold text-danger"}>
                {t(`admin.themeEditor.color.${fg}`)} / {t(`admin.themeEditor.color.${bg}`)}: {number(Math.round(ratio * 100) / 100)} (≥ {min})
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function FontPicker({
  label,
  font,
  onChange,
  testid,
}: {
  label: string;
  font: { family: string; weight: number };
  onChange: (font: { family: string; weight: number }) => void;
  testid: string;
}) {
  const { t } = useAdminI18n();
  const known = BOOK_FONTS[font.family];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={label} className="min-w-44 flex-1">
          <Select
            data-testid={`${testid}-family`}
            value={font.family}
            onChange={(e) => {
              const family = e.target.value;
              const weights = BOOK_FONTS[family].weights;
              onChange({ family, weight: weights.includes(font.weight) ? font.weight : weights[0] });
            }}
          >
            {FAMILIES.map((family) => (
              <option key={family} value={family}>
                {family}
                {BOOK_FONTS[family].body ? "" : ` (${t("admin.themeEditor.font.display")})`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("admin.themeEditor.font.weight")} className="w-32">
          <Select data-testid={`${testid}-weight`} value={font.weight} onChange={(e) => onChange({ ...font, weight: Number(e.target.value) })}>
            {(known?.weights ?? [font.weight]).map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FontSample font={font} />
    </div>
  );
}

/** The font on the sample book's title in each language: its letters as the book prints them. */
function FontSample({ font, caps = false }: { font: { family: string; weight: number }; caps?: boolean }) {
  const { t } = useAdminI18n();
  return (
    <div data-testid="theme-font-sample" className="rounded-xl border border-border bg-surface p-3">
      <p className="mb-1 text-xs text-muted">{t("admin.themeEditor.font.sample")}</p>
      <ul className="flex flex-col gap-0.5">
        {LANGUAGES.map((l) => (
          <li key={l} lang={l} className="flex items-baseline gap-2">
            <span className="w-7 shrink-0 text-xs text-muted uppercase">{l}</span>
            <span
              className="truncate text-lg"
              style={{
                fontFamily: `'${font.family}', ${BOOK_FONTS[font.family]?.generic ?? "serif"}`,
                fontWeight: font.weight,
                textTransform: caps ? "uppercase" : undefined,
              }}
            >
              {caps ? SAMPLE_COMIC[l].speech[0] : SAMPLE_BOOKS[l].title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FontsCard({ edit, set, checks }: Section & { checks: ThemeCheck[] }) {
  const { t } = useAdminI18n();
  return (
    <Card title={t("admin.themeEditor.section.fonts")}>
      <FontPicker
        label={t("admin.themeEditor.font.heading")}
        testid="theme-font-heading"
        font={edit.fonts.heading}
        onChange={(heading) => set({ fonts: { ...edit.fonts, heading } })}
      />
      <FontPicker
        label={t("admin.themeEditor.font.body")}
        testid="theme-font-body"
        font={edit.fonts.body}
        onChange={(body) => set({ fonts: { ...edit.fonts, body } })}
      />
      <InlineProblem checks={checks} kind="fonts" />
      <InlineProblem checks={checks} kind="glyphs" />
    </Card>
  );
}

function SizesCard({ edit, set, checks }: Section & { checks: ThemeCheck[] }) {
  const { t } = useAdminI18n();
  const setSize = (group: AgeGroup, field: keyof TypeScale, value: number) =>
    set({ sizes: { ...edit.sizes, [group]: { ...edit.sizes[group], [field]: value } } });
  return (
    <Card title={t("admin.themeEditor.section.sizes")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-2 font-semibold" />
              {SIZE_FIELDS.map((f) => (
                <th key={f} className="py-1 pr-2 font-semibold">
                  {t(`admin.themeEditor.size.${f}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AGE_GROUPS.map((group) => (
              <tr key={group}>
                <th className="py-1 pr-2 text-left font-semibold whitespace-nowrap">
                  {t(`admin.themeEditor.age.${group}`)}
                  <span className="block text-xs font-normal text-muted">
                    {AGE_LIMITS[group].bodyPt[0]}-{AGE_LIMITS[group].bodyPt[1]} pt · ≤ {AGE_LIMITS[group].maxWords}
                  </span>
                </th>
                {SIZE_FIELDS.map((f) => (
                  <td key={f} className="py-1 pr-2">
                    <Input
                      small
                      type="number"
                      step={SIZE_STEP[f]}
                      min={0}
                      aria-label={`${t(`admin.themeEditor.age.${group}`)} · ${t(`admin.themeEditor.size.${f}`)}`}
                      data-testid={`theme-size-${group}-${f}`}
                      value={edit.sizes[group][f]}
                      onChange={(e) => setSize(group, f, Number(e.target.value))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InlineProblem checks={checks} kind="sizes" />
    </Card>
  );
}

/** A failed check of one kind, next to the fields it is about. */
function InlineProblem({ checks, kind }: { checks: ThemeCheck[]; kind: ThemeCheck["check"] }) {
  const failed = checks.filter((c) => c.check === kind && !c.ok);
  if (!failed.length) return null;
  return (
    <div data-testid={`theme-inline-${kind}`} role="alert" className="rounded-xl bg-danger/10 p-3">
      <Checks checks={failed} />
    </div>
  );
}

function LayoutCard({ edit, set }: Section) {
  const { t } = useAdminI18n();
  const move = (from: number, to: number) => {
    if (to < 0 || to >= edit.variants.length) return;
    const variants = [...edit.variants];
    const [v] = variants.splice(from, 1);
    variants.splice(to, 0, v);
    set({ variants });
  };
  const toggle = (variant: PageVariant, on: boolean) =>
    set({ variants: on ? [...edit.variants, variant] : edit.variants.filter((v) => v !== variant) });
  const unused = PAGE_VARIANTS.filter((v) => !edit.variants.includes(v));
  return (
    <Card title={t("admin.themeEditor.section.layout")}>
      <Field label={t("admin.themeEditor.variants")} hint={t("admin.themeEditor.variants.hint")}>
        <ol data-testid="theme-variants" className="flex flex-col gap-1">
          {edit.variants.map((v, i) => (
            <li key={v} data-testid="theme-variant" data-variant={v} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
              <Checkbox checked aria-label={t(`admin.themeEditor.variant.${v}`)} disabled={edit.variants.length === 1} onChange={() => toggle(v, false)} />
              <span className="w-5 text-xs text-muted">{i + 1}</span>
              <span className="flex-1 text-sm">{t(`admin.themeEditor.variant.${v}`)}</span>
              <IconButton size="sm" variant="ghost" label="↑" disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton size="sm" variant="ghost" label="↓" disabled={i === edit.variants.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowDown className="size-4" />
              </IconButton>
            </li>
          ))}
          {unused.map((v) => (
            <li key={v} className="flex items-center gap-2 px-2 py-1 text-muted">
              <Checkbox checked={false} data-testid={`theme-variant-add-${v}`} aria-label={t(`admin.themeEditor.variant.${v}`)} onChange={() => toggle(v, true)} />
              <span className="w-5" />
              <span className="flex-1 text-sm">{t(`admin.themeEditor.variant.${v}`)}</span>
            </li>
          ))}
        </ol>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold">{t("admin.themeEditor.textSpace")}</legend>
          {(["top", "bottom", null] as const).map((space) => (
            <ChoiceLabel key={space ?? "none"}>
              <Radio name="textSpace" checked={edit.textSpace === space} onChange={() => set({ textSpace: space })} />
              {t(`admin.themeEditor.textSpace.${space ?? "none"}`)}
            </ChoiceLabel>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold">{t("admin.themeEditor.cover")}</legend>
          {(["framed", "scene"] as const).map((cover) => (
            <ChoiceLabel key={cover}>
              <Radio name="cover" data-testid={`theme-cover-${cover}`} checked={edit.cover === cover} onChange={() => set({ cover })} />
              {t(`admin.themeEditor.cover.${cover}`)}
            </ChoiceLabel>
          ))}
        </fieldset>
      </div>
    </Card>
  );
}

function OrnamentCard({ id, edit, set }: Section & { id: string }) {
  const { t } = useAdminI18n();
  const upload = useMutation({
    mutationFn: async (file: File) => uploadThemeOrnament(id, await dataUrl(file)),
    onSuccess: (result) => set({ ornamentImage: result.path }),
  });
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload.mutate(file);
  };
  return (
    <Card title={t("admin.themeEditor.section.ornament")}>
      <Field label={t("admin.themeEditor.ornament.shape")}>
        <Select data-testid="theme-ornament-shape" value={edit.ornament} onChange={(e) => set({ ornament: e.target.value as ThemeEdit["ornament"] })}>
          {ORNAMENTS.map((o) => (
            <option key={o} value={o}>
              {t(`admin.themeEditor.ornament.${o}`)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{t("admin.themeEditor.ornament.image")}</span>
        <div className="flex flex-wrap items-center gap-3">
          {edit.ornamentImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- a stored file of any size, shown small.
            <img data-testid="theme-ornament-image" src={`/files/${edit.ornamentImage}`} alt={t("admin.themes.ornament")} className="size-16 rounded border border-border object-contain" />
          ) : (
            <span className="text-sm text-muted">{t("admin.themeEditor.ornament.none")}</span>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-surface">
            <Upload className="size-4" />
            {t("admin.themeEditor.ornament.upload")}
            <input data-testid="theme-ornament-upload" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pick} />
          </label>
          {edit.ornamentImage && (
            <Button size="sm" variant="ghost" data-testid="theme-ornament-remove" icon={<X className="size-4" />} onClick={() => set({ ornamentImage: null })}>
              {t("admin.themeEditor.ornament.remove")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">{t("admin.themeEditor.ornament.hint")}</p>
        {upload.isPending && <p className="text-sm text-muted">…</p>}
        {upload.isError && <ErrorText>{upload.error.message}</ErrorText>}
      </div>
    </Card>
  );
}

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read"));
    reader.readAsDataURL(file);
  });
}

function LetteringCard({ edit, set }: Section) {
  const { t } = useAdminI18n();
  const lettering = edit.lettering;
  return (
    <Card title={t("admin.themeEditor.section.lettering")}>
      <ChoiceLabel>
        <Checkbox data-testid="theme-lettering" checked={!!lettering} onChange={(e) => set({ lettering: e.target.checked ? DEFAULT_LETTERING : null })} />
        {t("admin.themeEditor.lettering.on")}
      </ChoiceLabel>
      <p className="-mt-2 text-xs text-muted">{t("admin.themeEditor.lettering.hint")}</p>
      {lettering && (
        <>
          <FontPicker
            label={t("admin.themeEditor.lettering.font")}
            testid="theme-lettering-font"
            font={lettering.font}
            onChange={(font) => set({ lettering: { ...lettering, font } })}
          />
          <Field label={t("admin.themeEditor.lettering.scale")} className="w-48">
            <Input
              small
              type="number"
              step={0.02}
              min={0.4}
              max={1.2}
              data-testid="theme-lettering-scale"
              value={lettering.scale}
              onChange={(e) => set({ lettering: { ...lettering, scale: Number(e.target.value) } })}
            />
          </Field>
          <FontSample font={lettering.font} caps />
        </>
      )}
    </Card>
  );
}

/** A pastel sample picture with a white disc where the hero stands, as a data URL. */
const picture = (color: string, w = 1536, h = 1024) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${color}"/><circle cx="${w / 2}" cy="${h * 0.43}" r="${Math.min(w, h) * 0.16}" fill="#ffffff" opacity="0.85"/></svg>`,
  )}`;
const HERO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#ffffff"/><circle cx="512" cy="430" r="230" fill="#F9D9A8"/><rect x="352" y="660" width="320" height="260" rx="120" fill="#BFE3D0"/></svg>`,
)}`;
const COLORS = ["#F9D9A8", "#BFE3D0", "#C9D7F2", "#F5C6D6"];
const COMIC_GRID = PRESET_GRIDS.find((g) => g.id === "big-top-2")!;
/** The story page whose layout the preview pins (it starts on a left page, so two-page layouts fit). */
const STORY_PAGE = 2;
const COMIC_PAGE = 3;

/** The sample book in `language`, laid out in `theme` for a child in `group`, its story page pinned to `variant`. */
function previewBook(theme: BookTheme, language: Language, group: AgeGroup, variant: PageVariant): PreviewableBook {
  const sample = SAMPLE_BOOKS[language];
  const comic = SAMPLE_COMIC[language];
  const comicTheme = theme.lettering !== null;
  const texts = [
    { id: "3.1", kind: "caption" as const, frame: 1, speaker: null, text: comic.caption },
    { id: "3.2", kind: "speech" as const, frame: 1, speaker: "hero", text: comic.speech[0] },
    { id: "3.3", kind: "speech" as const, frame: 2, speaker: "hero", text: comic.speech[1] },
    { id: "3.4", kind: "sfx" as const, frame: 3, speaker: null, text: comic.sfx },
  ];
  const frames = COMIC_GRID.frames.map((rect, i) => ({ frame: i + 1, rect, imageUrl: picture(COLORS[i % COLORS.length]) }));
  let layout = newLayout(theme, AGE_OF[group]);
  layout = { ...layout, pages: { [String(STORY_PAGE)]: { ...blankPage(), pin: variant, options: [variant, "plate"] } } };
  if (comicTheme) {
    layout = layoutPanels({ ...layout, panels: { gutterMm: 3, borderMm: 0.8 } }, [
      {
        page: COMIC_PAGE,
        frames: COMIC_GRID.frames.map((rect, i) => ({ frame: i + 1, rect, subject: null, aspect: 1.5, cast: [] })),
        texts,
      },
    ]);
  }
  return {
    title: sample.title,
    childName: sample.childName,
    language,
    heroImageUrl: HERO,
    pages: sample.pages.map((text, i) => {
      const page = i + 1;
      if (comicTheme && page === COMIC_PAGE)
        return { page, text: texts.map((x) => x.text).join(" "), imageUrl: frames[0].imageUrl, grid: COMIC_GRID.id, frames, texts };
      return { page, text, imageUrl: picture(COLORS[i % COLORS.length]) };
    }),
    talkQuestions: sample.talkQuestions,
    layout,
  };
}

/** Cover, dedication, the story page (both halves of a two-page layout), the comic page and the end, rendered. */
function ThemePreview({ theme }: { theme: BookTheme }) {
  const { t, locale } = useAdminI18n();
  const [language, setLanguage] = useState<Language>(locale);
  const [group, setGroup] = useState<AgeGroup>("middle");
  const [picked, setPicked] = useState<PageVariant | null>(null);
  const variant = picked && (theme.variants.includes(picked) || picked === "plate") ? picked : theme.variants[0];
  const book = useMemo(() => previewBook(theme, language, group, variant), [theme, language, group, variant]);
  const rendered = useRenderedBook(book);
  const { widthMm, heightMm } = book.layout.format;
  const width = 200;
  const scale = width / (widthMm * PX_PER_MM);
  const label = (key: string) =>
    key === "cover"
      ? t("admin.themeEditor.preview.cover")
      : key === "dedication"
        ? t("admin.themeEditor.preview.dedication")
        : key === "end"
          ? t("admin.themeEditor.preview.end")
          : key.startsWith(`story-${COMIC_PAGE}`)
            ? t("admin.themeEditor.preview.comic")
            : t("admin.themeEditor.preview.story");
  const keys = new Set(["cover", "dedication", `story-${STORY_PAGE}`, `story-${STORY_PAGE}-b`, "end"]);
  if (theme.lettering) keys.add(`story-${COMIC_PAGE}`);
  const pages = rendered?.pages.filter((p) => keys.has(p.key)) ?? [];
  return (
    <Card title={t("admin.themeEditor.preview")} data-testid="theme-preview" data-language={language} data-variant={variant} data-age={group}>
      <p className="-mt-2 text-sm text-muted">{t("admin.themeEditor.preview.hint")}</p>
      <div className="flex flex-wrap gap-3">
        <Field label={t("admin.themeEditor.preview.language")} className="w-36">
          <Select data-testid="theme-preview-language" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("admin.themeEditor.preview.age")} className="w-32">
          <Select data-testid="theme-preview-age" value={group} onChange={(e) => setGroup(e.target.value as AgeGroup)}>
            {AGE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`admin.themeEditor.age.${g}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("admin.themeEditor.preview.variant")} className="min-w-48 flex-1">
          <Select data-testid="theme-preview-variant" value={variant} onChange={(e) => setPicked(e.target.value as PageVariant)}>
            {[...theme.variants, ...(theme.variants.includes("plate") ? [] : (["plate"] as const))].map((v) => (
              <option key={v} value={v}>
                {t(`admin.themeEditor.variant.${v}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ol className="flex flex-wrap gap-3" style={{ ["--fb-scale" as string]: String(scale) }}>
        <BookStyles />
        {pages.map((page) => (
          <li
            key={page.key}
            data-testid="theme-preview-page"
            data-key={page.key}
            className={`flex flex-col items-center gap-1 ${isTwoPage(variant) && page.key === `story-${STORY_PAGE}` ? "-mr-3" : ""}`}
          >
            <div className="overflow-hidden rounded border border-border shadow-sm" style={{ width, height: (width * heightMm) / widthMm }}>
              <BookPage html={page.html} widthMm={widthMm} heightMm={heightMm} />
            </div>
            <span className="text-xs text-muted">{label(page.key)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The fields' checks as staff type (debounced; fonts, contrast, sizes and every letter, no renderer):
 * the ones that need no font files at once, the server's when it answers.
 */
function useLiveChecks(edit: ThemeEdit | null, theme: BookTheme): { checks: ThemeCheck[]; fetching: boolean } {
  const [debounced, setDebounced] = useState(edit);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(edit), 400);
    return () => clearTimeout(timer);
  }, [edit]);
  const live = useQuery({
    queryKey: ["admin", "theme-check", debounced],
    queryFn: () => checkTheme(debounced!),
    enabled: !!debounced,
    placeholderData: (previous) => previous,
  });
  // An answer for older fields could hide a problem typed since: the quick checks win until it catches up.
  const fresh = !!live.data && !live.isPlaceholderData && JSON.stringify(debounced) === JSON.stringify(edit);
  const glyphs = live.data?.filter((c) => c.check === "glyphs") ?? [];
  return { checks: fresh ? live.data! : [...quickChecks(theme), ...glyphs], fetching: live.isFetching };
}

/** The fields' live checks, and the saved version's (the sample book through render QA included). */
function ChecksCard({ live, saved, dirty }: { live: { checks: ThemeCheck[]; fetching: boolean }; saved: ThemeCheck[]; dirty: boolean }) {
  const { t } = useAdminI18n();
  const checks = live.checks;
  const failed = checks.filter((c) => !c.ok).length;
  const savedFailed = saved.filter((c) => !c.ok).length;
  return (
    <Card title={t("admin.themeEditor.checks")} data-testid="theme-checks-card" data-live-ok={failed === 0} data-saved-ok={checksPass(saved)}>
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {t("admin.themeEditor.checks.live")}
          {live.fetching && <span className="font-normal text-muted">{t("admin.themeEditor.checks.running")}</span>}
        </p>
        <p data-testid="theme-live-verdict" className={failed ? "text-sm font-semibold text-danger" : "text-sm text-success"}>
          {failed ? t("admin.themeEditor.checks.failed", { n: failed }) : t("admin.themeEditor.checks.ok")}
        </p>
        <div data-testid="theme-live-checks">
          <Checks checks={failed ? checks.filter((c) => !c.ok) : checks.filter((c) => c.check !== "glyphs")} />
        </div>
      </div>
      {saved.length > 0 && (
        <div className={`flex flex-col gap-2 ${dirty ? "opacity-60" : ""}`}>
          <p className="text-sm font-semibold">{t("admin.themeEditor.checks.saved")}</p>
          <p data-testid="theme-saved-verdict" className={savedFailed ? "text-sm font-semibold text-danger" : "text-sm text-success"}>
            {savedFailed ? t("admin.themeEditor.checks.failed", { n: savedFailed }) : t("admin.themeEditor.checks.ok")}
          </p>
          <div data-testid="theme-saved-checks">
            <Checks checks={savedFailed ? saved.filter((c) => !c.ok) : saved.filter((c) => c.check === "render")} />
          </div>
        </div>
      )}
    </Card>
  );
}

/** A changed field's value as a short text: a color with its swatch, a font, a list. */
function Value({ value }: { value: unknown }) {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value))
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-4 rounded-full border border-border" style={{ background: value }} />
        <code>{value}</code>
      </span>
    );
  if (value === null || value === undefined) return <span className="text-muted">-</span>;
  if (typeof value === "object") return <code className="break-all">{Array.isArray(value) ? value.join(", ") : JSON.stringify(value)}</code>;
  return <code>{String(value)}</code>;
}

function RefineCard({ id, edit, onApply }: { id: string; edit: ThemeEdit | null; onApply: (next: ThemeEdit) => void }) {
  const { t } = useAdminI18n();
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<ThemeRefinement | null>(null);
  const refreshBudget = useRefreshBudget();
  const capError = useCapError();
  const refine = useMutation({
    mutationFn: () => refineTheme(id, comment.trim(), edit!),
    onSuccess: setResult,
    onSettled: refreshBudget,
  });
  const failed = result?.checks.filter((c) => !c.ok) ?? [];
  return (
    <Card title={t("admin.themeEditor.refine")} data-testid="theme-refine">
      <p className="-mt-2 text-sm text-muted">{t("admin.themeEditor.refine.hint")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          refine.mutate();
        }}
      >
        <Field label={t("admin.themeEditor.refine.comment")}>
          <Textarea data-testid="theme-refine-comment" className="min-h-16" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <StaffBudgetNote country={null} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            data-testid="theme-refine-submit"
            loading={refine.isPending}
            disabled={!edit || comment.trim().length < 3}
            icon={<Sparkles className="size-4" />}
          >
            {t("admin.themeEditor.refine.submit")}
          </Button>
          {refine.isPending && <span className="text-sm text-muted">{t("admin.themeEditor.refine.pending")}</span>}
        </div>
      </form>
      {refine.isError && <ErrorText>{capError(refine.error) ?? refine.error.message}</ErrorText>}
      {result && (
        <div data-testid="theme-refine-diff" className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{t("admin.themeEditor.refine.diff")}</p>
          {result.changes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 pr-3 font-semibold">{t("admin.themeEditor.refine.field")}</th>
                    <th className="py-1 pr-3 font-semibold">{t("admin.themeEditor.refine.before")}</th>
                    <th className="py-1 font-semibold">{t("admin.themeEditor.refine.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.changes.map((change) => (
                    <tr key={change.path} data-testid="theme-refine-change" data-path={change.path} className="border-t border-border align-top">
                      <td className="py-1 pr-3">
                        <code>{change.path}</code>
                      </td>
                      <td className="py-1 pr-3 text-muted line-through decoration-danger/60">
                        <Value value={change.before} />
                      </td>
                      <td className="py-1 font-semibold">
                        <Value value={change.after} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("admin.themeEditor.refine.none")}</p>
          )}
          {failed.length > 0 && (
            <div role="alert" className="rounded-xl bg-danger/10 p-3">
              <Checks checks={failed} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              data-testid="theme-refine-apply"
              disabled={!result.changes.length}
              onClick={() => {
                onApply(result.theme);
                setResult(null);
                setComment("");
              }}
            >
              {t("admin.themeEditor.refine.apply")}
            </Button>
            <Button size="sm" variant="ghost" data-testid="theme-refine-dismiss" onClick={() => setResult(null)}>
              {t("admin.themeEditor.refine.dismiss")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function HistoryCard({ id, onLoad, canEdit }: { id: string; onLoad: (theme: BookTheme) => void; canEdit: boolean }) {
  const { t, date } = useAdminI18n();
  const history = useQuery({ queryKey: ["admin", "theme-history", id], queryFn: () => themeHistory(id) });
  return (
    <Card title={t("admin.themeEditor.history")} data-testid="theme-history">
      {!history.data ? (
        <QueryState error={history.error} scope="admin" />
      ) : history.data.length ? (
        <ol className="flex flex-col gap-2 text-sm">
          {history.data.map((entry) => (
            <li key={entry.id} data-testid="theme-history-entry" data-action={entry.action} className="flex flex-wrap items-center gap-2">
              <History className="size-4 shrink-0 text-muted" />
              <span className="font-semibold">{t(`admin.themeEditor.history.${entry.action}`)}</span>
              <span className="text-muted">
                {t("admin.themeEditor.history.version", { n: entry.version })} · {date(entry.at)}
                {entry.who && ` · ${entry.who}`}
              </span>
              {!entry.ok && <Badge tone="danger">{t("admin.themeEditor.history.failed")}</Badge>}
              {canEdit && (
                <Button size="sm" variant="ghost" className="ml-auto" data-testid="theme-history-load" onClick={() => onLoad(entry.theme)}>
                  {t("admin.themeEditor.history.load")}
                </Button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">{t("admin.themeEditor.history.empty")}</p>
      )}
    </Card>
  );
}
