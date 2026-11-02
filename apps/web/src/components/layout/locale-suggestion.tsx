"use client";

import { DEFAULT_LANGUAGE, localePath } from "@fabulka/shared";
import { Languages, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useClientValue } from "@/hooks/use-hydrated";
import { isLocale, localePreference, setLocalePreference, useI18n } from "@/i18n/i18n";
import { MESSAGES, type UiLocale } from "@/i18n/messages";
import { useBarePath } from "@/i18n/routing";
import { Notice } from "../ui/notice";

/**
 * The language this visitor would rather read, if it is not the default one (English): the one they
 * picked on the site before (the preference cookie), else the first of the browser's languages the
 * site has (Russian, Kazakh, Spanish or German).
 */
function wanted(): UiLocale | null {
  const saved = localePreference();
  if (saved) return saved === DEFAULT_LANGUAGE ? null : saved;
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language];
  const first = browser.map((l) => l.slice(0, 2).toLowerCase()).find(isLocale);
  return first && first !== DEFAULT_LANGUAGE ? first : null;
}

/**
 * On the unprefixed pages (the default language, English): a small offer of this page in the
 * visitor's language, written in that language. Only an offer: nobody is redirected, and search
 * engines see the English page as is. Closing it remembers English as the preference, so it does not
 * come back.
 */
export function LocaleSuggestion() {
  const { locale } = useI18n();
  const path = useBarePath();
  const offer = useClientValue(wanted, null);
  const [closed, setClosed] = useState(false);
  if (locale !== DEFAULT_LANGUAGE || !offer || closed) return null;
  const text = MESSAGES[offer];
  const dismiss = () => {
    setLocalePreference(DEFAULT_LANGUAGE);
    setClosed(true);
  };
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-3" lang={offer}>
      <Notice
        as="div"
        role="status"
        data-testid="locale-suggest"
        size="sm"
        className="items-center"
        action={
          <button type="button" data-testid="locale-suggest-dismiss" aria-label={text["locale.suggest.dismiss"]} onClick={dismiss} className="hover:text-foreground">
            <X className="size-4" />
          </button>
        }
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Languages className="size-4 shrink-0 text-accent" aria-hidden />
          <span>{text["locale.suggest.text"]}</span>
          <Link
            href={localePath(offer, path)}
            hrefLang={offer}
            data-testid="locale-suggest-open"
            onClick={() => setLocalePreference(offer)}
            className="font-semibold text-accent hover:underline"
          >
            {text["locale.suggest.open"]} →
          </Link>
        </span>
      </Notice>
    </div>
  );
}
