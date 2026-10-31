import { z } from "zod";

// ---- Reference data the owner edits in the admin («Справочники») ----------------------------
//
// Kept in the Setting table (keys below) and seeded from the defaults here when absent. The API
// prices every purchase and order from the stored values; the site reads them from GET /reference.

/** Setting keys of the reference data. */
export const REFERENCE_KEYS = {
  prices: "reference.prices",
  cities: "reference.cities",
  extraBlocked: "geo.extra_blocked",
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
  /** One printed copy, by cover, in tenge. */
  covers: z.object({ soft: tenge.min(1), hard: tenge.min(1) }),
  /** Flat delivery fee to a city without free delivery, in tenge. */
  deliveryKzt: tenge,
});
export type Prices = z.infer<typeof PricesSchema>;

const cityName = z.string().trim().min(2).max(60);

/** A city we deliver printed books to. The Russian name is what an order stores. */
export const CitySchema = z.object({
  ru: cityName,
  kk: cityName,
  en: cityName,
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
    const seen = new Set<string>();
    cities.forEach((city, i) => {
      const key = city.ru.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [i, "ru"], message: "Duplicate city" });
      seen.add(key);
    });
  });

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

/** GET /reference: what the site prices and offers. */
export const ReferenceSchema = z.object({ prices: PricesSchema, cities: z.array(CitySchema) });
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

/** GET /admin/reference. */
export const AdminReferenceSchema = ReferenceSchema.extend({ blocked: BlockedCountriesSchema });
export type AdminReference = z.infer<typeof AdminReferenceSchema>;

/** The prices the site launched with; the seed of reference.prices. */
export const DEFAULT_PRICES: Prices = {
  books: {
    template: { KZT: 1900, USD: 3.9 },
    custom: { KZT: 2900, USD: 5.9 },
  },
  covers: { soft: 9900, hard: 14900 },
  deliveryKzt: 1500,
};

/** The cities the site launched with; the seed of reference.cities. */
export const DEFAULT_CITIES: City[] = [
  { ru: "Алматы", kk: "Алматы", en: "Almaty", freeDelivery: true },
  { ru: "Астана", kk: "Астана", en: "Astana", freeDelivery: true },
  { ru: "Шымкент", kk: "Шымкент", en: "Shymkent", freeDelivery: false },
  { ru: "Караганда", kk: "Қарағанды", en: "Karaganda", freeDelivery: false },
  { ru: "Актобе", kk: "Ақтөбе", en: "Aktobe", freeDelivery: false },
  { ru: "Тараз", kk: "Тараз", en: "Taraz", freeDelivery: false },
  { ru: "Павлодар", kk: "Павлодар", en: "Pavlodar", freeDelivery: false },
  { ru: "Усть-Каменогорск", kk: "Өскемен", en: "Oskemen", freeDelivery: false },
  { ru: "Атырау", kk: "Атырау", en: "Atyrau", freeDelivery: false },
  { ru: "Костанай", kk: "Қостанай", en: "Kostanay", freeDelivery: false },
];
