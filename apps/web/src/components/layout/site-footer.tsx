"use client";

import { LocaleLink } from "@/i18n/routing";
import { useI18n } from "@/i18n/i18n";
import { CountryPicker } from "./locale-pickers";
import { Logo } from "./logo";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Logo className="text-foreground" />
          <span>{t("footer.tagline")}</span>
        </div>
        <nav className="flex flex-wrap items-center gap-4">
          <LocaleLink href="/privacy" className="hover:text-foreground">
            {t("footer.privacy")}
          </LocaleLink>
          <LocaleLink href="/terms" className="hover:text-foreground">
            {t("footer.terms")}
          </LocaleLink>
          <a href="mailto:hello@fabulka.com" className="hover:text-foreground">
            hello@fabulka.com
          </a>
          {/* Prices, languages and print follow the country; on every screen size. */}
          <CountryPicker />
        </nav>
      </div>
    </footer>
  );
}
