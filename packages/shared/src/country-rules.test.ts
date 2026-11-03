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
  orderPrice,
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
  pricesFor,
  ruleShows,
  sampleInLanguage,
  scopeOf,
  sectionShown,
  withCountry,
  type CountryRule,
  type LandingOverrides,
  type Prices,
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
  const de: Prices = { books: { template: { KZT: 1900, USD: 4.9 }, custom: { KZT: 2900, USD: 6.9 } }, deliveryKzt: 1500 };

  it("prices a country from its own list when it has one, else the global one", () => {
    expect(pricesFor("DE", DEFAULT_PRICES, { DE: de })).toBe(de);
    expect(pricesFor("KZ", DEFAULT_PRICES, { DE: de })).toBe(DEFAULT_PRICES);
    expect(pricesFor("DE", DEFAULT_PRICES, undefined)).toBe(DEFAULT_PRICES);
    expect(bookPrice("template", "DE", DEFAULT_PRICES, DEFAULT_COUNTRIES, { DE: de })).toEqual({ amount: 4.9, currency: "USD" });
    expect(bookPrice("template", "AT", DEFAULT_PRICES, DEFAULT_COUNTRIES, { DE: de })).toEqual({ amount: 3.9, currency: "USD" });
    expect(bookPrice("custom", "KZ", DEFAULT_PRICES, DEFAULT_COUNTRIES, { DE: de })).toEqual({ amount: 2900, currency: "KZT" });
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

  it("delivers at a country's own fee and rule, else the global fee to the non-free cities", () => {
    const square = DEFAULT_FORMATS[0];
    expect(deliveryFor("DE", DEFAULT_PRICES, {})).toEqual({ deliveryKzt: 1500, freeEverywhere: false });
    const own = { DE: { feeKzt: 900, freeEverywhere: false }, AT: { feeKzt: 900, freeEverywhere: true } };
    expect(orderPrice(square, "soft", 1, "munich", deliveryFor("DE", DEFAULT_PRICES, own), [de]).delivery).toBe(900);
    expect(orderPrice(square, "soft", 1, "berlin", deliveryFor("DE", DEFAULT_PRICES, own), [de]).delivery).toBe(0);
    expect(orderPrice(square, "soft", 1, "vienna", deliveryFor("AT", DEFAULT_PRICES, own), []).delivery).toBe(0);
  });

  it("offers and prices formats per country, falling back to the global ones", () => {
    const [square, a4] = DEFAULT_FORMATS;
    const own = { DE: { [square.id]: { published: false }, [a4.id]: { prices: { soft: 5000, hard: 8000 } } } };
    const de = formatsFor("DE", DEFAULT_FORMATS, own);
    expect(de.find((f) => f.id === square.id)?.published).toBe(false);
    expect(de.find((f) => f.id === a4.id)?.prices).toEqual({ soft: 5000, hard: 8000 });
    expect(de.find((f) => f.id === a4.id)?.widthMm).toBe(a4.widthMm);
    expect(formatsFor("KZ", DEFAULT_FORMATS, own)).toEqual(DEFAULT_FORMATS);
    expect(lowestCoverPrice(de, "soft")).toBe(Math.min(5000, DEFAULT_FORMATS[2].prices.soft));
  });
});
