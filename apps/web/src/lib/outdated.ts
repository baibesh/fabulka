import { DEFAULT_LANGUAGE } from "@fabulka/shared";
import { isLocale } from "../i18n/i18n";
import { MESSAGES } from "../i18n/messages";

/**
 * A response this page's code could not read: its schema check failed (a ZodError). Almost always a
 * page loaded before a deploy talking to the newer API; reloading fixes it.
 */
export function isOutdatedError(error: unknown): boolean {
  return error instanceof Error && error.name === "ZodError";
}

/**
 * Puts a sentence in the page's language in place of a zod error's message (its issues as JSON), so
 * whatever shows `error.message` never dumps them on the user. The query client calls it for every
 * failed query and mutation (app/providers.tsx).
 */
export function humanizeError(error: unknown) {
  if (!(error instanceof Error) || !isOutdatedError(error) || typeof document === "undefined") return;
  const lang = document.documentElement.lang;
  error.message = MESSAGES[isLocale(lang) ? lang : DEFAULT_LANGUAGE]["update.outdated"];
}
