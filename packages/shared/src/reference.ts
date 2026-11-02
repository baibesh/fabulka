import { z } from "zod";
import { LANGUAGES, LanguageSchema, localized, localizedTextSchema, type Language, type LocalizedText } from "./language";

// ---- Reference data the owner edits in the admin («Справочники») ----------------------------
//
// Kept in the Setting table (keys below) and seeded from the defaults here when absent. The API
// prices every purchase and order from the stored values; the site reads them from GET /reference.

/** Setting keys of the reference data. */
export const REFERENCE_KEYS = {
  prices: "reference.prices",
  cities: "reference.cities",
  extraBlocked: "geo.extra_blocked",
  countries: "reference.countries",
  faq: "reference.faq",
  formats: "reference.formats",
} as const;

const tenge = z.number().int().min(0).max(10_000_000);
/** Dollars with at most two decimals: 3.9, 5.90. */
const dollars = z
  .number()
  .min(0)
  .max(100_000)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "At most two decimals");

/** What one more generated book costs in each currency (tenge in Kazakhstan, dollars elsewhere). */
export const BookPriceSchema = z.object({ KZT: tenge.min(1), USD: dollars.min(0.01) });

export const PricesSchema = z.object({
  /** One more generated (digital) book once the free ones are used, by kind. */
  books: z.object({ template: BookPriceSchema, custom: BookPriceSchema }),
  /** Flat delivery fee to a city without free delivery, in tenge. Copies are priced by format (reference.formats). */
  deliveryKzt: tenge,
});
export type Prices = z.infer<typeof PricesSchema>;

// ---- Print formats ---------------------------------------------------------------------------

/** A format's stable id: Latin letters, digits and hyphens ("a5-portrait"). Never changes once made. */
export const FormatIdSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const millimetres = (min: number, max: number) => z.number().min(min).max(max);

/**
 * A printed size the parent can order: its page (trim) size, the bleed the printer trims off, the
 * safe zone text stays inside, and the price of one copy by cover — in tenge, as print is offered
 * only where the site charges tenge. Only published ones are offered in the order form.
 */
export const PrintFormatSchema = z
  .object({
    id: FormatIdSchema,
    /** By language code; Russian and English required, the rest fall back to them. */
    name: localizedTextSchema(60),
    widthMm: millimetres(90, 420),
    heightMm: millimetres(90, 420),
    bleedMm: millimetres(0, 10),
    safeMm: millimetres(3, 40),
    prices: z.object({ soft: tenge.min(1), hard: tenge.min(1) }),
    published: z.boolean(),
  })
  .refine((f) => 2 * f.safeMm < Math.min(f.widthMm, f.heightMm) - 60, { path: ["safeMm"], message: "The safe zone leaves no room" });
export type PrintFormat = z.infer<typeof PrintFormatSchema>;

/** Body of PUT /admin/reference/formats: the whole list in the order the order form shows it. */
export const FormatsSchema = z
  .array(PrintFormatSchema)
  .min(1)
  .max(20)
  .superRefine((formats, ctx) => {
    const ids = new Set<string>();
    formats.forEach((format, i) => {
      if (ids.has(format.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Duplicate format" });
      ids.add(format.id);
    });
    if (!formats.some((f) => f.published)) ctx.addIssue({ code: "custom", path: [0, "published"], message: "Publish at least one format" });
  });

/** The size part of a format, as a book's layout keeps it. */
export function bookFormatOf(format: PrintFormat): { id: string; widthMm: number; heightMm: number; bleedMm: number; safeMm: number } {
  return { id: format.id, widthMm: format.widthMm, heightMm: format.heightMm, bleedMm: format.bleedMm, safeMm: format.safeMm };
}

/** The format's name in `language` (falling back to Russian, then English). */
export function formatName(format: PrintFormat, language: Language): string {
  return localized(format.name, language);
}

/** The cheapest copy with this cover among the published formats: the "from" price on the landing. */
export function lowestCoverPrice(formats: readonly PrintFormat[], cover: "soft" | "hard"): number | null {
  const prices = formats.filter((f) => f.published).map((f) => f.prices[cover]);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * The formats the site launches with; the seed of reference.formats. The square book is today's,
 * at the cover prices the site launched with; A4 landscape and A5 portrait are priced roughly by
 * paper area (A4 ×1.4, A5 ×0.7), rounded to the nearest 1 000 ₸ minus 100.
 */
export const DEFAULT_FORMATS: PrintFormat[] = [
  {
    id: "square-210",
    name: { ru: "Квадрат 21×21 см", kk: "Шаршы 21×21 см", en: "Square 21×21 cm", es: "Cuadrado 21×21 cm", de: "Quadrat 21×21 cm" },
    widthMm: 210,
    heightMm: 210,
    bleedMm: 3,
    safeMm: 12,
    prices: { soft: 9900, hard: 14900 },
    published: true,
  },
  {
    id: "a4-landscape",
    name: { ru: "A4 альбомный", kk: "A4 көлденең", en: "A4 landscape", es: "A4 apaisado", de: "A4 quer" },
    widthMm: 297,
    heightMm: 210,
    bleedMm: 3,
    safeMm: 12,
    prices: { soft: 13900, hard: 19900 },
    published: true,
  },
  {
    id: "a5-portrait",
    name: { ru: "A5 книжный", kk: "A5 тік", en: "A5 portrait", es: "A5 vertical", de: "A5 hoch" },
    widthMm: 148,
    heightMm: 210,
    bleedMm: 3,
    safeMm: 10,
    prices: { soft: 6900, hard: 10900 },
    published: true,
  },
];

/** Body of a 400 from POST /orders or PATCH /books/:id/layout: no published format has this id. */
export const FORMAT_UNKNOWN = "format_unknown";

/** A city's stable id: Latin letters, digits and hyphens ("ust-kamenogorsk"). */
export const CityIdSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/**
 * A city we deliver printed books to. Orders refer to it by `id`, which never changes once made;
 * an order also keeps the Russian name as it was then.
 */
export const CitySchema = z.object({
  id: CityIdSchema,
  /** By language code; Russian and English required, the rest fall back to them (see `localized`). */
  name: localizedTextSchema(60),
  /** Our print partners deliver here for free; elsewhere the flat fee applies. */
  freeDelivery: z.boolean(),
});
export type City = z.infer<typeof CitySchema>;

/** Body of PUT /admin/reference/cities: the whole list in the order the order form shows it. */
export const CitiesSchema = z
  .array(CitySchema)
  .min(1)
  .max(100)
  .superRefine((cities, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    cities.forEach((city, i) => {
      if (ids.has(city.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Duplicate city" });
      ids.add(city.id);
      const name = (city.name.ru ?? "").trim().toLowerCase();
      if (name && names.has(name)) ctx.addIssue({ code: "custom", path: [i, "name", "ru"], message: "Duplicate city" });
      names.add(name);
    });
  });

/** Latin letters for Russian and Kazakh Cyrillic, for city ids. */
const LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u",
  ү: "u", һ: "h", і: "i",
};

/**
 * An id for a city from its name ("Усть-Каменогорск" → "ust-kamenogorsk"), not one of `taken`
 * (a number is added then: "almaty-2").
 */
export function cityId(name: string, taken: readonly string[] = []): string {
  const base =
    [...name.trim().toLowerCase()]
      .map((ch) => LATIN[ch] ?? ch)
      .join("")
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)
      .replace(/-+$/, "") || "city";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** The city's name in `language` (falling back to Russian, then English). */
export function cityName(city: City, language: Language): string {
  return localized(city.name, language);
}

/**
 * The stored cities in today's shape: before ids, a city was { ru, kk, en, freeDelivery } and an
 * order stored the Russian name. Ids come from the Russian names, in order; a list already in
 * today's shape comes back as it is. Null when there is nothing to change.
 */
export function upgradeCities(stored: unknown): City[] | null {
  if (!Array.isArray(stored) || !stored.some((c) => c && typeof c === "object" && !("id" in c) && "ru" in c)) return null;
  const taken: string[] = [];
  return stored.map((c: { id?: string; ru?: string; kk?: string; en?: string; name?: LocalizedText; freeDelivery?: boolean }) => {
    if (c.id && c.name) {
      taken.push(c.id);
      return c as City;
    }
    const id = cityId(c.ru ?? c.en ?? "", taken);
    taken.push(id);
    const name: LocalizedText = {};
    for (const language of LANGUAGES) {
      const text = c[language as "ru" | "kk" | "en"];
      if (text) name[language] = text;
    }
    return { id, name, freeDelivery: Boolean(c.freeDelivery) };
  });
}

/** ISO 3166-1 alpha-2 codes, plus XK (Kosovo), which country databases use. */
export const ISO_COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

/** A country code the owner types: trimmed, upper-cased, and a real ISO 3166 alpha-2 code. */
export const CountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => ISO_COUNTRY_CODES.includes(code), "Unknown country code");

// ---- Countries ---------------------------------------------------------------------------------

export const CURRENCIES = ["KZT", "USD"] as const;
export const CurrencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Everywhere not in the owner's list (reference.countries). Always offered, never edited: English
 * first, then Spanish, German and Russian, prices in dollars, no print.
 */
export const OTHER_COUNTRY = "other";

/** A country the site offers (an ISO code from reference.countries) or "other". */
export type Country = string;

export interface CountryInfo {
  /** Interface and book languages offered there; the first is the default. */
  languages: readonly Language[];
  currency: Currency;
  /** A print partner delivers there. */
  print: boolean;
}

export const OTHER_COUNTRY_INFO: CountryInfo = { languages: ["en", "es", "de", "ru"], currency: "USD", print: false };

/**
 * The currency print is priced in (reference.formats prices and deliveryKzt are tenge): a country
 * with print must charge in it, so an order's total is always in the currency the site shows.
 */
export const PRINT_CURRENCY: Currency = "KZT";

/** A country in the owner's list: what the site speaks, charges and prints there. */
export const CountryEntrySchema = z.object({
  code: CountryCodeSchema,
  /** The first is the default. */
  languages: z
    .array(LanguageSchema)
    .min(1)
    .max(LANGUAGES.length)
    .refine((list) => new Set(list).size === list.length, "Duplicate language"),
  currency: CurrencySchema,
  print: z.boolean(),
});
export type CountryEntry = z.infer<typeof CountryEntrySchema>;

/** Body of PUT /admin/reference/countries: the whole list in the order the site shows it. */
export const CountriesSchema = z
  .array(CountryEntrySchema)
  .min(1)
  .max(ISO_COUNTRY_CODES.length)
  .superRefine((countries, ctx) => {
    const seen = new Set<string>();
    countries.forEach((country, i) => {
      if (seen.has(country.code)) ctx.addIssue({ code: "custom", path: [i, "code"], message: "Duplicate country" });
      seen.add(country.code);
      if (country.print && country.currency !== PRINT_CURRENCY) {
        ctx.addIssue({ code: "custom", path: [i, "print"], message: `Print is priced in ${PRINT_CURRENCY}` });
      }
    });
  });

/** What the site offers in `country`: its entry in the list, else what "other" gets. */
export function countryInfo(country: Country, countries: readonly CountryEntry[]): CountryInfo {
  return countries.find((c) => c.code === country) ?? OTHER_COUNTRY_INFO;
}

/**
 * Our country for an ISO code (the visitor's IP or a saved choice): a listed one, else "other". No
 * code at all (a local address, say) is taken for Kazakhstan, the home market, or the first listed
 * country when Kazakhstan is not offered.
 */
export function countryFromIp(iso: string | null, countries: readonly CountryEntry[]): Country {
  if (!iso) return countries.find((c) => c.code === "KZ")?.code ?? countries[0]?.code ?? OTHER_COUNTRY;
  const code = iso.trim().toUpperCase();
  return countries.some((c) => c.code === code) ? code : OTHER_COUNTRY;
}

/** `language` when the country offers it, else the country's default language. */
export function languageFor(country: Country, language: Language, countries: readonly CountryEntry[]): Language {
  const { languages } = countryInfo(country, countries);
  return languages.includes(language) ? language : languages[0];
}

/**
 * The country a catalog list is for (GET /templates?country=, GET /books/examples?country=): an ISO
 * code, upper-cased; null for "other", a missing or an unknown one — such visitors get only the
 * books listed everywhere.
 */
export function catalogCountry(param: string | null | undefined): string | null {
  const parsed = CountryCodeSchema.safeParse(param ?? "");
  return parsed.success ? parsed.data : null;
}

/**
 * The countries a featured example is shown in: its own if staff set any, else its catalog book's
 * (none for a story of its own). Empty means everywhere.
 */
export function showcaseCountries(own: readonly string[], template: readonly string[] | null | undefined): readonly string[] {
  return own.length > 0 ? own : (template ?? []);
}

/**
 * Whether a featured example goes on the home page for a visitor from `country` (catalogCountry:
 * null for "other", a missing or an unknown one): everywhere when showcaseCountries is empty, else
 * only in the countries it names.
 */
export function exampleShownIn(own: readonly string[], template: readonly string[] | null | undefined, country: string | null): boolean {
  const countries = showcaseCountries(own, template);
  return countries.length === 0 || (country !== null && countries.includes(country));
}

/** A catalog book's (or an example's) countries as staff set them: distinct ISO codes; empty means everywhere. */
export const TemplateCountriesSchema = z
  .array(CountryCodeSchema)
  .max(ISO_COUNTRY_CODES.length)
  .refine((list) => new Set(list).size === list.length, "Duplicate country");

/** Body of PUT /admin/reference/blocked: the countries the owner blocks on top of Meta's list. */
export const UpdateBlockedSchema = z.object({
  extra: z
    .array(CountryCodeSchema)
    .max(100)
    .superRefine((codes, ctx) => {
      codes.forEach((code, i) => {
        if (codes.indexOf(code) !== i) ctx.addIssue({ code: "custom", path: [i], message: "Duplicate country" });
      });
    }),
});
export type UpdateBlocked = z.infer<typeof UpdateBlockedSchema>;

/**
 * Body of a 400 from PUT /admin/reference/blocked: a code is on Meta's list already. That list
 * lives in the API's code and can never be changed from the admin.
 */
export const COUNTRY_POLICY_BLOCKED = "country_policy_blocked";

/**
 * Body of a 400 from PUT /admin/reference/countries: a code the owner blocked (geo.extra_blocked)
 * cannot be offered on the site. A code on Meta's list gets COUNTRY_POLICY_BLOCKED instead.
 */
export const COUNTRY_BLOCKED = "country_blocked";

// ---- FAQ -----------------------------------------------------------------------------------

/**
 * Placeholders an FAQ answer (or question) may hold, filled on the site for the visitor's country
 * and language: prices come from reference.prices, so an answer never goes stale.
 */
export const FAQ_PLACEHOLDERS = [
  "templatePrice",
  "customPrice",
  "softCover",
  "hardCover",
  "delivery",
  "freeCities",
  "languages",
  "country",
] as const;
export type FaqPlaceholder = (typeof FAQ_PLACEHOLDERS)[number];

/** A country an FAQ entry is for: an ISO code or "other" (everyone not in reference.countries). */
const FaqCountrySchema = z.union([z.literal(OTHER_COUNTRY), CountryCodeSchema]);

/** One question on the landing page, in three languages, for some or all countries. */
export const FaqItemSchema = z
  .object({
    /** Stable, for the page's test ids and the admin's list keys. */
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    /** By language code; Russian and English required, the rest fall back to them (see `localized`). */
    q: localizedTextSchema(200),
    a: localizedTextSchema(1500),
    /** Empty: shown everywhere. Else only in these countries, or everywhere but them (`excludeCountries`). */
    countries: z
      .array(FaqCountrySchema)
      .max(ISO_COUNTRY_CODES.length + 1)
      .refine((list) => new Set(list).size === list.length, "Duplicate country"),
    excludeCountries: z.boolean().default(false),
    /**
     * Only where print is ("with") or is not ("without") offered, by the country's print flag:
     * opening print in a country switches its entries over. Left out: wherever the countries say.
     */
    print: z.enum(["with", "without"]).optional(),
    published: z.boolean(),
  })
  .refine((item) => !item.excludeCountries || item.countries.length > 0, {
    path: ["countries"],
    message: "Pick the countries to leave out",
  });
export type FaqItem = z.infer<typeof FaqItemSchema>;

/** Body of PUT /admin/reference/faq: the whole list in the order the landing shows it. */
export const FaqSchema = z
  .array(FaqItemSchema)
  .max(100)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Duplicate id" });
      seen.add(item.id);
    });
  });

/**
 * The published entries a visitor from `country` (a listed code or "other") sees, in order; the
 * print flag comes from `countries` (the site's list).
 */
export function faqFor(items: readonly FaqItem[], country: Country, countries: readonly CountryEntry[]): FaqItem[] {
  const print = countryInfo(country, countries).print;
  return items.filter(
    (item) =>
      item.published &&
      (item.countries.length === 0 || item.countries.includes(country) !== item.excludeCountries) &&
      (item.print === undefined || (item.print === "with") === print),
  );
}

/** Fills {placeholders} in an FAQ text; an unknown one stays as written. */
export function fillFaq(text: string, vars: Partial<Record<FaqPlaceholder, string>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name as FaqPlaceholder] ?? whole);
}

/**
 * GET /reference: what the site prices and offers. `countries` leaves out the blocked ones (Meta's
 * and the owner's), so the site never offers them; "other" is not in it.
 */
export const ReferenceSchema = z.object({
  prices: PricesSchema,
  /** Print formats; the site gets only the published ones. */
  formats: z.array(PrintFormatSchema),
  cities: z.array(CitySchema),
  countries: z.array(CountryEntrySchema),
  /** The landing's questions; the site gets only the published ones and picks those for its country. */
  faq: z.array(FaqItemSchema),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const BlockedCountriesSchema = z.object({
  /** Meta's Restricted Territories (and India), from the API's code: read-only. */
  meta: z.array(z.object({ code: z.string(), name: z.string() })),
  /** Countries the owner added. */
  extra: z.array(z.string()),
  /** Meta's Model Designation and Geographic Use Policy. */
  policyUrl: z.string(),
});
export type BlockedCountries = z.infer<typeof BlockedCountriesSchema>;

/** GET /admin/reference. `countries` is the whole stored list, blocked ones included; `faq` has drafts too. */
export const AdminReferenceSchema = ReferenceSchema.extend({ blocked: BlockedCountriesSchema });
export type AdminReference = z.infer<typeof AdminReferenceSchema>;

/** The prices the site launched with; the seed of reference.prices. */
export const DEFAULT_PRICES: Prices = {
  books: {
    template: { KZT: 1900, USD: 3.9 },
    custom: { KZT: 2900, USD: 5.9 },
  },
  deliveryKzt: 1500,
};

/** The cities the site launched with; the seed of reference.cities. */
export const DEFAULT_CITIES: City[] = [
  { id: "almaty", name: { ru: "Алматы", kk: "Алматы", en: "Almaty" }, freeDelivery: true },
  { id: "astana", name: { ru: "Астана", kk: "Астана", en: "Astana" }, freeDelivery: true },
  { id: "shymkent", name: { ru: "Шымкент", kk: "Шымкент", en: "Shymkent" }, freeDelivery: false },
  { id: "karaganda", name: { ru: "Караганда", kk: "Қарағанды", en: "Karaganda" }, freeDelivery: false },
  { id: "aktobe", name: { ru: "Актобе", kk: "Ақтөбе", en: "Aktobe" }, freeDelivery: false },
  { id: "taraz", name: { ru: "Тараз", kk: "Тараз", en: "Taraz" }, freeDelivery: false },
  { id: "pavlodar", name: { ru: "Павлодар", kk: "Павлодар", en: "Pavlodar" }, freeDelivery: false },
  { id: "ust-kamenogorsk", name: { ru: "Усть-Каменогорск", kk: "Өскемен", en: "Oskemen" }, freeDelivery: false },
  { id: "atyrau", name: { ru: "Атырау", kk: "Атырау", en: "Atyrau" }, freeDelivery: false },
  { id: "kostanay", name: { ru: "Костанай", kk: "Қостанай", en: "Kostanay" }, freeDelivery: false },
];

const ruEn: Language[] = ["ru", "en"];
const enRu: Language[] = ["en", "ru"];
const en: Language[] = ["en"];
const deEn: Language[] = ["de", "en"];
const esEn: Language[] = ["es", "en"];
const abroad = (code: string, languages: Language[]): CountryEntry => ({ code, languages, currency: "USD", print: false });

/**
 * The countries the site launches with; the seed of reference.countries. Kazakhstan first (tenge,
 * print), then the neighbours where Russian is the common language (Russian first), the ones where
 * fewer families read it (English first), the German- and Spanish-speaking ones (their language
 * first, then English), and the rest in English only. Nothing on Meta's list of restricted
 * territories. A stored list still equal to an older seed is upgraded to this one on
 * start (apps/api ReferenceService).
 */
export const DEFAULT_COUNTRIES: CountryEntry[] = [
  { code: "KZ", languages: ["kk", "ru", "en"], currency: "KZT", print: true },
  abroad("UZ", ruEn),
  abroad("KG", ruEn),
  abroad("TJ", ruEn),
  abroad("TM", ruEn),
  abroad("AZ", ruEn),
  abroad("AM", ruEn),
  abroad("GE", enRu),
  abroad("MD", enRu),
  abroad("IL", enRu),
  abroad("MN", en),
  abroad("TR", en),
  abroad("AE", en),
  abroad("DE", deEn),
  abroad("AT", deEn),
  abroad("CH", deEn),
  abroad("ES", esEn),
  abroad("MX", esEn),
  abroad("AR", esEn),
  abroad("CO", esEn),
  abroad("CL", esEn),
  abroad("PL", en),
  abroad("CZ", en),
  abroad("GB", en),
  abroad("US", en),
  abroad("CA", en),
];

const everywhere = { countries: [], excludeCountries: false, published: true };
const onlyKz = { countries: ["KZ"], excludeCountries: false, published: true };
const notKz = { countries: ["KZ"], excludeCountries: true, published: true };
const withPrint = { countries: [], excludeCountries: false, print: "with" as const, published: true };
const withoutPrint = { countries: [], excludeCountries: false, print: "without" as const, published: true };

/**
 * The landing's questions the site launches with; the seed of reference.faq. Where the facts
 * differ by country there is one entry for each side: languages and prices for Kazakhstan and for
 * everyone else, print for the countries with print and those without.
 */
export const DEFAULT_FAQ: FaqItem[] = [
  {
    id: "time",
    ...everywhere,
    q: {
      ru: "Сколько ждать книгу?",
      kk: "Кітапты қанша күту керек?",
      en: "How long does it take?",
      es: "¿Cuánto tarda en estar listo el libro?",
      de: "Wie lange dauert es?",
    },
    a: {
      ru: "Обычно около трёх минут: сначала пишется сказка, потом рисуются герой и страницы. Прогресс видно на странице книги, а готовую можно сразу листать и скачать в PDF.",
      kk: "Әдетте үш минуттай: алдымен ертегі жазылады, содан кейін кейіпкер мен беттер салынады. Барысы кітап бетінде көрінеді, дайын кітапты бірден парақтап, PDF түрінде жүктеуге болады.",
      en: "Usually about three minutes: first the story is written, then the hero and the pages are drawn. You can watch the progress on the book's page, then read the finished book or download the PDF right away.",
      es: "Normalmente, unos tres minutos: primero se escribe la historia y después se dibujan el protagonista y las páginas. Puedes seguir el progreso en la página del libro y, cuando esté listo, leerlo al momento o descargarlo en PDF.",
      de: "Meist etwa drei Minuten: Zuerst entsteht die Geschichte, dann werden der Held und die Seiten gezeichnet. Den Fortschritt siehst du auf der Seite des Buches – das fertige Buch kannst du sofort durchblättern oder als PDF herunterladen.",
    },
  },
  {
    id: "kazakh",
    ...onlyKz,
    q: {
      ru: "Можно ли сделать книгу на казахском?",
      kk: "Кітапты қазақ тілінде жасауға бола ма?",
      en: "Can I make a book in Kazakh?",
      es: "¿Puedo hacer un libro en kazajo?",
      de: "Kann ich ein Buch auf Kasachisch erstellen?",
    },
    a: {
      ru: "Да. Язык книги выбирается в форме: қазақша, русский или English. Сказка пишется сразу на этом языке, а не переводится.",
      kk: "Иә. Кітап тілі формада таңдалады: қазақша, русский немесе English. Ертегі аударылмайды, бірден сол тілде жазылады.",
      en: "Yes. You choose the book's language in the form: қазақша, русский or English. The story is written in that language, not translated.",
      es: "Sí. El idioma del libro se elige en el formulario: қазақша, русский o English. La historia se escribe directamente en ese idioma, no es una traducción.",
      de: "Ja. Die Sprache des Buches wählst du im Formular: қазақша, русский oder English. Die Geschichte wird direkt in dieser Sprache geschrieben, nicht übersetzt.",
    },
  },
  {
    id: "languages",
    ...notKz,
    q: {
      ru: "На каких языках можно сделать книгу?",
      kk: "Кітапты қай тілдерде жасауға болады?",
      en: "Which languages can a book be in?",
      es: "¿En qué idiomas puedo hacer el libro?",
      de: "In welchen Sprachen gibt es die Bücher?",
    },
    a: {
      ru: "Язык книги выбирается в форме: {languages}. Сказка пишется сразу на этом языке, а не переводится.",
      kk: "Кітап тілі формада таңдалады: {languages}. Ертегі аударылмайды, бірден сол тілде жазылады.",
      en: "You choose the book's language in the form: {languages}. The story is written in that language, not translated.",
      es: "El idioma del libro se elige en el formulario: {languages}. La historia se escribe directamente en ese idioma, no es una traducción.",
      de: "Die Sprache des Buches wählst du im Formular: {languages}. Die Geschichte wird direkt in dieser Sprache geschrieben, nicht übersetzt.",
    },
  },
  {
    id: "price-kz",
    ...onlyKz,
    q: {
      ru: "Сколько стоит книга?",
      kk: "Кітап қанша тұрады?",
      en: "How much does a book cost?",
      es: "¿Cuánto cuesta un libro?",
      de: "Was kostet ein Buch?",
    },
    a: {
      ru: "Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Цены в тенге; печатная книга оплачивается отдельно.",
      kk: "Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегіңіз — {customPrice}. Бағалар теңгемен; басылған кітап бөлек төленеді.",
      en: "Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. Prices are in tenge; a printed copy is paid for separately.",
      es: "Los primeros libros son gratis. Después, un libro del catálogo cuesta {templatePrice} y una historia propia, {customPrice}. Los precios están en tenges; el libro impreso se paga aparte.",
      de: "Die ersten Bücher sind kostenlos. Danach kostet ein Buch aus dem Katalog {templatePrice}, eine eigene Geschichte {customPrice}. Die Preise sind in Tenge angegeben; ein gedrucktes Exemplar wird separat bezahlt.",
    },
  },
  {
    id: "price-abroad",
    ...notKz,
    q: {
      ru: "Сколько стоит книга?",
      kk: "Кітап қанша тұрады?",
      en: "How much does a book cost?",
      es: "¿Cuánto cuesta un libro?",
      de: "Was kostet ein Buch?",
    },
    a: {
      ru: "Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Для вашей страны цены указаны в долларах.",
      kk: "Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегіңіз — {customPrice}. Сіздің еліңіз үшін бағалар долларда көрсетілген.",
      en: "Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. For your country prices are in US dollars.",
      es: "Los primeros libros son gratis. Después, un libro del catálogo cuesta {templatePrice} y una historia propia, {customPrice}. En tu país, los precios se muestran en dólares estadounidenses.",
      de: "Die ersten Bücher sind kostenlos. Danach kostet ein Buch aus dem Katalog {templatePrice}, eine eigene Geschichte {customPrice}. Für dein Land werden die Preise in US-Dollar angezeigt.",
    },
  },
  {
    id: "data",
    ...everywhere,
    q: {
      ru: "Что происходит с данными ребёнка?",
      kk: "Баланың деректері не болады?",
      en: "What happens to my child's data?",
      es: "¿Qué pasa con los datos de mi hijo?",
      de: "Was passiert mit den Daten meines Kindes?",
    },
    a: {
      ru: "Героя рисуют по описанию — фотография ребёнка для этого не нужна. Если хотите, можно добавить в книгу отдельную страницу с фото ребёнка: это фото не передаётся моделям ИИ, хранится только для этой книги и удаляется вместе со страницей или книгой. Фото игрушки — тоже по желанию. Всё удалим по запросу на hello@fabulka.com.",
      kk: "Кейіпкер сипаттама бойынша салынады — бұл үшін баланың фотосы керек емес. Қаласаңыз, кітапқа баланың фотосы бар жеке бет қосуға болады: ол фото жасанды интеллект модельдеріне жіберілмейді, тек осы кітап үшін сақталады және бетпен не кітаппен бірге өшіріледі. Ойыншықтың фотосы да — қалауыңыз бойынша. Сұрауыңыз бойынша бәрін өшіреміз: hello@fabulka.com.",
      en: "The hero is drawn from a description, so no photo of your child is needed. If you like, you can add a separate page with your child's photo to the book: that photo is never sent to AI models, is kept only for that book and is deleted along with the page or the book. A photo of the toy is optional too. We delete everything on request at hello@fabulka.com.",
      es: "El protagonista se dibuja a partir de una descripción, así que no hace falta ninguna foto de tu hijo. Si quieres, puedes añadir al libro una página aparte con su foto: esa foto nunca se envía a modelos de IA, se guarda solo para ese libro y se borra junto con la página o el libro. La foto del juguete también es opcional. Si nos lo pides en hello@fabulka.com, lo borramos todo.",
      de: "Der Held wird nach einer Beschreibung gezeichnet, ein Foto deines Kindes ist dafür nicht nötig. Wenn du möchtest, kannst du dem Buch eine eigene Seite mit einem Foto deines Kindes hinzufügen: Dieses Foto geht an kein KI-Modell, wird nur für dieses Buch gespeichert und zusammen mit der Seite oder dem Buch gelöscht. Ein Foto vom Spielzeug ist ebenfalls freiwillig. Auf Anfrage an hello@fabulka.com löschen wir alles.",
    },
  },
  {
    id: "print-kz",
    ...withPrint,
    q: {
      ru: "Как заказать печатную книгу?",
      kk: "Басылған кітапқа қалай тапсырыс беремін?",
      en: "How do I get a printed book?",
      es: "¿Cómo pido el libro impreso?",
      de: "Wie bekomme ich ein gedrucktes Buch?",
    },
    a: {
      ru: "На странице готовой книги нажмите «Заказать печатную книгу». Мягкая обложка — {softCover}, твёрдая — {hardCover}. Бесплатная доставка: {freeCities}; в другие города — {delivery}.",
      kk: "Дайын кітаптың бетінде «Басылған кітапқа тапсырыс» батырмасын басыңыз. Жұмсақ мұқаба — {softCover}, қатты мұқаба — {hardCover}. Тегін жеткізу: {freeCities}; басқа қалаларға — {delivery}.",
      en: "On the finished book's page, press “Order a printed book”. A soft cover is {softCover}, a hard cover {hardCover}. Free delivery to {freeCities}; to other cities, {delivery}.",
      es: "En la página del libro terminado, pulsa «Pedir el libro impreso». Tapa blanda: {softCover}; tapa dura: {hardCover}. Envío gratis a {freeCities}; a otras ciudades, {delivery}.",
      de: "Wähle auf der Seite des fertigen Buches „Gedrucktes Buch bestellen“. Softcover: {softCover}, Hardcover: {hardCover}. Kostenlose Lieferung nach {freeCities}, in andere Städte: {delivery}.",
    },
  },
  {
    id: "print-abroad",
    ...withoutPrint,
    q: {
      ru: "Можно ли заказать печатную книгу?",
      kk: "Басылған кітапқа тапсырыс беруге бола ма?",
      en: "Can I get a printed book?",
      es: "¿Puedo pedir el libro impreso?",
      de: "Kann ich ein gedrucktes Buch bestellen?",
    },
    a: {
      ru: "К сожалению, в вашей стране печатные книги пока недоступны, но мы планируем открыть печать и в других странах. А пока готовую книгу можно скачать в PDF и распечатать самим. Нажмите «Хочу печатную книгу» на странице книги — и мы сообщим, когда печать заработает у вас.",
      kk: "Өкінішке қарай, сіздің еліңізде басылған кітаптар әзірге қолжетімсіз, бірақ біз басып шығаруды басқа елдерде де іске қосуды жоспарлап отырмыз. Әзірге дайын кітапты PDF түрінде жүктеп, өзіңіз басып шығара аласыз. Кітап бетінде «Басылған кітап керек» батырмасын басыңыз — басып шығару сіздің еліңізде іске қосылғанда хабарлаймыз.",
      en: "Unfortunately, printed books aren't available in your country yet, but we plan to bring printing to more countries. Meanwhile you can download the finished book as a PDF and print it yourself. Press “I want a printed book” on the book's page and we'll let you know when printing reaches you.",
      es: "Lamentablemente, todavía no imprimimos libros en tu país, pero queremos llevar la impresión a más países. Mientras tanto, puedes descargar el libro terminado en PDF e imprimirlo en casa. Pulsa «Quiero un libro impreso» en la página del libro y te avisaremos cuando la impresión llegue a tu país.",
      de: "Leider gibt es in deinem Land noch keine gedruckten Bücher, aber wir möchten den Druck bald in weitere Länder bringen. Bis dahin kannst du das fertige Buch als PDF herunterladen und selbst ausdrucken. Wähle auf der Seite des Buches „Ich möchte ein gedrucktes Buch“ – wir sagen dir Bescheid, sobald der Druck bei dir verfügbar ist.",
    },
  },
  {
    id: "account",
    ...everywhere,
    q: {
      ru: "Нужно ли регистрироваться?",
      kk: "Тіркелу керек пе?",
      en: "Do I need to sign up?",
      es: "¿Tengo que registrarme?",
      de: "Muss ich mich registrieren?",
    },
    a: {
      ru: "Нет. Книги сохраняются в вашем браузере, в разделе «Мои книги». Достаточно открыть каталог и выбрать историю.",
      kk: "Жоқ. Кітаптар браузеріңізде, «Менің кітаптарым» бөлімінде сақталады. Каталогты ашып, ертегі таңдасаңыз жеткілікті.",
      en: "No. Your books are kept in your browser under “My books”. Just open the catalog and choose a story.",
      es: "No. Tus libros se guardan en tu navegador, en «Mis libros». Solo tienes que abrir el catálogo y elegir una historia.",
      de: "Nein. Deine Bücher werden in deinem Browser unter „Meine Bücher“ gespeichert. Öffne einfach den Katalog und wähle eine Geschichte.",
    },
  },
  {
    id: "dislike",
    ...everywhere,
    q: {
      ru: "А если книга не понравится?",
      kk: "Кітап ұнамаса ше?",
      en: "What if I don't like the book?",
      es: "¿Y si el libro no me gusta?",
      de: "Und wenn mir das Buch nicht gefällt?",
    },
    a: {
      ru: "Сделайте новую: поменяйте ответы, тему или методику. Если что-то пошло не так, напишите нам на hello@fabulka.com — разберёмся.",
      kk: "Жаңасын жасаңыз: жауаптарды, тақырыпты не әдістемені өзгертіңіз. Бірдеңе дұрыс болмаса, hello@fabulka.com мекенжайына жазыңыз — көмектесеміз.",
      en: "Make another one: change the answers, the topic or the method. If something went wrong, write to hello@fabulka.com and we'll sort it out.",
      es: "Haz otro: cambia las respuestas, la temática o el método. Si hubo algún problema, escríbenos a hello@fabulka.com y lo solucionamos.",
      de: "Erstell einfach ein neues: Ändere die Antworten, das Thema oder die Methode. Wenn etwas schiefgelaufen ist, schreib uns an hello@fabulka.com – wir kümmern uns darum.",
    },
  },
];
