import { z } from "zod";

/**
 * Interface and book languages. Everything language-keyed is built from this list (forms iterate
 * it, texts are dictionaries keyed by it), so adding a language starts here.
 */
export const LANGUAGES = ["ru", "kk", "en", "es", "de"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

/** Each language's name in that language, for pickers. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: "Русский",
  kk: "Қазақша",
  en: "English",
  es: "Español",
  de: "Deutsch",
};

/**
 * Each language's English name, for model prompts: the prompts are English, and a model follows
 * "write in Kazakh" more reliably than a native self-name such as «Қазақша».
 */
export const LANGUAGE_MODEL_NAMES: Record<Language, string> = {
  ru: "Russian",
  kk: "Kazakh",
  en: "English",
  es: "Spanish",
  de: "German",
};

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

/**
 * Where a missing text is looked for next, by language: Kazakh readers read Russian; Spanish and
 * German readers are far likelier to read English than Russian.
 */
export const FALLBACK_LANGUAGES: Record<Language, readonly Language[]> = {
  ru: ["ru", "en"],
  kk: ["kk", "ru", "en"],
  en: ["en", "ru"],
  es: ["es", "en", "ru"],
  de: ["de", "en", "ru"],
};

/**
 * The text in `language`, else in its fallbacks (FALLBACK_LANGUAGES: Russian then English for
 * Kazakh, English then Russian for Spanish and German), else any there is.
 */
export function localized(texts: LocalizedText, language: Language): string {
  for (const l of FALLBACK_LANGUAGES[language]) {
    const text = texts[l];
    if (text) return text;
  }
  return Object.values(texts).find(Boolean) ?? "";
}
