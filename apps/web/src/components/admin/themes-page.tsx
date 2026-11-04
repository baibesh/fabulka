"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LANGUAGES, LANGUAGE_NAMES, THEME_REFUSED, ThemeRefusalSchema, checksPass, isComicTheme, type AdminTheme, type Language, type ThemeCheck } from "@fabulka/shared";
import { Check, Copy, EyeOff, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { adminThemes, deleteTheme, duplicateTheme, proposeTheme, publishTheme, unpublishTheme } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { StaffBudgetNote, useCapError, useRefreshBudget } from "./staff-budget";
import { themeName } from "@/lib/themes";
import { Card, PageTitle, useAdminI18n } from "./ui";
import { useAdminHref, useCan } from "./working-country";

const QUERY = ["admin", "themes"];

/**
 * /admin/themes: the curated themes (read-only, duplicated to edit a copy) and the stored ones: those
 * Muse Spark proposed and the copies. The owner types a brief; the proposal is checked in code (fonts,
 * contrast, sizes, glyphs, a sample book in all five languages) and either refused with the reasons
 * or kept as a draft with its page previews. A stored theme opens in the editor; the owner publishes
 * it once every check passes - then staff and parents can pick it - takes it back again, or deletes it.
 */
/** A theme's name by its id (a copy names the theme it came from), or the id while the list loads. */
export function useThemeNameById(): (id: string) => string {
  const { t, locale } = useAdminI18n();
  const themes = useQuery({ queryKey: QUERY, queryFn: adminThemes });
  return (id) => {
    const found = themes.data?.find((entry) => entry.theme.id === id);
    return found ? themeName(found.theme, t, locale) : id;
  };
}

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
export function Checks({ checks }: { checks: ThemeCheck[] }) {
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
  const router = useRouter();
  const adminHref = useAdminHref();
  const { theme } = entry;
  const ai = theme.source === "ai";
  const editHref = adminHref(`/admin/themes/${encodeURIComponent(theme.id)}`);
  const nameOf = useThemeNameById();
  const [language, setLanguage] = useState<Language>(locale);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY });
  const publish = useMutation({ mutationFn: () => publishTheme(theme.id), onSuccess: refresh });
  const unpublish = useMutation({ mutationFn: () => unpublishTheme(theme.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteTheme(theme.id), onSuccess: refresh });
  // A copy to edit: checked like any save, then opened in the editor.
  const duplicate = useMutation({
    mutationFn: () => duplicateTheme(theme.id),
    onSuccess: (copy) => {
      refresh();
      router.push(adminHref(`/admin/themes/${encodeURIComponent(copy.theme.id)}`));
    },
  });
  const publishable = checksPass(entry.checks);
  const previews = entry.previews[language] ?? [];
  return (
    <li data-testid="theme-card" data-id={theme.id} data-source={theme.source} data-status={entry.status} data-editable={entry.editable} data-pending={!!entry.draft}>
      <Card
        title={themeName(theme, t, locale)}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={entry.status === "published" ? "success" : "warning"}>
              {ai ? t(`admin.themes.status.${entry.status}`) : t("admin.themes.curated")}
            </Badge>
            {isComicTheme(theme) && <Badge tone="neutral">{t("admin.themes.comic")}</Badge>}
            {entry.draft && (
              <Badge tone="accent" data-testid="theme-pending">
                {t("admin.themes.pending")}
              </Badge>
            )}
            {canEdit && entry.editable && (
              <Button size="sm" variant="secondary" data-testid="theme-edit" icon={<Pencil className="size-4" />} onClick={() => router.push(editHref)}>
                {t("admin.themes.edit")}
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant={entry.editable ? "ghost" : "secondary"}
                data-testid="theme-duplicate"
                loading={duplicate.isPending}
                icon={<Copy className="size-4" />}
                onClick={() => duplicate.mutate()}
              >
                {t("admin.themes.duplicate")}
              </Button>
            )}
            {canEdit && ai && entry.status === "draft" && (
              <Button
                size="sm"
                data-testid="theme-publish"
                loading={publish.isPending}
                disabled={!publishable}
                title={publishable ? undefined : t("admin.themes.publish.blocked")}
                onClick={() => publish.mutate()}
              >
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
        {duplicate.isPending && <p className="-mt-2 text-sm text-muted">{t("admin.themes.duplicate.pending")}</p>}
        {entry.basedOn && <p className="-mt-2 text-sm text-muted">{t("admin.themes.copyOf", { name: nameOf(entry.basedOn) })}</p>}
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
        {(publish.isError || unpublish.isError || remove.isError || duplicate.isError) && (
          <ErrorText>{(publish.error ?? unpublish.error ?? remove.error ?? duplicate.error)?.message}</ErrorText>
        )}
      </Card>
    </li>
  );
}
