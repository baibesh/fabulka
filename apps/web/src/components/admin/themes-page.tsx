"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LANGUAGES, LANGUAGE_NAMES, THEME_REFUSED, ThemeRefusalSchema, type AdminTheme, type Language, type ThemeCheck } from "@fabulka/shared";
import { Check, EyeOff, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { adminThemes, deleteTheme, proposeTheme, publishTheme, unpublishTheme } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { StaffBudgetNote, useCapError, useRefreshBudget } from "./staff-budget";
import { themeName } from "@/lib/themes";
import { Card, PageTitle, useAdminI18n } from "./ui";
import { useCan } from "./working-country";

const QUERY = ["admin", "themes"];

/**
 * /admin/themes: the curated themes (read-only) and the ones Muse Spark proposed. The owner types a
 * brief; the proposal is checked in code (fonts, contrast, sizes, glyphs, a sample book in all five
 * languages) and either refused with the reasons or kept as a draft with its page previews, which
 * the owner publishes - then staff and parents can pick it - takes back again, or deletes.
 */
export function ThemesPage() {
  const { t } = useAdminI18n();
  const themes = useQuery({ queryKey: QUERY, queryFn: adminThemes });
  // An illustrator reads the themes (what style references are for); only the themes right changes them.
  const canEdit = useCan("themes");
  return (
    <>
      <PageTitle>{t("admin.themes.title")}</PageTitle>
      <p className="-mt-4 text-sm text-muted">{t("admin.themes.lead")}</p>
      {canEdit && <ProposeCard />}
      {!themes.data ? (
        <QueryState error={themes.error} scope="admin" />
      ) : (
        <ul data-testid="themes-list" className="flex flex-col gap-4">
          {themes.data.map((theme) => (
            <ThemeCard key={theme.theme.id} entry={theme} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </>
  );
}

function ProposeCard() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState("");
  const refreshBudget = useRefreshBudget();
  const capError = useCapError();
  const propose = useMutation({
    mutationFn: () => proposeTheme(brief.trim()),
    onSuccess: () => {
      setBrief("");
      void queryClient.invalidateQueries({ queryKey: QUERY });
    },
    onSettled: refreshBudget,
  });
  const refusal =
    propose.error instanceof ApiError && propose.error.code === THEME_REFUSED ? ThemeRefusalSchema.safeParse(propose.error.body).data : undefined;
  return (
    <Card title={t("admin.themes.propose")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          propose.mutate();
        }}
      >
        <Field label={t("admin.themes.brief")} hint={t("admin.themes.brief.hint")}>
          <Textarea data-testid="theme-brief" className="min-h-20" maxLength={300} value={brief} onChange={(e) => setBrief(e.target.value)} />
        </Field>
        <StaffBudgetNote country={null} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            data-testid="theme-propose"
            loading={propose.isPending}
            disabled={brief.trim().length < 3}
            icon={<Sparkles className="size-4" />}
          >
            {t("admin.themes.propose.submit")}
          </Button>
          {propose.isPending && <span className="text-sm text-muted">{t("admin.themes.propose.pending")}</span>}
          {propose.isSuccess && (
            <span data-testid="theme-proposed" className="text-sm text-success">
              {t("admin.themes.propose.done")}
            </span>
          )}
        </div>
      </form>
      {refusal ? (
        <div data-testid="theme-refused" role="alert" className="flex flex-col gap-1 rounded-xl bg-danger/10 p-3 text-sm">
          <p className="font-bold text-danger">{t("admin.themes.refused")}</p>
          <Checks checks={refusal.checks.filter((c) => !c.ok)} />
        </div>
      ) : (
        propose.isError && <ErrorText data-testid="theme-error">{capError(propose.error) ?? propose.error.message}</ErrorText>
      )}
    </Card>
  );
}

/** What was checked and how it went; a failed check says what to fix. */
function Checks({ checks }: { checks: ThemeCheck[] }) {
  const { t } = useAdminI18n();
  return (
    <ul data-testid="theme-checks" className="flex flex-col gap-1 text-sm">
      {checks.map((check, i) => (
        <li key={i} data-testid="theme-check" data-check={check.check} data-ok={check.ok} data-language={check.language} className="flex gap-2">
          {check.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <X className="mt-0.5 size-4 shrink-0 text-danger" />}
          <span>
            <span className="font-semibold">
              {t(`admin.themes.check.${check.check}`)}
              {check.language && ` · ${LANGUAGE_NAMES[check.language]}`}
            </span>
            <span className="text-muted"> - {check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ThemeCard({ entry, canEdit }: { entry: AdminTheme; canEdit: boolean }) {
  const { t, locale, date } = useAdminI18n();
  const queryClient = useQueryClient();
  const { theme } = entry;
  const ai = theme.source === "ai";
  const [language, setLanguage] = useState<Language>(locale);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY });
  const publish = useMutation({ mutationFn: () => publishTheme(theme.id), onSuccess: refresh });
  const unpublish = useMutation({ mutationFn: () => unpublishTheme(theme.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteTheme(theme.id), onSuccess: refresh });
  const previews = entry.previews[language] ?? [];
  return (
    <li data-testid="theme-card" data-id={theme.id} data-source={theme.source} data-status={entry.status}>
      <Card
        title={themeName(theme, t, locale)}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={entry.status === "published" ? "success" : "warning"}>
              {ai ? t(`admin.themes.status.${entry.status}`) : t("admin.themes.curated")}
            </Badge>
            {canEdit && ai && entry.status === "draft" && (
              <Button size="sm" data-testid="theme-publish" loading={publish.isPending} onClick={() => publish.mutate()}>
                {t("admin.themes.publish")}
              </Button>
            )}
            {canEdit && ai && entry.status === "published" && (
              <Button
                size="sm"
                variant="secondary"
                data-testid="theme-unpublish"
                loading={unpublish.isPending}
                icon={<EyeOff className="size-4" />}
                title={t("admin.themes.unpublish.hint")}
                onClick={() => unpublish.mutate()}
              >
                {t("admin.themes.unpublish")}
              </Button>
            )}
            {canEdit &&
              ai &&
              (confirm ? (
                <Button size="sm" variant="danger" data-testid="theme-delete-confirm" loading={remove.isPending} onClick={() => remove.mutate()}>
                  {t("admin.themes.delete.confirm")}
                </Button>
              ) : (
                <Button size="sm" variant="danger-outline" data-testid="theme-delete" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
                  {t("admin.themes.delete")}
                </Button>
              ))}
          </div>
        }
      >
        {ai && entry.status === "published" && (
          <p data-testid="theme-unpublish-hint" className="-mt-2 text-xs text-muted">
            {t("admin.themes.unpublish.hint")}
          </p>
        )}
        {entry.brief && (
          <p className="-mt-2 text-sm text-muted">
            «{entry.brief}»{entry.createdAt && ` · ${date(entry.createdAt)}`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            {theme.fonts.body.family} / {theme.fonts.heading.family}
          </span>
          <span className="flex gap-1" aria-label={t("admin.themes.palette")}>
            {Object.entries(theme.palette).map(([key, color]) => (
              <span key={key} title={`${key} ${color}`} className="size-5 rounded-full border border-border" style={{ background: color }} />
            ))}
          </span>
          {theme.ornamentImage && (
            // eslint-disable-next-line @next/next/no-img-element -- a stored file of any size, shown small.
            <img data-testid="theme-ornament" src={`/files/${theme.ornamentImage}`} alt={t("admin.themes.ornament")} className="size-10 object-contain" />
          )}
        </div>
        {entry.checks.length > 0 && <Checks checks={entry.checks} />}
        {Object.keys(entry.previews).length > 0 && (
          <div className="flex flex-col gap-2">
            <div role="group" aria-label={t("admin.themes.previews")} className="flex flex-wrap gap-1">
              {LANGUAGES.map((l) => (
                <Button
                  key={l}
                  size="sm"
                  variant="secondary"
                  data-testid={`theme-preview-lang-${l}`}
                  aria-pressed={language === l}
                  disabled={!entry.previews[l]}
                  onClick={() => setLanguage(l)}
                >
                  {LANGUAGE_NAMES[l]}
                </Button>
              ))}
            </div>
            <ol data-testid="theme-previews" data-language={language} className="flex gap-2 overflow-x-auto pb-2">
              {previews.map((src, i) => (
                <li key={src} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated preview PNGs. */}
                  <img data-testid="theme-preview-page" src={src} alt={t("design.page", { page: i + 1 })} className="h-40 rounded border border-border" />
                </li>
              ))}
            </ol>
          </div>
        )}
        {(publish.isError || unpublish.isError || remove.isError) && <ErrorText>{(publish.error ?? unpublish.error ?? remove.error)?.message}</ErrorText>}
      </Card>
    </li>
  );
}
