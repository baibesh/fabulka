"use client";

import { LANGUAGES, LANGUAGE_NAMES, SEO_DESCRIPTION_LIMIT, SEO_DESCRIPTION_MIN, SEO_TITLE_LIMIT, SEO_TITLE_MIN, localePath, seoPagePath, type Language } from "@fabulka/shared";
import { ImageIcon, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Flag } from "@/components/ui/flag";
import type { MessageKey } from "@/i18n/messages";
import { LANGUAGE_FLAGS, languageCode } from "@/lib/regions";
import { SITE_URL } from "@/lib/seo";
import type { ResolvedSeo } from "@/lib/seo-meta";
import type { SeoHistoryEntry } from "@fabulka/shared";
import { useAdminI18n } from "../ui";

export const SITE_HOST = new URL(SITE_URL).host;

/** The language versions as flag buttons; a dot marks a language with unpublished changes. */
export function LanguageFlags({ value, onChange, pending }: { value: Language; onChange: (language: Language) => void; pending?: Record<string, number> }) {
  const { t } = useAdminI18n();
  return (
    <div role="radiogroup" aria-label={t("admin.seo.language")} data-testid="seo-languages" className="flex flex-wrap gap-2">
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          role="radio"
          aria-checked={language === value}
          data-testid={`seo-lang-${language}`}
          title={LANGUAGE_NAMES[language]}
          onClick={() => onChange(language)}
          className={cx(
            "relative flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
            language === value ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-foreground",
          )}
        >
          <Flag code={LANGUAGE_FLAGS[language]} className="text-lg" />
          <span>{languageCode(language)}</span>
          <span className="hidden sm:inline">{LANGUAGE_NAMES[language]}</span>
          {Boolean(pending?.[language]) && <span aria-label={t("admin.seo.pending")} className="absolute -top-1 -right-1 size-2.5 rounded-full bg-warning" />}
        </button>
      ))}
    </div>
  );
}

/** The page's address in a language, as Google prints it above a result: fabulka.com › de › catalog. */
export function displayUrl(language: Language, key: string): string {
  const path = localePath(language, seoPagePath(key));
  return [SITE_HOST, ...path.split("/").filter(Boolean)].join(" › ");
}

/** A Google result as the page would appear: address, title (cut like Google does), description. */
export function GooglePreview({ language, pageKey, seo }: { language: Language; pageKey: string; seo: ResolvedSeo }) {
  const { t } = useAdminI18n();
  const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  return (
    <div data-testid="seo-google-preview" className="flex flex-col gap-1 rounded-2xl border border-border bg-white p-4 font-[arial,sans-serif] text-[#202124]">
      <p className="text-xs text-muted">{t("admin.seo.preview.google")}</p>
      {seo.noindex ? (
        <p data-testid="seo-preview-hidden" className="text-sm text-[#70757a]">
          {t("admin.seo.preview.hidden")}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#f1f3f4] text-xs font-bold">F</span>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">Fabulka</span>
              <span className="truncate text-xs text-[#4d5156]">{displayUrl(language, pageKey)}</span>
            </div>
          </div>
          <p data-testid="seo-preview-title" className="text-xl leading-snug text-[#1a0dab]">
            {cut(seo.title, SEO_TITLE_LIMIT + 5)}
          </p>
          <p data-testid="seo-preview-description" className="text-sm leading-snug text-[#4d5156]">
            {cut(seo.description, SEO_DESCRIPTION_LIMIT + 5)}
          </p>
        </>
      )}
    </div>
  );
}

/** A link shared on a social network: the OG image, the site, title and description. */
export function SocialPreview({ seo }: { seo: ResolvedSeo }) {
  const { t } = useAdminI18n();
  return (
    <div data-testid="seo-social-preview" className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t("admin.seo.preview.social")}</p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative aspect-[1200/630] bg-background">
          {seo.image ? (
            // A preview of what the page will point to; any size, so a plain <img>.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seo.image} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="absolute inset-0 m-auto size-8 text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-0.5 border-t border-border p-3">
          <span className="text-xs uppercase text-muted">{SITE_HOST}</span>
          <span className="line-clamp-2 font-bold">{seo.title}</span>
          <span className="line-clamp-2 text-sm text-muted">{seo.description}</span>
        </div>
      </div>
    </div>
  );
}

/** "42/60", warning-coloured past the limit. */
export function Counter({ length, limit, testId }: { length: number; limit: number; testId?: string }) {
  return (
    <span data-testid={testId} className={cx("text-xs tabular-nums", length > limit ? "font-bold text-warning" : "text-muted")}>
      {length}/{limit}
    </span>
  );
}

/** What the page's snippet would get wrong: too long (cut), too short (thin), hidden from search. */
export function seoWarnings(seo: ResolvedSeo): MessageKey[] {
  const warnings: MessageKey[] = [];
  if (seo.title.length > SEO_TITLE_LIMIT) warnings.push("admin.seo.warn.titleLong");
  else if (seo.title.length < SEO_TITLE_MIN) warnings.push("admin.seo.warn.titleShort");
  if (seo.description.length > SEO_DESCRIPTION_LIMIT) warnings.push("admin.seo.warn.descriptionLong");
  else if (seo.description.length < SEO_DESCRIPTION_MIN) warnings.push("admin.seo.warn.descriptionShort");
  if (seo.noindex) warnings.push("admin.seo.warn.noindex");
  return warnings;
}

const FIELD_KEYS = ["title", "description", "ogImage", "noindex", "from", "to", "status", "active"] as const;

/** A short readable value for the history. */
function shown(value: unknown, t: (key: MessageKey) => string): string {
  if (value === null || value === undefined || value === "") return t("admin.seo.history.default");
  if (typeof value === "boolean") return value ? t("admin.seo.yes") : t("admin.seo.no");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** The fields that differ between two recorded values (flat objects; settings compare by section). */
function changes(before: unknown, after: unknown): { field: string; from: unknown; to: unknown }[] {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => k !== "id" && k !== "createdAt" && k !== "updatedAt");
  return keys.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((k) => ({ field: k, from: a[k], to: b[k] }));
}

/** Recorded changes, newest first: who, when, what changed; page changes can be reverted. */
export function HistoryList({ entries, onRevert, reverting }: { entries: SeoHistoryEntry[]; onRevert?: (entry: SeoHistoryEntry) => void; reverting?: string | null }) {
  const { t, date } = useAdminI18n();
  if (!entries.length) return <p className="text-sm text-muted">{t("admin.seo.history.empty")}</p>;
  return (
    <ol data-testid="seo-history" className="flex flex-col divide-y divide-border">
      {entries.map((entry, index) => {
        const diff = changes(entry.before, entry.after);
        return (
          <li key={entry.id} data-testid={`seo-history-${index}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={entry.action === "publish" ? "success" : entry.action === "revert" ? "warning" : "neutral"}>{t(`admin.seo.action.${entry.action}`)}</Badge>
                <span className="text-muted">{date(entry.createdAt)}</span>
                <span className="font-semibold">{entry.who ?? t("admin.seo.history.unknown")}</span>
              </div>
              <ul className="flex flex-col gap-0.5 text-sm">
                {diff.map(({ field, from, to }) => (
                  <li key={field} className="break-words">
                    <span className="text-muted">{(FIELD_KEYS as readonly string[]).includes(field) ? t(`admin.seo.field.${field as (typeof FIELD_KEYS)[number]}`) : field}: </span>
                    <span className="line-through decoration-muted/60">{shown(from, t)}</span> → <span>{shown(to, t)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {onRevert && (
              <Button
                variant="secondary"
                size="sm"
                data-testid={`seo-revert-${index}`}
                loading={reverting === entry.id}
                icon={<RotateCcw className="size-4" />}
                onClick={() => onRevert(entry)}
              >
                {t("admin.seo.history.revert")}
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
