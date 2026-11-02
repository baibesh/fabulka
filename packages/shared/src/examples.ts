import { z } from "zod";
import { LANGUAGES, LanguageSchema, type Language } from "./language";
import { TemplateCountriesSchema } from "./reference";

// ---- Examples on the home page -----------------------------------------------------------------
//
// An example is one story with versions in several languages, the way a catalog book has samples:
// each version is a finished book in that language. The home page shows, for each example listed in
// the visitor's country, its version in exactly the page's language; staff make versions from books
// or have the story translated (a background job that makes a new book reusing the pictures).

/**
 * How a version stands, from its book: done, still being translated (any status between queued and
 * pdf), or failed (the translation stopped; the book's error says why).
 */
export const EXAMPLE_VERSION_STATES = ["done", "translating", "failed"] as const;
export const ExampleVersionStateSchema = z.enum(EXAMPLE_VERSION_STATES);
export type ExampleVersionState = z.infer<typeof ExampleVersionStateSchema>;

/** A version's state from its book's status. */
export function exampleVersionState(bookStatus: string): ExampleVersionState {
  if (bookStatus === "done") return "done";
  if (bookStatus === "failed") return "failed";
  return "translating";
}

/** One language version of an example, for the admin. */
export const AdminExampleVersionSchema = z.object({
  language: LanguageSchema,
  bookId: z.string(),
  title: z.string().nullable(),
  childName: z.string(),
  heroImageUrl: z.string().nullable(),
  state: ExampleVersionStateSchema,
  /** The book's progress, 0..100, while it is translated. */
  progress: z.number().int(),
  /** Why the translation stopped, when it failed. */
  error: z.string().nullable(),
  /** Made by translating another version (not a book staff picked). */
  translated: z.boolean(),
  costUsd: z.number(),
  createdAt: z.string(),
});
export type AdminExampleVersion = z.infer<typeof AdminExampleVersionSchema>;

/** An example for the admin's «Examples»: its versions (in LANGUAGES order) and countries. */
export const AdminExampleSchema = z.object({
  id: z.string(),
  /**
   * Where it is shown (reference.countries codes); empty: as `templateCountries` say
   * (showcaseCountries), everywhere for a story of its own.
   */
  countries: z.array(z.string()),
  /** The catalog book's countries of its versions (empty: everywhere); null for a story of its own. */
  templateCountries: z.array(z.string()).nullable(),
  sortOrder: z.number().int(),
  versions: z.array(AdminExampleVersionSchema),
  createdAt: z.string(),
});
export type AdminExample = z.infer<typeof AdminExampleSchema>;

/** Body of POST /admin/examples (a new example with this book as its first version) and of POST /admin/examples/:id/versions. */
export const ExampleBookRefSchema = z.object({ bookId: z.string().trim().min(1).max(40) });
export type ExampleBookRef = z.infer<typeof ExampleBookRefSchema>;

/** Body of PATCH /admin/examples/:id. */
export const UpdateExampleSchema = z.object({
  /** Codes from reference.countries (the API refuses others), or empty to follow the catalog book's. */
  countries: TemplateCountriesSchema,
});
export type UpdateExample = z.infer<typeof UpdateExampleSchema>;

/** Body of POST /admin/examples/order: every example's id, in the order the home page shows them. */
export const ReorderExamplesSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });
export type ReorderExamples = z.infer<typeof ReorderExamplesSchema>;

/** Body of POST /admin/examples/:id/translate: the languages to translate the story into. */
export const TranslateExampleSchema = z.object({
  languages: z
    .array(LanguageSchema)
    .min(1)
    .max(LANGUAGES.length)
    .refine((languages) => new Set(languages).size === languages.length, "Each language once"),
});
export type TranslateExample = z.infer<typeof TranslateExampleSchema>;

/**
 * Codes of the API's refusals in «Examples» (the `code` of a 4xx body); the admin shows its own text
 * for each (admin.examples.error.<code>).
 */
export const EXAMPLE_ERRORS = [
  "example_not_found",
  "example_book_not_found",
  /** Only a finished book becomes an example or a version. */
  "example_book_not_done",
  /** The example has a version in the book's language already. */
  "example_language_taken",
  /** The book is a version of an example already. */
  "example_book_taken",
  /** The example has no version in that language. */
  "example_version_not_found",
  /** Nothing finished to translate from. */
  "example_no_source",
  /** The ids sent to reorder are not exactly the examples there are. */
  "example_order_mismatch",
  /** A country the site does not offer. */
  "example_country_unknown",
] as const;
export type ExampleError = (typeof EXAMPLE_ERRORS)[number];

/** Whether an API error code is one of «Examples»' refusals. */
export function isExampleError(code: string | undefined): code is ExampleError {
  return (EXAMPLE_ERRORS as readonly string[]).includes(code ?? "");
}

/** The version to show for an example in the admin: in `language` if done, else the first done one, else the first. */
export function displayVersion<T extends { language: Language; state: ExampleVersionState }>(versions: readonly T[], language: Language): T | null {
  const done = versions.filter((v) => v.state === "done");
  return done.find((v) => v.language === language) ?? done[0] ?? versions[0] ?? null;
}

// ---- Names in another script --------------------------------------------------------------------

/** Languages written in Cyrillic; the rest are Latin. */
const CYRILLIC: readonly Language[] = ["ru", "kk"];

/** Cyrillic letters (Russian and Kazakh) in Latin, as names are usually spelled in English. */
const TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "gh", қ: "q", ң: "ng", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** Latin letter groups in Cyrillic, longest first. */
const TO_CYRILLIC: [string, string][] = [
  ["shch", "щ"], ["sch", "ш"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"],
  ["yu", "ю"], ["ya", "я"], ["yo", "ё"], ["ph", "ф"], ["th", "т"], ["ee", "и"], ["oo", "у"],
  ["a", "а"], ["b", "б"], ["c", "к"], ["d", "д"], ["e", "е"], ["f", "ф"], ["g", "г"], ["h", "х"],
  ["i", "и"], ["j", "дж"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"],
  ["q", "к"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["v", "в"], ["w", "у"], ["x", "кс"],
  ["y", "й"], ["z", "з"], ["á", "а"], ["é", "е"], ["í", "и"], ["ó", "о"], ["ú", "у"], ["ñ", "нь"],
  ["ä", "э"], ["ö", "ё"], ["ü", "ю"], ["ß", "сс"],
];

function keepCase(source: string, letters: string): string {
  if (!letters) return letters;
  return source === source.toLowerCase() ? letters : letters[0].toUpperCase() + letters.slice(1);
}

/**
 * A name spelled in the script of `language`, letter by letter: Тимур → Timur for English, Amina →
 * Амина for Russian; unchanged when it is already in that script. A rough rule for the mock models
 * and as a hint: the real translation asks Muse Spark, which knows the usual spellings.
 */
export function transliterate(name: string, language: Language): string {
  const cyrillicTarget = CYRILLIC.includes(language);
  const hasCyrillic = /[Ѐ-ӿ]/.test(name);
  if (cyrillicTarget === hasCyrillic) return name;
  if (!cyrillicTarget) {
    return [...name].map((ch) => (TO_LATIN[ch.toLowerCase()] !== undefined ? keepCase(ch, TO_LATIN[ch.toLowerCase()]) : ch)).join("");
  }
  let out = "";
  for (let i = 0; i < name.length; ) {
    const rest = name.slice(i).toLowerCase();
    const found = TO_CYRILLIC.find(([latin]) => rest.startsWith(latin));
    if (!found) {
      out += name[i];
      i++;
      continue;
    }
    out += keepCase(name[i], found[1]);
    i += found[0].length;
  }
  return out;
}
