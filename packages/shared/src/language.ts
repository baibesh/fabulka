import { z } from "zod";

/**
 * Interface and book languages. Everything language-keyed is built from this list (forms iterate
 * it, texts are dictionaries keyed by it), so adding a language starts here.
 */
export const LANGUAGES = ["ru", "kk", "en"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

/** Each language's name in that language, for pickers. */
export const LANGUAGE_NAMES: Record<Language, string> = { ru: "Русский", kk: "Қазақша", en: "English" };

/**
 * Languages a localized text must always have: the fallbacks every other language falls back to,
 * in that order.
 */
export const BASE_LANGUAGES = ["ru", "en"] as const satisfies readonly Language[];

/** A text in several languages, by language code: the base languages required, the rest optional. */
export type LocalizedText = Partial<Record<Language, string>>;

/** Schema of a LocalizedText whose texts are 1..`max` characters; an empty optional one is dropped. */
export function localizedTextSchema(max: number) {
  const text = z.string().trim().max(max);
  return z
    .partialRecord(LanguageSchema, text)
    .transform((texts) => Object.fromEntries(Object.entries(texts).filter(([, t]) => t)) as LocalizedText)
    .superRefine((texts, ctx) => {
      for (const language of BASE_LANGUAGES) {
        if (!texts[language]) ctx.addIssue({ code: "custom", path: [language], message: "Required" });
      }
    });
}

/** The text in `language`, else in the base languages (Russian, then English), else any there is. */
export function localized(texts: LocalizedText, language: Language): string {
  for (const l of [language, ...BASE_LANGUAGES]) {
    const text = texts[l];
    if (text) return text;
  }
  return Object.values(texts).find(Boolean) ?? "";
}
