import type { UiLocale } from "./messages";

export type Vars = Record<string, string | number>;

const rules = new Map<UiLocale, Intl.PluralRules>();

/** The plural form of a number in a language: "one", "few", "many" or "other" (Russian uses all four). */
export function pluralCategory(locale: UiLocale, count: number): Intl.LDMLPluralRule {
  let rule = rules.get(locale);
  if (!rule) {
    rule = new Intl.PluralRules(locale);
    rules.set(locale, rule);
  }
  return rule.select(count);
}

// {name, plural, one {…} few {…} many {…} other {…}}; a form may hold # (the number) and {var}s.
const PLURAL = /\{(\w+), plural,((?:\s*\w+\s*\{(?:[^{}]|\{\w+\})*\})+)\s*\}/g;
const FORM = /(\w+)\s*\{((?:[^{}]|\{\w+\})*)\}/g;

/**
 * Fills a message: {name} takes the variable, and {name, plural, …} picks the form for its number in
 * this language, falling back to `other`. A form of a missing or non-numeric variable stays as written.
 */
export function format(text: string, vars: Vars | undefined, locale: UiLocale): string {
  if (!vars) return text;
  const plural = text.replace(PLURAL, (whole, name: string, body: string) => {
    const count = Number(vars[name]);
    if (vars[name] === undefined || Number.isNaN(count)) return whole;
    const forms = Object.fromEntries([...body.matchAll(FORM)].map(([, key, form]) => [key, form]));
    const form = forms[pluralCategory(locale, count)] ?? forms.other ?? "";
    return form.replaceAll("#", String(vars[name]));
  });
  return plural.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** The locale Intl formats dates and numbers with for an interface language. */
export const intlLocale = (locale: UiLocale) => ({ ru: "ru-RU", kk: "kk-KZ", en: "en-US", es: "es-ES", de: "de-DE" })[locale];
