import { describe, expect, it } from "vitest";
import {
  BUILTIN_ROLES,
  CitiesSchema,
  DEFAULT_CITIES,
  DEFAULT_COUNTRIES,
  DEFAULT_FAQ,
  DEFAULT_FORMATS,
  citiesOf,
  deliveryFor,
  formatsFor,
  lowestCoverPrice,
  offeredFormats,
  quoteOrder,
  bookPricesFor,
  DEFAULT_PRICES,
  CountryLandingSchema,
  EVERYWHERE,
  SUPER_ROLE,
  accessFromMe,
  accessOf,
  allowedFor,
  bookPrice,
  exampleShownIn,
  heroFor,
  isEverywhere,
  landingFaq,
  normalizeRule,
  ownerCountries,
  pickSample,
  ruleShows,
  sampleInLanguage,
  scopeOf,
  sectionShown,
  withCountry,
  type CountryRule,
  type LandingOverrides,
} from "./index";

const inc = (...countries: string[]): CountryRule => ({ mode: "include", countries });
const exc = (...countries: string[]): CountryRule => ({ mode: "exclude", countries });

describe("country rules (include / exclude)", () => {
  it("shows an include list only in its countries, everywhere when empty", () => {
    expect(ruleShows(inc("DE"), "DE")).toBe(true);
    expect(ruleShows(inc("DE"), "KZ")).toBe(false);
    expect(ruleShows(inc("DE"), null)).toBe(false);
    expect(ruleShows(EVERYWHERE, null)).toBe(true);
    expect(ruleShows(EVERYWHERE, "KZ")).toBe(true);
  });

  it("shows \"everywhere except\" everywhere but its countries, \"other\" included", () => {
    expect(ruleShows(exc("KZ"), "KZ")).toBe(false);
    expect(ruleShows(exc("KZ"), "DE")).toBe(true);
    expect(ruleShows(exc("KZ"), null)).toBe(true);
    expect(ruleShows(exc(), "KZ")).toBe(true);
    expect(normalizeRule(exc())).toEqual(EVERYWHERE);
    expect(isEverywhere(exc())).toBe(true);
  });

  it("names owner countries only for an include list with countries", () => {
    expect(ownerCountries(inc("DE", "AT"))).toEqual(["DE", "AT"]);
    expect(ownerCountries(EVERYWHERE)).toBeNull();
    expect(ownerCountries(exc("KZ"))).toBeNull();
  });

  it("shows or hides in one country, leaving the others as they are", () => {
    expect(withCountry(EVERYWHERE, "DE", false)).toEqual(exc("DE"));
    expect(withCountry(EVERYWHERE, "DE", true)).toEqual(EVERYWHERE);
    expect(withCountry(inc("KZ"), "DE", true)).toEqual(inc("KZ", "DE"));
    expect(withCountry(inc("KZ", "DE"), "DE", false)).toEqual(inc("KZ"));
    // The last listed country cannot go: an empty include list means everywhere.
    expect(withCountry(inc("DE"), "DE", false)).toBeNull();
    expect(withCountry(exc("DE"), "DE", true)).toEqual(EVERYWHERE);
    expect(withCountry(exc("KZ"), "DE", false)).toEqual(exc("KZ", "DE"));
    expect(withCountry(exc("KZ", "DE"), "DE", true)).toEqual(exc("KZ"));
  });

  it("uses an example's own rule, else its catalog book's", () => {
    expect(exampleShownIn(exc("KZ"), inc("KZ"), "KZ")).toBe(false);
    expect(exampleShownIn(exc("KZ"), inc("KZ"), "DE")).toBe(true);
    expect(exampleShownIn(inc(), exc("DE"), "DE")).toBe(false);
    expect(exampleShownIn(inc(), exc("DE"), null)).toBe(true);
    expect(exampleShownIn(inc(), null, null)).toBe(true);
  });
});

describe("catalog samples per country", () => {
  const s = (language: "en" | "de" | "ru" | "kk" | "es", country: string | null) => ({ language, country, id: `${language}-${country ?? "global"}` });
  const samples = [s("de", null), s("de", "AT"), s("en", null), s("en", "DE"), s("ru", null)];

  it("picks the country's sample, else the global one, in the visitor's language", () => {
    expect(pickSample(samples, "de", "AT")?.id).toBe("de-AT");
    expect(pickSample(samples, "de", "DE")?.id).toBe("de-global");
    expect(pickSample(samples, "en", "DE")?.id).toBe("en-DE");
    expect(pickSample(samples, "en", null)?.id).toBe("en-global");
  });

  it("then follows the language fallbacks, the country's before the global one each time", () => {
    // Spanish → English → Russian: Germany's English sample comes first.
    expect(pickSample(samples, "es", "DE")?.id).toBe("en-DE");
    expect(pickSample(samples, "es", "KZ")?.id).toBe("en-global");
    expect(pickSample(samples, "kk", "KZ")?.id).toBe("ru-global");
    // Never another country's sample.
    expect(pickSample([s("de", "AT")], "de", "DE")).toBeNull();
    expect(pickSample([s("de", "AT")], "de", "AT")?.id).toBe("de-AT");
    expect(pickSample([], "de", "AT")).toBeNull();
  });

  it("keeps to exactly one language on the home page", () => {
    expect(sampleInLanguage(samples, "de", "AT")?.id).toBe("de-AT");
    expect(sampleInLanguage(samples, "de", "DE")?.id).toBe("de-global");
    expect(sampleInLanguage(samples, "es", "DE")).toBeNull();
  });
});

describe("country prices", () => {
  const de = { currency: "USD" as const, books: { template: 4_90, custom: 6_90 } };
  const data = { prices: DEFAULT_PRICES, countries: DEFAULT_COUNTRIES };

  it("prices a country from its own list in its currency, else its currency's default", () => {
    expect(bookPrice("template", "DE", { ...data, countryPrices: { DE: de } })).toEqual({ amount: 4_90, currency: "USD" });
    expect(bookPrice("template", "AT", { ...data, countryPrices: { DE: de } })).toEqual({ amount: 3_90, currency: "USD" });
    expect(bookPrice("custom", "KZ", { ...data, countryPrices: { DE: de } })).toEqual({ amount: 2_900_00, currency: "KZT" });
    expect(bookPricesFor("DE", { ...data, countryPrices: { DE: de } })?.own).toBe(true);
    expect(bookPricesFor("AT", { ...data, countryPrices: { DE: de } })?.own).toBe(false);
  });

  it("uses the default of the country's currency, and drops its own list saved in another one", () => {
    const countries = DEFAULT_COUNTRIES.map((c) => (c.code === "DE" ? { ...c, currency: "EUR" as const } : c));
    // Germany moved to euros: its dollar list no longer counts, the euro default does.
    expect(bookPrice("template", "DE", { prices: DEFAULT_PRICES, countries, countryPrices: { DE: de } })).toEqual({ amount: 3_90, currency: "EUR" });
    const euro = { currency: "EUR" as const, books: { template: 4_50, custom: 6_50 } };
    expect(bookPrice("custom", "DE", { prices: DEFAULT_PRICES, countries, countryPrices: { DE: euro } })).toEqual({ amount: 6_50, currency: "EUR" });
    // A currency with no default and no own list has no price.
    expect(bookPrice("template", "DE", { prices: { KZT: DEFAULT_PRICES.KZT }, countries })).toBeNull();
    // "other" stays in dollars.
    expect(bookPrice("template", "other", { prices: DEFAULT_PRICES, countries })).toEqual({ amount: 3_90, currency: "USD" });
  });
});

describe("country landing overrides", () => {
  const overrides: LandingOverrides = {
    DE: CountryLandingSchema.parse({
      hero: { de: { title: "Bücher für Emma", lead: "  " }, en: { lead: "Made in Germany" } },
      faqHidden: ["time"],
      faq: [
        { id: "versand", q: { de: "Versand?" }, a: { de: "Bald." }, published: true },
        { id: "draft", q: { de: "Entwurf?" }, a: { de: "Nein." }, published: false },
      ],
      hiddenSections: ["toyStory"],
    }),
  };

  it("overrides the hero per language and keeps the default elsewhere", () => {
    expect(heroFor(overrides, "DE", "de")).toEqual({ title: "Bücher für Emma", lead: null });
    expect(heroFor(overrides, "DE", "en")).toEqual({ title: null, lead: "Made in Germany" });
    expect(heroFor(overrides, "DE", "ru")).toEqual({ title: null, lead: null });
    expect(heroFor(overrides, "KZ", "de")).toEqual({ title: null, lead: null });
    expect(heroFor(undefined, "DE", "de")).toEqual({ title: null, lead: null });
  });

  it("hides sections only in its country", () => {
    expect(sectionShown(overrides, "DE", "toyStory")).toBe(false);
    expect(sectionShown(overrides, "DE", "faq")).toBe(true);
    expect(sectionShown(overrides, "KZ", "toyStory")).toBe(true);
  });

  it("leaves out the shared questions it hides and adds its own, in the languages they are written in", () => {
    const de = landingFaq(DEFAULT_FAQ, overrides, "DE", DEFAULT_COUNTRIES, "de");
    expect(de.map((q) => q.id)).not.toContain("time");
    expect(de.at(-1)).toEqual({ id: "versand", own: true, q: "Versand?", a: "Bald." });
    expect(de.map((q) => q.id)).not.toContain("draft");
    // English has no text of its own: only the shared questions.
    expect(landingFaq(DEFAULT_FAQ, overrides, "DE", DEFAULT_COUNTRIES, "en").some((q) => q.own)).toBe(false);
    // Another country gets the defaults.
    expect(landingFaq(DEFAULT_FAQ, overrides, "AT", DEFAULT_COUNTRIES, "de").map((q) => q.id)).toContain("time");
  });
});

describe("country scope", () => {
  const de = accessOf(["country_manager"], BUILTIN_ROLES, ["DE"]);
  const superadmin = accessOf([SUPER_ROLE], BUILTIN_ROLES, []);

  it("limits a manager's rights to their countries and nothing else", () => {
    expect(scopeOf(de, "examples")).toEqual(["DE"]);
    expect(scopeOf(de, "reference.prices")).toEqual(["DE"]);
    expect(scopeOf(de, "seo")).toEqual([]);
    expect(scopeOf(superadmin, "examples")).toBeNull();
    expect(allowedFor(de, "reference.prices", ["DE"])).toBe(true);
    expect(allowedFor(de, "reference.prices", ["KZ"])).toBe(false);
    expect(allowedFor(de, "reference.prices", null)).toBe(false);
  });

  it("rebuilds the session's access in the browser from /admin/me", () => {
    const me = { ok: true as const, who: "a@b.c", roles: ["country_manager"], permissions: [], rights: ["examples" as const, "orders" as const], global: [], countries: ["DE"], superadmin: false };
    const access = accessFromMe(me);
    expect(allowedFor(access, "examples", ["DE"])).toBe(true);
    expect(allowedFor(access, "examples", ["KZ"])).toBe(false);
    expect(allowedFor(access, "catalog", ["DE"])).toBe(false);
    const sup = accessFromMe({ ...me, roles: [SUPER_ROLE], superadmin: true, countries: [] });
    expect(allowedFor(sup, "examples", null)).toBe(true);
  });
});

describe("per-country cities, delivery and formats", () => {
  const de = { id: "berlin", country: "DE", name: { ru: "Берлин", en: "Berlin" }, freeDelivery: true };
  it("lists a country's cities only, and lets two countries share a name but not an id", () => {
    const cities = [...DEFAULT_CITIES, de];
    expect(citiesOf("DE", cities).map((c) => c.id)).toEqual(["berlin"]);
    expect(citiesOf("KZ", cities)).toHaveLength(DEFAULT_CITIES.length);
    expect(CitiesSchema.safeParse([...cities, { ...de, id: "berlin-2", country: "AT" }]).success).toBe(true);
    expect(CitiesSchema.safeParse([...cities, { ...de, id: "berlin-2" }]).success).toBe(false);
    expect(CitiesSchema.safeParse([...cities, { ...de, country: "AT" }]).success).toBe(false);
  });

  it("delivers at a country's own fee and rule, else its currency's default fee to the non-free cities", () => {
    const countries = DEFAULT_COUNTRIES.map((c) => (c.code === "DE" || c.code === "AT" ? { ...c, currency: "EUR" as const, print: true } : c));
    const formats = DEFAULT_FORMATS;
    const square = offeredFormats("DE", { prices: DEFAULT_PRICES, countries, formats })[0];
    const quote = (country: string, cityId: string, countryDelivery = {}, cities = [de]) =>
      quoteOrder({ bookId: "b", format: square, cover: "soft", quantity: 1, cityId, delivery: deliveryFor(country, { prices: DEFAULT_PRICES, countries, countryDelivery }), cities });
    expect(deliveryFor("DE", { prices: DEFAULT_PRICES, countries })).toEqual({ fee: { amount: 6_90, currency: "EUR" }, freeEverywhere: false, cost: null, own: false });
    const own = {
      DE: { currency: "EUR" as const, fee: 4_00, freeEverywhere: false, cost: { amount: 3_00, currency: "EUR" as const } },
      AT: { currency: "EUR" as const, fee: 4_00, freeEverywhere: true },
    };
    expect(quote("DE", "munich", own).delivery).toEqual({ amount: 4_00, currency: "EUR" });
    expect(quote("DE", "munich", own).deliveryCost).toEqual({ amount: 3_00, currency: "EUR" });
    expect(quote("DE", "berlin", own).delivery).toEqual({ amount: 0, currency: "EUR" });
    expect(quote("DE", "berlin", own).deliveryCost).toBeNull();
    expect(quote("AT", "vienna", own, []).delivery.amount).toBe(0);
    // A fee saved in tenge before Germany moved to euros: the euro default applies.
    expect(deliveryFor("DE", { prices: DEFAULT_PRICES, countries, countryDelivery: { DE: { currency: "KZT", fee: 900_00, freeEverywhere: true } } })).toMatchObject({
      fee: { amount: 6_90, currency: "EUR" },
      freeEverywhere: false,
      own: false,
    });
  });

  it("offers and prices formats per country in its currency, falling back to the format's price in it", () => {
    const [square, a4, a5] = DEFAULT_FORMATS;
    const own = {
      DE: {
        [square.id]: { published: false },
        [a4.id]: { prices: { currency: "USD" as const, soft: 50_00, hard: 80_00 }, cost: { currency: "EUR" as const, soft: 9_00, hard: 14_00 } },
        [a5.id]: { prices: { currency: "KZT" as const, soft: 5_000_00, hard: 8_000_00 } },
      },
    };
    const data = { prices: DEFAULT_PRICES, countries: DEFAULT_COUNTRIES, formats: DEFAULT_FORMATS, countryFormats: own };
    const local = formatsFor("DE", data);
    expect(local.find((f) => f.id === square.id)?.published).toBe(false);
    expect(local.find((f) => f.id === a4.id)?.prices).toEqual({ soft: { amount: 50_00, currency: "USD" }, hard: { amount: 80_00, currency: "USD" } });
    expect(local.find((f) => f.id === a4.id)?.cost?.soft).toEqual({ amount: 9_00, currency: "EUR" });
    expect(local.find((f) => f.id === a4.id)?.widthMm).toBe(a4.widthMm);
    // Germany charges dollars: a5's tenge override is ignored, its dollar default applies.
    expect(local.find((f) => f.id === a5.id)?.prices?.soft).toEqual({ amount: 14_90, currency: "USD" });
    expect(formatsFor("KZ", data).map((f) => f.prices?.soft.amount)).toEqual([9_900_00, 13_900_00, 6_900_00]);
    expect(lowestCoverPrice(local, "soft")).toEqual({ amount: 14_90, currency: "USD" });
    expect(offeredFormats("DE", data).map((f) => f.id)).toEqual([a4.id, a5.id]);
    // A format with no price in the country's currency is not offered there.
    const noEuro = DEFAULT_FORMATS.map((f) => ({ ...f, prices: { KZT: f.prices.KZT } }));
    const euro = DEFAULT_COUNTRIES.map((c) => (c.code === "DE" ? { ...c, currency: "EUR" as const } : c));
    expect(offeredFormats("DE", { ...data, countries: euro, formats: noEuro, countryFormats: {} })).toEqual([]);
  });
});
