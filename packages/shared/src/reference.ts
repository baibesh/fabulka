import { z } from "zod";
import { LANGUAGES, LanguageSchema, localized, localizedTextSchema, type Language, type LocalizedText } from "./language";
import { CURRENCIES, CurrencySchema, MinorAmountSchema, isPriceAmount, money, priceStep, type Currency, type Money } from "./money";

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
  countryPrices: "reference.country_prices",
  landing: "reference.landing",
  countryDelivery: "reference.country_delivery",
  countryFormats: "reference.country_formats",
} as const;

/**
 * Adds an issue at `path` unless `amount` is a price in `currency` (whole tenge, whole cents: see
 * money.ts) of at least `min` minor units.
 */
function checkPrice(ctx: z.RefinementCtx, amount: number, currency: Currency, path: PropertyKey[], min = 0): void {
  if (!isPriceAmount(amount, currency) || amount < min) {
    ctx.addIssue({ code: "custom", path, message: `Not a price in ${currency}` });
  }
}

/** Book prices by kind, in minor units of the list's currency. */
const BookAmountsSchema = z.object({ template: MinorAmountSchema, custom: MinorAmountSchema });

function checkBooks(ctx: z.RefinementCtx, books: { template: number; custom: number }, currency: Currency, path: PropertyKey[]): void {
  checkPrice(ctx, books.template, currency, [...path, "template"], priceStep(currency));
  checkPrice(ctx, books.custom, currency, [...path, "custom"], priceStep(currency));
}

/**
 * One currency's default prices (reference.prices): what one more digital book costs by kind, and
 * the flat delivery fee of a printed order to a city without free delivery. A country charging in
 * this currency pays them unless it has its own. Copies are priced by format (PrintFormat.prices).
 */
export const PriceListSchema = z.object({
  books: BookAmountsSchema,
  delivery: MinorAmountSchema,
});
export type PriceList = z.infer<typeof PriceListSchema>;

/** The default price list of every currency that has one, by ISO code (reference.prices). */
export const DefaultPricesSchema = z.partialRecord(CurrencySchema, PriceListSchema).superRefine((lists, ctx) => {
  for (const currency of CURRENCIES) {
    const list = lists[currency];
    if (!list) continue;
    checkBooks(ctx, list.books, currency, [currency, "books"]);
    checkPrice(ctx, list.delivery, currency, [currency, "delivery"]);
  }
});
export type DefaultPrices = z.infer<typeof DefaultPricesSchema>;

/** An upper-case ISO code as a key of the per-country reference data. */
const CountryKeySchema = z.string().regex(/^[A-Z]{2}$/);

/**
 * Body of PUT /admin/reference/prices: book prices in one currency - that currency's default (no
 * ?country=) or one country's own (?country=XX, in the country's currency only).
 */
export const BookPricesSchema = z
  .object({ currency: CurrencySchema, books: BookAmountsSchema })
  .superRefine((p, ctx) => checkBooks(ctx, p.books, p.currency, ["books"]));
export type BookPrices = z.infer<typeof BookPricesSchema>;

/**
 * Book prices of single countries (reference.country_prices), each in the currency it was set in: a
 * country listed here in its current currency is priced from its own list instead of its currency's
 * default (a country manager edits their countries' lists).
 */
export const CountryPricesSchema = z.record(CountryKeySchema, BookPricesSchema);
export type CountryPrices = z.infer<typeof CountryPricesSchema>;

/** A price an admin may save for a country, in any currency the manager picks (print partners' costs). */
const CostSchema = z
  .object({ amount: MinorAmountSchema, currency: CurrencySchema })
  .superRefine((m, ctx) => checkPrice(ctx, m.amount, m.currency, ["amount"]));

/**
 * A country's delivery of printed copies (reference.country_delivery): the flat fee to a city without
 * free delivery in the country's currency, whether delivery is free to every city, and optionally what
 * the print partner charges us for it (any currency, for margins). Which cities deliver free is each
 * city's own flag (reference.cities). Body of PUT /admin/reference/delivery too: with no ?country=,
 * `fee` is the default of `currency` (freeEverywhere and cost do not apply).
 */
export const CountryDeliverySchema = z
  .object({ currency: CurrencySchema, fee: MinorAmountSchema, freeEverywhere: z.boolean(), cost: CostSchema.optional() })
  .superRefine((d, ctx) => checkPrice(ctx, d.fee, d.currency, ["fee"]));
export type CountryDelivery = z.infer<typeof CountryDeliverySchema>;
export const CountryDeliveriesSchema = z.record(CountryKeySchema, CountryDeliverySchema);
export type CountryDeliveries = z.infer<typeof CountryDeliveriesSchema>;

// ---- Print formats ---------------------------------------------------------------------------

/** A format's stable id: Latin letters, digits and hyphens ("a5-portrait"). Never changes once made. */
export const FormatIdSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const millimetres = (min: number, max: number) => z.number().min(min).max(max);

/** One copy's price by cover, in minor units of some currency. */
const CoverAmountsSchema = z.object({ soft: MinorAmountSchema, hard: MinorAmountSchema });

function checkCovers(ctx: z.RefinementCtx, covers: { soft: number; hard: number }, currency: Currency, path: PropertyKey[], min: number): void {
  checkPrice(ctx, covers.soft, currency, [...path, "soft"], min);
  checkPrice(ctx, covers.hard, currency, [...path, "hard"], min);
}

/**
 * A printed size the parent can order: its page (trim) size, the bleed the printer trims off, the
 * safe zone text stays inside, and the default price of one copy by cover in each currency that has
 * one (a country charging in a currency the format has no price in does not offer it, unless the
 * country prices it itself). Only published ones are offered in the order form.
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
    prices: z.partialRecord(CurrencySchema, CoverAmountsSchema),
    published: z.boolean(),
  })
  .superRefine((f, ctx) => {
    if (!(2 * f.safeMm < Math.min(f.widthMm, f.heightMm) - 60)) ctx.addIssue({ code: "custom", path: ["safeMm"], message: "The safe zone leaves no room" });
    for (const currency of CURRENCIES) {
      const covers = f.prices[currency];
      if (covers) checkCovers(ctx, covers, currency, ["prices", currency], priceStep(currency));
    }
  });
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

/** Cover prices in one currency: a country's own prices, or a print partner's cost of one copy. */
const CoverMoneySchema = CoverAmountsSchema.extend({ currency: CurrencySchema });
export type CoverMoney = z.infer<typeof CoverMoneySchema>;

/**
 * A format in one country (reference.country_formats): whether it is offered there, its cover prices
 * there (in the country's currency), and optionally what the print partner charges us per copy (any
 * currency the manager picks, for margins); whatever is left out follows the global format. Sizes and
 * ids stay global.
 */
export const CountryFormatSchema = z
  .object({
    published: z.boolean().optional(),
    prices: CoverMoneySchema.optional(),
    cost: CoverMoneySchema.optional(),
  })
  .superRefine((o, ctx) => {
    if (o.prices) checkCovers(ctx, o.prices, o.prices.currency, ["prices"], priceStep(o.prices.currency));
    if (o.cost) checkCovers(ctx, o.cost, o.cost.currency, ["cost"], 0);
  });
export type CountryFormat = z.infer<typeof CountryFormatSchema>;
/** Body of PUT /admin/reference/country-formats?country=: that country's overrides by format id. */
export const CountryFormatOverridesSchema = z.record(FormatIdSchema, CountryFormatSchema);
export type CountryFormatOverrides = z.infer<typeof CountryFormatOverridesSchema>;
export const CountryFormatsSchema = z.record(CountryKeySchema, CountryFormatOverridesSchema);
export type CountryFormats = z.infer<typeof CountryFormatsSchema>;

/** One copy's price (or cost) by cover, as Money. */
export interface CoverPrices {
  soft: Money;
  hard: Money;
}

const coverMoney = (covers: { soft: number; hard: number }, currency: Currency): CoverPrices => ({
  soft: money(covers.soft, currency),
  hard: money(covers.hard, currency),
});

/**
 * A format as a country has it: its sizes, whether it is switched on there, its cover prices in the
 * country's currency (null: no price in that currency, so not offered) and the print partner's cost
 * per copy (null when not set).
 */
export interface LocalFormat {
  id: string;
  name: LocalizedText;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMm: number;
  published: boolean;
  prices: CoverPrices | null;
  cost: CoverPrices | null;
}

/** What the pricing helpers read: the reference data, or the part of it they need. */
export interface PricingData {
  prices: DefaultPrices;
  countries: readonly CountryEntry[];
  countryPrices?: CountryPrices;
  countryDelivery?: CountryDeliveries;
  countryFormats?: CountryFormats;
  formats?: readonly PrintFormat[];
}

/**
 * The formats as a visitor from `country` gets them, in its currency: offered and priced as the
 * country says (its own prices count only in its current currency), else as the format says for that
 * currency.
 */
export function formatsFor(country: string, data: PricingData): LocalFormat[] {
  const { currency } = countryInfo(country, data.countries);
  const own = data.countryFormats?.[country];
  return (data.formats ?? []).map((format) => {
    const o = own?.[format.id];
    const ownPrices = o?.prices && o.prices.currency === currency ? o.prices : null;
    const defaults = format.prices[currency];
    const covers = ownPrices ?? defaults ?? null;
    return {
      id: format.id,
      name: format.name,
      widthMm: format.widthMm,
      heightMm: format.heightMm,
      bleedMm: format.bleedMm,
      safeMm: format.safeMm,
      published: o?.published ?? format.published,
      prices: covers ? coverMoney(covers, currency) : null,
      cost: o?.cost ? coverMoney(o.cost, o.cost.currency) : null,
    };
  });
}

/** The formats a visitor from `country` can order: switched on there and priced in its currency. */
export function offeredFormats(country: string, data: PricingData): (LocalFormat & { prices: CoverPrices })[] {
  return formatsFor(country, data).filter((f): f is LocalFormat & { prices: CoverPrices } => f.published && f.prices !== null);
}

/**
 * The book prices of `country`, in its currency: its own list when that is in its currency (a list
 * saved before the country changed currency no longer counts), else its currency's default; null
 * when that currency has no default either.
 */
export function bookPricesFor(
  country: string,
  data: Pick<PricingData, "prices" | "countries" | "countryPrices">,
): { currency: Currency; template: Money; custom: Money; own: boolean } | null {
  const { currency } = countryInfo(country, data.countries);
  const own = data.countryPrices?.[country];
  const books = own && own.currency === currency ? own.books : data.prices[currency]?.books;
  if (!books) return null;
  return { currency, template: money(books.template, currency), custom: money(books.custom, currency), own: books === own?.books };
}

/**
 * The delivery rule for an order from `country`, in its currency: its own fee and rule (when saved in
 * that currency), else its currency's default fee, free to the free cities only; the print partner's
 * delivery cost when set. `fee` is null when the currency has no default fee.
 */
export function deliveryFor(
  country: string,
  data: Pick<PricingData, "prices" | "countries" | "countryDelivery">,
): { fee: Money | null; freeEverywhere: boolean; cost: Money | null; own: boolean } {
  const { currency } = countryInfo(country, data.countries);
  const entry = data.countryDelivery?.[country];
  const cost = entry?.cost ? money(entry.cost.amount, entry.cost.currency) : null;
  if (entry && entry.currency === currency) {
    return { fee: money(entry.fee, currency), freeEverywhere: entry.freeEverywhere, cost, own: true };
  }
  const fee = data.prices[currency]?.delivery;
  return { fee: fee === undefined ? null : money(fee, currency), freeEverywhere: false, cost, own: false };
}

/** The size part of a format, as a book's layout keeps it. */
export function bookFormatOf(format: Pick<PrintFormat, "id" | "widthMm" | "heightMm" | "bleedMm" | "safeMm">): { id: string; widthMm: number; heightMm: number; bleedMm: number; safeMm: number } {
  return { id: format.id, widthMm: format.widthMm, heightMm: format.heightMm, bleedMm: format.bleedMm, safeMm: format.safeMm };
}

/** The format's name in `language` (falling back to Russian, then English). */
export function formatName(format: Pick<PrintFormat, "name">, language: Language): string {
  return localized(format.name, language);
}

/** The cheapest copy with this cover among the formats offered: the "from" price on the landing. */
export function lowestCoverPrice(formats: readonly LocalFormat[], cover: "soft" | "hard"): Money | null {
  let lowest: Money | null = null;
  for (const f of formats) {
    if (!f.published || !f.prices) continue;
    const price = f.prices[cover];
    if (!lowest || price.amount < lowest.amount) lowest = price;
  }
  return lowest;
}

/**
 * The formats the site launches with; the seed of reference.formats. The square book is today's,
 * at the cover prices the site launched with; A4 landscape and A5 portrait are priced roughly by
 * paper area (A4 ×1.4, A5 ×0.7), rounded to the nearest 1 000 ₸ minus 100. Dollar and euro prices
 * are starting points for countries that open print later (no print partner has quoted them yet).
 */
export const DEFAULT_FORMATS: PrintFormat[] = [
  {
    id: "square-210",
    name: { ru: "Квадрат 21×21 см", kk: "Шаршы 21×21 см", en: "Square 21×21 cm", es: "Cuadrado 21×21 cm", de: "Quadrat 21×21 cm" },
    widthMm: 210,
    heightMm: 210,
    bleedMm: 3,
    safeMm: 12,
    prices: { KZT: { soft: 9_900_00, hard: 14_900_00 }, USD: { soft: 19_90, hard: 29_90 }, EUR: { soft: 18_90, hard: 27_90 } },
    published: true,
  },
  {
    id: "a4-landscape",
    name: { ru: "A4 альбомный", kk: "A4 көлденең", en: "A4 landscape", es: "A4 apaisado", de: "A4 quer" },
    widthMm: 297,
    heightMm: 210,
    bleedMm: 3,
    safeMm: 12,
    prices: { KZT: { soft: 13_900_00, hard: 19_900_00 }, USD: { soft: 27_90, hard: 39_90 }, EUR: { soft: 25_90, hard: 36_90 } },
    published: true,
  },
  {
    id: "a5-portrait",
    name: { ru: "A5 книжный", kk: "A5 тік", en: "A5 portrait", es: "A5 vertical", de: "A5 hoch" },
    widthMm: 148,
    heightMm: 210,
    bleedMm: 3,
    safeMm: 10,
    prices: { KZT: { soft: 6_900_00, hard: 10_900_00 }, USD: { soft: 14_90, hard: 21_90 }, EUR: { soft: 13_90, hard: 19_90 } },
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
  /** The country it is in (reference.countries); cities stored before countries are Kazakhstan's. */
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("KZ"),
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
      // The same name may be in two countries, not twice in one.
      const name = `${city.country}:${(city.name.ru ?? "").trim().toLowerCase()}`;
      if (!name.endsWith(":") && names.has(name)) ctx.addIssue({ code: "custom", path: [i, "name", "ru"], message: "Duplicate city" });
      names.add(name);
    });
  });

/** Body of PUT /admin/reference/cities?country=: that country's cities in order (may be none). */
export const CountryCitiesSchema = z.array(CitySchema).max(100);

/** The cities of `country`, in the owner's order. */
export function citiesOf(country: string, cities: readonly City[]): City[] {
  return cities.filter((city) => city.country === country);
}

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
  if (!Array.isArray(stored)) return null;
  // Cities stored before cities had a country are all Kazakhstan's.
  if (stored.every((c) => c && typeof c === "object" && "id" in c) && stored.some((c) => !("country" in c))) {
    return stored.map((c: City) => ({ ...c, country: c.country ?? "KZ" }));
  }
  if (!stored.some((c) => c && typeof c === "object" && !("id" in c) && "ru" in c)) return null;
  const taken: string[] = [];
  return stored.map((c: { id?: string; ru?: string; kk?: string; en?: string; name?: LocalizedText; freeDelivery?: boolean }) => {
    if (c.id && c.name) {
      taken.push(c.id);
      return { ...(c as City), country: (c as City).country ?? "KZ" };
    }
    const id = cityId(c.ru ?? c.en ?? "", taken);
    taken.push(id);
    const name: LocalizedText = {};
    for (const language of LANGUAGES) {
      const text = c[language as "ru" | "kk" | "en"];
      if (text) name[language] = text;
    }
    return { id, country: "KZ", name, freeDelivery: Boolean(c.freeDelivery) };
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

/**
 * How a country's visitors pay: by hand (the demo: nothing is charged, an order is paid at once), or
 * through a payment provider. Kaspi and Stripe are placeholders until they are wired in: a country
 * set to one cannot take orders or purchases yet.
 */
export const PAYMENT_PROVIDERS = ["manual", "kaspi", "stripe"] as const;
export const PaymentProviderSchema = z.enum(PAYMENT_PROVIDERS);
export type PaymentProviderKey = z.infer<typeof PaymentProviderSchema>;
/** The providers that work today. */
export const LIVE_PAYMENT_PROVIDERS: readonly PaymentProviderKey[] = ["manual"];

/**
 * Everywhere not in the owner's list (reference.countries). Always offered, never edited: English
 * first, then Spanish, German and Russian, prices in dollars, no print, paid by hand.
 */
export const OTHER_COUNTRY = "other";

/** A country the site offers (an ISO code from reference.countries) or "other". */
export type Country = string;

export interface CountryInfo {
  /** Interface and book languages offered there; the first is the default. */
  languages: readonly Language[];
  /** What everything is priced and paid in there; no conversion at checkout. */
  currency: Currency;
  /** A print partner delivers there. */
  print: boolean;
  /** How orders and purchases are paid there; left out: by hand ("manual"). */
  payment?: PaymentProviderKey;
}

export const OTHER_COUNTRY_INFO: CountryInfo = { languages: ["en", "es", "de", "ru"], currency: "USD", print: false, payment: "manual" };

/** The payment provider of a country (by hand when none is set). */
export function paymentProviderOf(info: Pick<CountryInfo, "payment">): PaymentProviderKey {
  return info.payment ?? "manual";
}

/** A country in the owner's list: what the site speaks, charges, prints there, and how it is paid. */
export const CountryEntrySchema = z.object({
  code: CountryCodeSchema,
  /** The first is the default. */
  languages: z
    .array(LanguageSchema)
    .min(1)
    .max(LANGUAGES.length)
    .refine((list) => new Set(list).size === list.length, "Duplicate language"),
  currency: CurrencySchema,
  /** Print is on: any currency, priced in it (formats, delivery). */
  print: z.boolean(),
  /** Superadmin only (the Countries tab); left out: by hand. */
  payment: PaymentProviderSchema.optional(),
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
    });
  });

/** What the site offers in `country`: its entry in the list, else what "other" gets. */
export function countryInfo(country: Country, countries: readonly CountryEntry[]): CountryInfo {
  return countries.find((c) => c.code === country) ?? OTHER_COUNTRY_INFO;
}

/**
 * Our country for an ISO code (the visitor's IP or a saved choice): a listed one, else "other". No
 * code at all (a local or unknown address, a crawler) is "other" too: nobody is assumed to be in
 * Kazakhstan.
 */
export function countryFromIp(iso: string | null, countries: readonly CountryEntry[]): Country {
  if (!iso) return OTHER_COUNTRY;
  const code = iso.trim().toUpperCase();
  return countries.some((c) => c.code === code) ? code : OTHER_COUNTRY;
}

/** GET /geo: the visitor's ISO country by IP, null for a local or unknown address. */
export const GeoSchema = z.object({ country: z.string().nullable() });
export type Geo = z.infer<typeof GeoSchema>;

/** `language` when the country offers it, else the country's default language. */
export function languageFor(country: Country, language: Language, countries: readonly CountryEntry[]): Language {
  const { languages } = countryInfo(country, countries);
  return languages.includes(language) ? language : languages[0];
}

/**
 * The country a catalog list is for (GET /templates?country=, GET /books/examples?country=): an ISO
 * code, upper-cased; null for "other", a missing or an unknown one - such visitors get only the
 * books listed everywhere.
 */
export function catalogCountry(param: string | null | undefined): string | null {
  const parsed = CountryCodeSchema.safeParse(param ?? "");
  return parsed.success ? parsed.data : null;
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

/** Body of a 400 from PUT /admin/reference/cities?country=: a new city's id is another country's city's. */
export const CITY_ID_TAKEN = "city_id_taken";

/** Body of a 400 from the per-country reference routes: the site does not offer this country. */
export const COUNTRY_UNKNOWN = "country_unknown";

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

// ---- Country landing data ------------------------------------------------------------------
//
// A country can override what its visitors see on the landing (reference.landing): the hero's title
// and lead per language, the FAQ (hide some of the shared entries, add its own) and which sections
// show. Everything not overridden falls back to the language defaults. SEO (titles, descriptions)
// is not here: it stays per language with the seo role.

/** The landing's sections a country may hide (the hero always shows). */
export const LANDING_SECTIONS = ["howItWorks", "liveExample", "examples", "toyStory", "catalog", "methods", "pricing", "faq"] as const;
export const LandingSectionSchema = z.enum(LANDING_SECTIONS);
export type LandingSection = z.infer<typeof LandingSectionSchema>;

/** The hero's text in one language; a missing or empty field keeps the default. */
export const LandingHeroSchema = z.object({
  title: z.string().trim().max(120).optional(),
  lead: z.string().trim().max(400).optional(),
});
export type LandingHero = z.infer<typeof LandingHeroSchema>;

/**
 * The landing's pictures a country may replace: the hero's illustration (shown instead of the pile
 * of catalog covers) and the three steps of the toy story (the parent's photo, the cut-out, the
 * drawing). Everything else on the landing is the country's catalog and examples already.
 */
export const LANDING_IMAGE_SLOTS = ["hero", "toyPhoto", "toyCutout", "toyCharacter"] as const;
export const LandingImageSlotSchema = z.enum(LANDING_IMAGE_SLOTS);
export type LandingImageSlot = z.infer<typeof LandingImageSlotSchema>;

/** The pictures the landing shows where a country has none of its own (the toy story's files); null: the hero's cover pile. */
export const DEFAULT_LANDING_IMAGES: Record<LandingImageSlot, string | null> = {
  hero: null,
  toyPhoto: "/landing/toy-photo.jpg",
  toyCutout: "/landing/toy-cutout.jpg",
  toyCharacter: "/landing/toy-character.jpg",
};

/** Widths a landing picture is stored at (square WebP files); the browser picks one with srcset. */
export const LANDING_IMAGE_WIDTHS = [384, 640, 960] as const;

/** The largest picture file staff may upload for the landing. */
export const LANDING_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Where stored files are served (the API's StorageService.url). */
const FILES_PREFIX = "/files/";

/**
 * A picture staff set for a country's landing: square WebP files at `${path}-${width}.webp` for each
 * of `widths` (LANDING_IMAGE_WIDTHS up to the source's size), made by the API from an upload or a
 * finished book's picture.
 */
export const LandingImageSchema = z.object({
  path: z.string().regex(/^landing\/[A-Z]{2}\/[a-zA-Z]+-[a-f0-9]{8,32}$/),
  widths: z
    .array(z.number().int().min(16).max(4096))
    .min(1)
    .max(LANDING_IMAGE_WIDTHS.length)
    .refine((list) => list.every((w, i) => i === 0 || w > list[i - 1]), "Widths in increasing order"),
  /** The finished book it was taken from (its id and which picture), when picked from one. */
  book: z.object({ id: z.string().max(64), picture: z.string().max(20) }).optional(),
});
export type LandingImage = z.infer<typeof LandingImageSchema>;

/** Which pictures of a slot apply: "all" for every language of the country, or one language's own. */
export const LandingImageLanguageSchema = z.union([z.literal("all"), LanguageSchema]);
export type LandingImageLanguage = z.infer<typeof LandingImageLanguageSchema>;

/** One slot's pictures in a country: one for all its languages and/or one per language. */
export const LandingImageSetSchema = z.partialRecord(LandingImageLanguageSchema, LandingImageSchema);
export type LandingImageSet = z.infer<typeof LandingImageSetSchema>;

/** A stored landing picture as the page writes it: the largest file, the srcset, its width. */
export interface LandingPicture {
  src: string;
  srcSet: string;
  width: number;
  /** Where it comes from: the page's language's own picture, or the country's for all languages. */
  scope: "language" | "country";
}

/** The files of a stored landing picture. */
export function landingPicture(image: LandingImage, scope: LandingPicture["scope"] = "country"): LandingPicture {
  const url = (width: number) => `${FILES_PREFIX}${image.path}-${width}.webp`;
  const width = image.widths[image.widths.length - 1];
  return { src: url(width), srcSet: image.widths.map((w) => `${url(w)} ${w}w`).join(", "), width, scope };
}

/**
 * The picture a visitor from `country` reading in `language` sees in a slot: the country's picture
 * for that language, else its picture for all languages, else null (the default: DEFAULT_LANDING_IMAGES).
 */
export function landingImageFor(
  overrides: LandingOverrides | undefined,
  country: string,
  language: Language,
  slot: LandingImageSlot,
): LandingPicture | null {
  const set = overrides?.[country]?.images?.[slot];
  if (set?.[language]) return landingPicture(set[language], "language");
  if (set?.all) return landingPicture(set.all, "country");
  return null;
}

/**
 * Body of POST /admin/reference/landing/image?country=: a picture for one slot and language ("all":
 * every language of the country), either an uploaded file (a JPEG, PNG or WebP as a data URL) or a
 * picture of a finished book (its cover, hero sheet or a page: "cover", "hero", "page-3").
 */
export const LandingImageUploadSchema = z
  .object({
    slot: LandingImageSlotSchema,
    language: LandingImageLanguageSchema,
    image: z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "A JPEG, PNG or WebP data URL")
      .max(Math.ceil((LANDING_IMAGE_MAX_BYTES * 4) / 3) + 100)
      .optional(),
    book: z
      .object({ id: z.string().min(1).max(64), picture: z.string().regex(/^(cover|hero|page-\d{1,2})$/) })
      .optional(),
  })
  .refine((body) => Boolean(body.image) !== Boolean(body.book), { message: "An upload or a book's picture, one of them" });
export type LandingImageUpload = z.infer<typeof LandingImageUploadSchema>;

/** A finished book whose pictures a landing picture may be taken from (GET /admin/reference/landing/books). */
export const LandingBookSchema = z.object({
  id: z.string(),
  title: z.string(),
  language: LanguageSchema,
  /** Why it is offered: an example shown in the country, or a catalog sample (the country's or global). */
  source: z.enum(["example", "sample"]),
  pictures: z.array(z.object({ key: z.string(), url: z.string() })),
});
export type LandingBook = z.infer<typeof LandingBookSchema>;

/** A question only one country's landing has, in the languages it is written in (shown only in those). */
export const CountryFaqItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  q: z.partialRecord(LanguageSchema, z.string().trim().min(1).max(200)),
  a: z.partialRecord(LanguageSchema, z.string().trim().min(1).max(1500)),
  published: z.boolean(),
});
export type CountryFaqItem = z.infer<typeof CountryFaqItemSchema>;

/** Body of PUT /admin/reference/landing?country=: one country's overrides. */
export const CountryLandingSchema = z.object({
  hero: z.partialRecord(LanguageSchema, LandingHeroSchema).default({}),
  /** Ids of shared FAQ entries (reference.faq) this country's landing leaves out. */
  faqHidden: z.array(z.string().max(40)).max(100).default([]),
  /** The country's own questions, after the shared ones. */
  faq: z
    .array(CountryFaqItemSchema)
    .max(30)
    .default([])
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, i) => {
        if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Duplicate id" });
        seen.add(item.id);
      });
    }),
  /** Sections the country's landing does not show. */
  hiddenSections: z
    .array(LandingSectionSchema)
    .default([])
    .refine((list) => new Set(list).size === list.length, "Duplicate section"),
  /**
   * The country's own pictures by slot (POST /admin/reference/landing/image sets them; a PUT of the
   * rest without this field keeps them).
   */
  images: z.partialRecord(LandingImageSlotSchema, LandingImageSetSchema).optional(),
});
export type CountryLanding = z.infer<typeof CountryLandingSchema>;

/** Every country's landing overrides, by ISO code (reference.landing). */
export const LandingOverridesSchema = z.record(CountryKeySchema, CountryLandingSchema);
export type LandingOverrides = z.infer<typeof LandingOverridesSchema>;

/** The hero's title and lead for a visitor from `country` in `language`; null where the default stays. */
export function heroFor(overrides: LandingOverrides | undefined, country: string, language: Language): { title: string | null; lead: string | null } {
  const hero = overrides?.[country]?.hero[language];
  return { title: hero?.title?.trim() || null, lead: hero?.lead?.trim() || null };
}

/** Whether the landing shows this section to a visitor from `country`. */
export function sectionShown(overrides: LandingOverrides | undefined, country: string, section: LandingSection): boolean {
  return !overrides?.[country]?.hiddenSections.includes(section);
}

/** One question as the landing shows it: its text in the page's language (placeholders not filled yet). */
export interface LandingFaqEntry {
  id: string;
  /** The country's own question (not one of the shared ones). */
  own: boolean;
  q: string;
  a: string;
}

/**
 * The questions a visitor from `country` reading in `language` sees: the shared ones for the country
 * (faqFor) less those it hides, then its own published ones written in that language.
 */
export function landingFaq(
  items: readonly FaqItem[],
  overrides: LandingOverrides | undefined,
  country: Country,
  countries: readonly CountryEntry[],
  language: Language,
): LandingFaqEntry[] {
  const own = overrides?.[country];
  const hidden = new Set(own?.faqHidden ?? []);
  const shared = faqFor(items, country, countries)
    .filter((item) => !hidden.has(item.id))
    .map((item) => ({ id: item.id, own: false, q: localized(item.q, language), a: localized(item.a, language) }));
  const extra = (own?.faq ?? [])
    .filter((item) => item.published && item.q[language] && item.a[language])
    .map((item) => ({ id: item.id, own: true, q: item.q[language]!, a: item.a[language]! }));
  return [...shared, ...extra];
}

/**
 * GET /reference: what the site prices and offers. `countries` leaves out the blocked ones (Meta's
 * and the owner's), so the site never offers them; "other" is not in it.
 */
export const ReferenceSchema = z.object({
  /** Each currency's default book prices and delivery fee; a country without its own pays its currency's. */
  prices: DefaultPricesSchema,
  /** Print formats, each with whether it is offered globally; a country may offer and price them its own way (countryFormats, formatsFor). */
  formats: z.array(PrintFormatSchema),
  cities: z.array(CitySchema),
  countries: z.array(CountryEntrySchema),
  /** The landing's questions; the site gets only the published ones and picks those for its country. */
  faq: z.array(FaqItemSchema),
  /** Countries priced from their own book prices (in their currency) instead of their currency's default. */
  countryPrices: CountryPricesSchema.default({}),
  /** Countries' landing overrides (hero, FAQ, sections); the rest of the world gets the defaults. */
  landing: LandingOverridesSchema.default({}),
  /** Countries' own delivery fee and free-delivery rule; the rest pay their currency's default fee. */
  countryDelivery: CountryDeliveriesSchema.default({}),
  /** Countries' own format offer and cover prices; the rest use the formats as they are. */
  countryFormats: CountryFormatsSchema.default({}),
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

/**
 * The default prices of each currency; the seed of reference.prices. Tenge and dollar book prices
 * are those the site launched with; euro book prices and the dollar and euro delivery fees are
 * starting points for countries that move to those currencies. The Canadian and Australian dollar,
 * ringgit and franc lists (added with the launch countries) sit near the dollar tier and end in .90
 * as local shops price; their delivery fees wait for print there. Start-up adds a currency missing
 * from the stored prices (ReferenceService) and never changes one that is stored.
 */
export const DEFAULT_PRICES: DefaultPrices = {
  KZT: { books: { template: 1_900_00, custom: 2_900_00 }, delivery: 1_500_00 },
  USD: { books: { template: 3_90, custom: 5_90 }, delivery: 9_90 },
  EUR: { books: { template: 3_90, custom: 5_90 }, delivery: 6_90 },
  CAD: { books: { template: 6_90, custom: 7_90 }, delivery: 12_90 },
  AUD: { books: { template: 7_90, custom: 8_90 }, delivery: 14_90 },
  MYR: { books: { template: 19_90, custom: 24_90 }, delivery: 29_90 },
  CHF: { books: { template: 4_90, custom: 5_90 }, delivery: 8_90 },
};

/** The cities the site launched with; the seed of reference.cities. */
export const DEFAULT_CITIES: City[] = [
  { id: "almaty", country: "KZ", name: { ru: "Алматы", kk: "Алматы", en: "Almaty" }, freeDelivery: true },
  { id: "astana", country: "KZ", name: { ru: "Астана", kk: "Астана", en: "Astana" }, freeDelivery: true },
  { id: "shymkent", country: "KZ", name: { ru: "Шымкент", kk: "Шымкент", en: "Shymkent" }, freeDelivery: false },
  { id: "karaganda", country: "KZ", name: { ru: "Караганда", kk: "Қарағанды", en: "Karaganda" }, freeDelivery: false },
  { id: "aktobe", country: "KZ", name: { ru: "Актобе", kk: "Ақтөбе", en: "Aktobe" }, freeDelivery: false },
  { id: "taraz", country: "KZ", name: { ru: "Тараз", kk: "Тараз", en: "Taraz" }, freeDelivery: false },
  { id: "pavlodar", country: "KZ", name: { ru: "Павлодар", kk: "Павлодар", en: "Pavlodar" }, freeDelivery: false },
  { id: "ust-kamenogorsk", country: "KZ", name: { ru: "Усть-Каменогорск", kk: "Өскемен", en: "Oskemen" }, freeDelivery: false },
  { id: "atyrau", country: "KZ", name: { ru: "Атырау", kk: "Атырау", en: "Atyrau" }, freeDelivery: false },
  { id: "kostanay", country: "KZ", name: { ru: "Костанай", kk: "Қостанай", en: "Kostanay" }, freeDelivery: false },
];

/**
 * The countries the site launches with; the seed of reference.countries (and what a list still equal
 * to an older seed becomes on start: apps/api ReferenceService, launch-lineup.ts). Kazakhstan first
 * (Kazakh, Russian, English; tenge; print), then the English-speaking ones, the German-speaking and
 * Spain, each in its own currency and without print yet. Everywhere else is "other"; a superadmin
 * adds countries one at a time in the admin, each with its own content. Nothing on Meta's list of
 * restricted territories.
 */
export const DEFAULT_COUNTRIES: CountryEntry[] = [
  { code: "KZ", languages: ["kk", "ru", "en"], currency: "KZT", print: true },
  { code: "US", languages: ["en"], currency: "USD", print: false },
  { code: "CA", languages: ["en"], currency: "CAD", print: false },
  { code: "MY", languages: ["en"], currency: "MYR", print: false },
  { code: "AU", languages: ["en"], currency: "AUD", print: false },
  { code: "DE", languages: ["de", "en"], currency: "EUR", print: false },
  { code: "AT", languages: ["de", "en"], currency: "EUR", print: false },
  { code: "CH", languages: ["de", "en"], currency: "CHF", print: false },
  { code: "ES", languages: ["es", "en"], currency: "EUR", print: false },
];

/** Countries paying in euros (the euro area and the states that use it by agreement). */
const EURO_COUNTRIES = "AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA XK".split(" ");
/** Countries whose own currency the site prices in, besides the euro. */
const OWN_CURRENCY: Partial<Record<string, Currency>> = { KZ: "KZT", US: "USD", CA: "CAD", AU: "AUD", MY: "MYR", CH: "CHF", LI: "CHF" };
/** Where German or Spanish is what families read; elsewhere English (Russian is added by hand). */
const GERMAN = ["DE", "AT", "CH", "LI", "LU"];
const SPANISH = "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY".split(" ");

/**
 * What a country the superadmin adds in the Countries tab starts with: its own currency when the site
 * prices in it (the euro area in euros), else dollars; its language first, then English; no print.
 * It is priced from that currency's defaults (reference.prices) until it gets its own.
 */
export function suggestedCountry(code: string): CountryEntry {
  const currency: Currency = OWN_CURRENCY[code] ?? (EURO_COUNTRIES.includes(code) ? "EUR" : "USD");
  const languages: Language[] = code === "KZ" ? ["kk", "ru", "en"] : GERMAN.includes(code) ? ["de", "en"] : SPANISH.includes(code) ? ["es", "en"] : ["en"];
  return { code, languages, currency, print: false };
}

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
      ru: "Первые книги - бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история - {customPrice}. Цены в тенге; печатная книга оплачивается отдельно.",
      kk: "Алғашқы кітаптар - тегін. Одан кейін каталогтағы кітап - {templatePrice}, өз ертегіңіз - {customPrice}. Бағалар теңгемен; басылған кітап бөлек төленеді.",
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
      ru: "Первые книги - бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история - {customPrice}. Цены указаны в валюте вашей страны.",
      kk: "Алғашқы кітаптар - тегін. Одан кейін каталогтағы кітап - {templatePrice}, өз ертегіңіз - {customPrice}. Бағалар еліңіздің валютасында көрсетілген.",
      en: "Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. Prices are shown in your country's currency.",
      es: "Los primeros libros son gratis. Después, un libro del catálogo cuesta {templatePrice} y una historia propia, {customPrice}. Los precios se muestran en la moneda de tu país.",
      de: "Die ersten Bücher sind kostenlos. Danach kostet ein Buch aus dem Katalog {templatePrice}, eine eigene Geschichte {customPrice}. Die Preise werden in der Währung deines Landes angezeigt.",
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
      ru: "Героя рисуют по описанию - фотография ребёнка для этого не нужна. Если хотите, можно добавить в книгу отдельную страницу с фото ребёнка: это фото не передаётся моделям ИИ, хранится только для этой книги и удаляется вместе со страницей или книгой. Фото игрушки - тоже по желанию. Всё удалим по запросу на hello@fabulka.com.",
      kk: "Кейіпкер сипаттама бойынша салынады - бұл үшін баланың фотосы керек емес. Қаласаңыз, кітапқа баланың фотосы бар жеке бет қосуға болады: ол фото жасанды интеллект модельдеріне жіберілмейді, тек осы кітап үшін сақталады және бетпен не кітаппен бірге өшіріледі. Ойыншықтың фотосы да - қалауыңыз бойынша. Сұрауыңыз бойынша бәрін өшіреміз: hello@fabulka.com.",
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
      ru: "На странице готовой книги нажмите «Заказать печатную книгу». Мягкая обложка - {softCover}, твёрдая - {hardCover}. Бесплатная доставка: {freeCities}; в другие города - {delivery}.",
      kk: "Дайын кітаптың бетінде «Басылған кітапқа тапсырыс» батырмасын басыңыз. Жұмсақ мұқаба - {softCover}, қатты мұқаба - {hardCover}. Тегін жеткізу: {freeCities}; басқа қалаларға - {delivery}.",
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
      ru: "К сожалению, в вашей стране печатные книги пока недоступны, но мы планируем открыть печать и в других странах. А пока готовую книгу можно скачать в PDF и распечатать самим. Нажмите «Хочу печатную книгу» на странице книги - и мы сообщим, когда печать заработает у вас.",
      kk: "Өкінішке қарай, сіздің еліңізде басылған кітаптар әзірге қолжетімсіз, бірақ біз басып шығаруды басқа елдерде де іске қосуды жоспарлап отырмыз. Әзірге дайын кітапты PDF түрінде жүктеп, өзіңіз басып шығара аласыз. Кітап бетінде «Басылған кітап керек» батырмасын басыңыз - басып шығару сіздің еліңізде іске қосылғанда хабарлаймыз.",
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
      ru: "Сделайте новую: поменяйте ответы, тему или методику. Если что-то пошло не так, напишите нам на hello@fabulka.com - разберёмся.",
      kk: "Жаңасын жасаңыз: жауаптарды, тақырыпты не әдістемені өзгертіңіз. Бірдеңе дұрыс болмаса, hello@fabulka.com мекенжайына жазыңыз - көмектесеміз.",
      en: "Make another one: change the answers, the topic or the method. If something went wrong, write to hello@fabulka.com and we'll sort it out.",
      es: "Haz otro: cambia las respuestas, la temática o el método. Si hubo algún problema, escríbenos a hello@fabulka.com y lo solucionamos.",
      de: "Erstell einfach ein neues: Ändere die Antworten, das Thema oder die Methode. Wenn etwas schiefgelaufen ist, schreib uns an hello@fabulka.com – wir kümmern uns darum.",
    },
  },
];
