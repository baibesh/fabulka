"use client";

import { setLocale } from "@/i18n/i18n";
import { LOCALE_NAMES, UI_LOCALES } from "@/i18n/messages";
import { useAdminI18n } from "./ui";

/** RU / ҚАЗ / EN: the admin's language, saved together with the site's. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { t, locale } = useAdminI18n();
  return (
    <div data-testid="admin-language" role="group" aria-label={t("admin.language")} className={`flex shrink-0 gap-0.5 rounded-xl bg-background p-0.5 ${className}`}>
      {UI_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          data-testid={`admin-lang-${l}`}
          aria-pressed={locale === l}
          title={LOCALE_NAMES[l]}
          onClick={() => setLocale(l)}
          className={`flex-1 rounded-lg px-2 py-1 text-xs font-bold ${locale === l ? "bg-card text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {l === "kk" ? "ҚАЗ" : l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
