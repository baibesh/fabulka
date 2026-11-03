import { z } from "zod";
import { LANGUAGES, LanguageSchema, type Language } from "./language";
import { TemplateCountriesSchema } from "./reference";
import { CountriesModeSchema } from "./country-rules";
import { CurrencySchema, MoneySchema } from "./money";

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
  /** Whether `countries` are where it shows (include) or where it does not ("everywhere except…"). */
  countriesMode: CountriesModeSchema.default("include"),
  /** The catalog book's countries of its versions (empty: everywhere); null for a story of its own. */
  templateCountries: z.array(z.string()).nullable(),
  templateCountriesMode: CountriesModeSchema.default("include"),
  /** Whether this session may change it: every country it shows in is theirs (or they hold the right everywhere). */
  editable: z.boolean().default(true),
  sortOrder: z.number().int(),
  versions: z.array(AdminExampleVersionSchema),
  createdAt: z.string(),
});
export type AdminExample = z.infer<typeof AdminExampleSchema>;

/** Body of POST /admin/examples/:id/versions. */
export const ExampleBookRefSchema = z.object({ bookId: z.string().trim().min(1).max(40) });
export type ExampleBookRef = z.infer<typeof ExampleBookRefSchema>;

/**
 * Body of POST /admin/examples: a new example with this book as its first version, shown in these
 * countries. A country manager's example must name only their countries (none: all of theirs).
 */
export const CreateExampleSchema = ExampleBookRefSchema.extend({ countries: TemplateCountriesSchema.optional() });
export type CreateExample = z.infer<typeof CreateExampleSchema>;

/** Body of PATCH /admin/examples/:id. */
export const UpdateExampleSchema = z.object({
  /** Codes from reference.countries (the API refuses others), or empty to follow the catalog book's. */
  countries: TemplateCountriesSchema,
  /** include: shown only there; exclude: everywhere except there. */
  mode: CountriesModeSchema.default("include"),
});
export type UpdateExample = z.infer<typeof UpdateExampleSchema>;

/** A finished book staff may make a new example from (GET /admin/examples/candidates). */
export const ExampleCandidateSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  childName: z.string(),
  language: LanguageSchema,
  country: z.string().nullable(),
  createdAt: z.string(),
});
export type ExampleCandidate = z.infer<typeof ExampleCandidateSchema>;

/** What the home page shows in one country × language cell of the visitor matrix. */
export const VisitorCellSchema = z.object({
  language: LanguageSchema,
  /** The country offers this language (else its visitors are switched to another one). */
  offered: z.boolean(),
  /** "example": examples are shown; "sample": none, catalog samples fill in; "empty": nothing. */
  kind: z.enum(["example", "sample", "empty"]),
  items: z.array(z.object({ id: z.string(), title: z.string(), heroImageUrl: z.string().nullable() })),
});
export type VisitorCell = z.infer<typeof VisitorCellSchema>;

/** GET /admin/examples/matrix: per country (an ISO code, or "other"), what a visitor sees per language. */
export const VisitorMatrixSchema = z.array(
  z.object({
    country: z.string(),
    /** The site lists the country; false for a code staff still hold that it no longer offers (its visitors are "other"). */
    listed: z.boolean().default(true),
    cells: z.array(VisitorCellSchema),
  }),
);
export type VisitorMatrix = z.infer<typeof VisitorMatrixSchema>;

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
  /** The example shows in countries that are not this session's (or everywhere): only global staff change it. */
  "scope_forbidden",
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

// ---- Country overview: everything a visitor from a country gets (admin, next to the matrix) -----

/**
 * What the country's content is missing, for the night content job and the owner:
 * - not_offered: staff hold the country but the site no longer lists it (its visitors are "other");
 * - no_local_examples: no example is made for the country (listed by its code);
 * - no_examples: visitors reading this language see no example (samples or nothing instead);
 * - no_country_samples: no catalog sample of the country's own (only the global ones show);
 * - missing_samples: some catalog books listed there have no sample in this language at all;
 * - no_landing_image: the landing shows the default pictures (no hero picture of its own);
 * - no_landing_title: the hero's title is the default in this language.
 */
export const OVERVIEW_GAPS = [
  "not_offered",
  "no_local_examples",
  "no_examples",
  "no_country_samples",
  "missing_samples",
  "no_landing_image",
  "no_landing_title",
] as const;
export const OverviewGapSchema = z.enum(OVERVIEW_GAPS);
export type OverviewGap = z.infer<typeof OverviewGapSchema>;

/** One catalog book's sample in one language as a visitor sees it: the country's own, the global one, none. */
export const OverviewSampleSchema = z.object({
  templateId: z.string(),
  slug: z.string(),
  title: z.string(),
  /** The book offers this language at all (else there is nothing to fill). */
  offered: z.boolean(),
  sample: z
    .object({ bookId: z.string(), title: z.string(), heroImageUrl: z.string().nullable(), scope: z.enum(["country", "global"]) })
    .nullable(),
});
export type OverviewSample = z.infer<typeof OverviewSampleSchema>;

/** One language of a country in the overview. */
export const OverviewLanguageSchema = z.object({
  language: LanguageSchema,
  /** What the home page's examples block shows (the visitor matrix's cell). */
  examples: VisitorCellSchema.omit({ language: true, offered: true }).extend({
    /** How many of the shown examples are made for this country (listed by its code). */
    local: z.number().int(),
  }),
  samples: z.array(OverviewSampleSchema),
  /** The hero as the landing shows it in this language: its own title and lead (null: the default) and picture. */
  landing: z.object({
    title: z.string().nullable(),
    lead: z.string().nullable(),
    heroImage: z.object({ src: z.string(), scope: z.enum(["language", "country"]) }).nullable(),
  }),
});
export type OverviewLanguage = z.infer<typeof OverviewLanguageSchema>;

/** GET /admin/examples/overview: per country (an ISO code or "other"), everything its visitors get. */
export const CountryOverviewSchema = z.object({
  country: z.string(),
  /** The site lists the country (false: a code staff, examples or catalog books still hold). */
  listed: z.boolean(),
  languages: z.array(LanguageSchema),
  currency: CurrencySchema,
  print: z.boolean(),
  /** One more book's prices there, and whether they are the country's own (else its currency's defaults). */
  prices: z.object({ template: MoneySchema.nullable(), custom: MoneySchema.nullable(), own: z.boolean() }),
  /** Examples made for the country (listed by its code), shown or not. */
  localExamples: z.number().int(),
  /** Catalog samples of the country's own, in any language. */
  countrySamples: z.number().int(),
  byLanguage: z.array(OverviewLanguageSchema),
  gaps: z.array(z.object({ code: OverviewGapSchema, language: LanguageSchema.optional() })),
});
export type CountryOverview = z.infer<typeof CountryOverviewSchema>;
export const CountriesOverviewSchema = z.array(CountryOverviewSchema);
