import { LANGUAGES, type Language } from "./language";

/**
 * The site's addresses carry their language: Russian, the default, has none (`/catalog`), every
 * other language a prefix (`/en/catalog`, `/kk/catalog/bath-time`). The admin, the API and the
 * generated files live outside: they never get a prefix.
 */
export const DEFAULT_LANGUAGE: Language = "ru";

/** Paths outside the language-prefixed site. */
const UNPREFIXED = ["/admin", "/api", "/files"];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * A site path split into its language and the path without the prefix, query and hash kept:
 * `/en/catalog?x=1` → en, `/catalog?x=1`; `/catalog` → ru, `/catalog`; `/ru/catalog` → ru, `/catalog`
 * (`prefixed` tells the two Russian forms apart). Only the five languages count as a prefix.
 */
export function splitLocalePath(path: string): { language: Language; path: string; prefixed: boolean } {
  const match = /^\/([a-z]{2})(?=[/?#]|$)/.exec(path);
  if (!match || !isLanguage(match[1])) return { language: DEFAULT_LANGUAGE, path: path || "/", prefixed: false };
  const rest = path.slice(match[0].length);
  return { language: match[1], path: rest.startsWith("/") ? rest : `/${rest}`, prefixed: true };
}

/**
 * The address of a site path in `language`: `localePath("en", "/catalog")` → `/en/catalog`,
 * `localePath("ru", "/catalog")` → `/catalog`, `localePath("kk", "/")` → `/kk`, `localePath("de",
 * "/#examples")` → `/de#examples`. A path that already has a language gets this one instead.
 * Anything that is not a site path (`#top`, `https://…`, `mailto:`, `//host`) and the admin, API
 * and file paths come back unchanged.
 */
export function localePath(language: Language, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const bare = splitLocalePath(path).path;
  if (UNPREFIXED.some((p) => bare === p || (bare.startsWith(p) && /^[/?#]/.test(bare.slice(p.length))))) return bare;
  if (language === DEFAULT_LANGUAGE) return bare;
  return bare === "/" || /^\/[?#]/.test(bare) ? `/${language}${bare.slice(1)}` : `/${language}${bare}`;
}
