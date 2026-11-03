import { z } from "zod";
import { FALLBACK_LANGUAGES, type Language } from "./language";
import { TemplateCountriesSchema } from "./reference";

// ---- Where something is shown: a list of countries, included or left out ---------------------
//
// Catalog books and examples are shown in some countries. Staff pick a list and whether it names
// the only countries it shows in ("include") or the ones it is hidden in ("exclude", "everywhere
// except…"). An empty include list means everywhere; so does an empty exclude list (it is stored as
// include). Visitors from "other" (no listed country) are in no list: an include list with countries
// hides from them, an exclude list shows to them.

export const COUNTRIES_MODES = ["include", "exclude"] as const;
export const CountriesModeSchema = z.enum(COUNTRIES_MODES);
export type CountriesMode = z.infer<typeof CountriesModeSchema>;

/** Where something is shown. */
export interface CountryRule {
  mode: CountriesMode;
  countries: readonly string[];
}

/** Shown everywhere. */
export const EVERYWHERE: CountryRule = { mode: "include", countries: [] };

/** A rule as stored: an exclude list with nothing left out is "everywhere" (include, empty). */
export function normalizeRule(rule: CountryRule): CountryRule {
  return rule.mode === "exclude" && rule.countries.length === 0 ? EVERYWHERE : { mode: rule.mode, countries: [...rule.countries] };
}

/** Shown everywhere: include with no countries (or exclude with none). */
export function isEverywhere(rule: CountryRule): boolean {
  return rule.countries.length === 0;
}

/**
 * Whether something with this rule is shown to a visitor from `country` (an ISO code; null for
 * "other", a missing or an unknown one).
 */
export function ruleShows(rule: CountryRule, country: string | null): boolean {
  if (rule.countries.length === 0) return true;
  const listed = country !== null && rule.countries.includes(country);
  return rule.mode === "include" ? listed : !listed;
}

/**
 * The countries something with this rule belongs to, for the permission checks (allowedFor): the
 * listed ones of an include list; null (shared: only a global right may change it) for everywhere
 * and for "everywhere except…", which reaches every country not listed.
 */
export function ownerCountries(rule: CountryRule): string[] | null {
  return rule.mode === "include" && rule.countries.length > 0 ? [...rule.countries] : null;
}

/**
 * The rule after showing or hiding it in one country, changing nothing elsewhere: an include list
 * gains or loses the country; "everywhere" becomes "everywhere except it"; an exclude list loses or
 * gains it (losing its last one makes it "everywhere" again). Null when hiding would remove an
 * include list's last country, which would mean everywhere: only a global change can do that
 * (unpublishing it, say).
 */
export function withCountry(rule: CountryRule, country: string, shown: boolean): CountryRule | null {
  if (ruleShows(rule, country) === shown) return normalizeRule(rule);
  if (rule.mode === "include") {
    if (shown) return { mode: "include", countries: [...rule.countries, country] };
    if (rule.countries.length === 0) return { mode: "exclude", countries: [country] };
    const rest = rule.countries.filter((c) => c !== country);
    return rest.length ? { mode: "include", countries: rest } : null;
  }
  const next = shown ? rule.countries.filter((c) => c !== country) : [...rule.countries, country];
  return normalizeRule({ mode: "exclude", countries: next });
}

/** A rule in a request body: the mode and its distinct country codes. */
export const CountryRuleSchema = z.object({ mode: CountriesModeSchema, countries: TemplateCountriesSchema });

// ---- Examples: their own rule, else their catalog book's -------------------------------------

/**
 * Where a featured example is shown: its own rule if staff set any countries, else its catalog
 * book's (none for a story of its own: everywhere).
 */
export function showcaseRule(own: CountryRule, template: CountryRule | null | undefined): CountryRule {
  return own.countries.length > 0 ? own : (template ?? EVERYWHERE);
}

/**
 * Whether a featured example goes on the home page for a visitor from `country` (null for "other",
 * a missing or an unknown one), by showcaseRule.
 */
export function exampleShownIn(own: CountryRule, template: CountryRule | null | undefined, country: string | null): boolean {
  return ruleShows(showcaseRule(own, template), country);
}

// ---- Catalog samples: per country, else global, per language ---------------------------------

/** A catalog book's sample as the pick sees it: its language and its country (null: global). */
export interface SampleKey {
  language: Language;
  country: string | null;
}

/**
 * The sample a visitor from `country` reading in `language` sees: the one for their country in
 * that language, else the global one in that language, else the same two in the language's
 * fallbacks (FALLBACK_LANGUAGES) in order, else the first global one, else the first of their
 * country's. A sample for another country is never shown.
 */
export function pickSample<S extends SampleKey>(samples: readonly S[], language: Language, country: string | null): S | null {
  const own = (l: Language) => (country ? samples.find((s) => s.language === l && s.country === country) : undefined);
  const global = (l: Language) => samples.find((s) => s.language === l && s.country === null);
  for (const l of FALLBACK_LANGUAGES[language]) {
    const found = own(l) ?? global(l);
    if (found) return found;
  }
  return samples.find((s) => s.country === null) ?? (country ? samples.find((s) => s.country === country) : undefined) ?? null;
}

/**
 * The sample in exactly `language` for a visitor from `country`: their country's, else the global
 * one; null when there is neither (the home page's samples never switch language).
 */
export function sampleInLanguage<S extends SampleKey>(samples: readonly S[], language: Language, country: string | null): S | null {
  return (
    (country ? samples.find((s) => s.language === language && s.country === country) : undefined) ??
    samples.find((s) => s.language === language && s.country === null) ??
    null
  );
}
