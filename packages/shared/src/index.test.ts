import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMATS,
  FormatsSchema,
  lowestCoverPrice,
  CountriesSchema,
  DEFAULT_COUNTRIES,
  DEFAULT_FAQ,
  FaqSchema,
  countryInfo,
  faqFor,
  fillFaq,
  localized,
  localizedTextSchema,
  pickLanguage,
  UpdateTemplateSchema,
  catalogCountry,
  exampleShownIn,
  exampleVersionState,
  displayVersion,
  isExampleError,
  ReorderExamplesSchema,
  TranslateExampleSchema,
  transliterate,
  UpdateExampleSchema,
  showcaseRule,
  methodologyText,
  cityId,
  cityName,
  upgradeCities,
  ChildProfileSchema,
  ClientErrorReportSchema,
  CreateBookSchema,
  CreateMethodologySchema,
  DEFAULT_METHODOLOGIES,
  JournalCallsQuerySchema,
  MethodologySlugSchema,
  UpdateMethodologySchema,
  ageBand,
  defaultMethodology,
  fitsAge,
  CreateOrderSchema,
  CitiesSchema,
  DEFAULT_CITIES,
  DEFAULT_PRICES,
  ISO_COUNTRY_CODES,
  DefaultPricesSchema,
  BookPricesSchema,
  CountryDeliverySchema,
  paymentProviderOf,
  offeredFormats,
  quoteOrder,
  deliveryFor,
  formatsFor,
  type LocalFormat,
  PurchaseSchema,
  UpdateBlockedSchema,
  StorySchema,
  bookPrice,
  countryFromIp,
  languageFor,

  orderStatusAt,
  orderTimeline,
  maskPhone,
  progressFor,
} from "./index";

describe("ChildProfileSchema", () => {
  it("defaults the language to Russian and coerces age", () => {
    const child = ChildProfileSchema.parse({
      name: "Айгерим",
      age: "6",
      gender: "girl",
      interests: ["космос"],
      city: "Алматы",
    });
    expect(child.language).toBe("ru");
    expect(child.age).toBe(6);
  });

  it("rejects an empty interest list", () => {
    expect(
      ChildProfileSchema.safeParse({ name: "A", age: 5, gender: "boy", interests: [], city: "X" }).success,
    ).toBe(false);
  });
});

describe("StorySchema", () => {
  it("requires at least one page", () => {
    expect(StorySchema.safeParse({ title: "T", hero_description: "H", pages: [] }).success).toBe(false);
  });
});

describe("progressFor", () => {
  it("moves through the pages stage proportionally", () => {
    expect(progressFor("pages", 0, 10)).toBe(30);
    expect(progressFor("pages", 5, 10)).toBe(60);
    expect(progressFor("done")).toBe(100);
  });
});

describe("orders", () => {
  const data = { prices: DEFAULT_PRICES, countries: DEFAULT_COUNTRIES, formats: DEFAULT_FORMATS };
  const square = offeredFormats("KZ", data)[0];
  const quote = (format: LocalFormat, cover: "soft" | "hard", quantity: number, cityId: string, prices = DEFAULT_PRICES, cities = DEFAULT_CITIES) =>
    quoteOrder({ bookId: "b1", format, cover, quantity, cityId, delivery: deliveryFor("KZ", { prices, countries: DEFAULT_COUNTRIES }), cities });
  const kzt = (amount: number) => ({ amount, currency: "KZT" });

  it("prices delivery by city id", () => {
    expect(quote(square, "hard", 2, "almaty")).toMatchObject({ currency: "KZT", subtotal: kzt(29_800_00), delivery: kzt(0), total: kzt(29_800_00) });
    expect(quote(square, "soft", 1, "shymkent")).toMatchObject({ subtotal: kzt(9_900_00), delivery: kzt(1_500_00), total: kzt(11_400_00) });
    // A name is not an id: no free delivery by the Russian name any more.
    expect(quote(square, "soft", 1, "Алматы").delivery).toEqual(kzt(1_500_00));
  });

  it("snapshots each line: the book, format, cover, quantity, unit price and line total", () => {
    const order = quote(square, "hard", 3, "shymkent");
    expect(order.lines).toEqual([{ bookId: "b1", format: "square-210", cover: "hard", quantity: 3, unit: kzt(14_900_00), total: kzt(44_700_00), unitCost: null }]);
    expect(order.total.amount).toBe(order.lines.reduce((sum, l) => sum + l.total.amount, 0) + order.delivery.amount);
  });

  it("prices copies by the format and delivery by the owner's free-delivery cities", () => {
    const prices = { ...DEFAULT_PRICES, KZT: { ...DEFAULT_PRICES.KZT!, delivery: 700_00 } };
    const format = { ...square, prices: { soft: kzt(5_000_00), hard: kzt(8_000_00) } } as LocalFormat;
    const cities = DEFAULT_CITIES.map((c) => ({ ...c, freeDelivery: c.id === "shymkent" }));
    expect(quote(format, "soft", 2, "shymkent", prices, cities)).toMatchObject({ subtotal: kzt(10_000_00), delivery: kzt(0), total: kzt(10_000_00) });
    expect(quote(format, "hard", 1, "almaty", prices, cities)).toMatchObject({ subtotal: kzt(8_000_00), delivery: kzt(700_00), total: kzt(8_700_00) });
    // A city that is no longer listed pays the fee.
    expect(quote(format, "soft", 1, "tirana", prices, cities).delivery).toEqual(kzt(700_00));
    const a4 = offeredFormats("KZ", data).find((f) => f.id === "a4-landscape")!;
    expect(quote(a4, "soft", 1, "almaty").total).toEqual(kzt(13_900_00));
  });

  it("prices a euro order in euros, and refuses a format with no price there", () => {
    const countries = DEFAULT_COUNTRIES.map((c) => (c.code === "DE" ? { ...c, currency: "EUR" as const, print: true } : c));
    const de = offeredFormats("DE", { ...data, countries })[0];
    const order = quoteOrder({ bookId: "b", format: de, cover: "hard", quantity: 2, cityId: "berlin", delivery: deliveryFor("DE", { prices: DEFAULT_PRICES, countries }), cities: [] });
    expect(order).toMatchObject({ currency: "EUR", subtotal: { amount: 55_80, currency: "EUR" }, delivery: { amount: 6_90, currency: "EUR" }, total: { amount: 62_70, currency: "EUR" } });
    expect(() => quoteOrder({ bookId: "b", format: { ...de, prices: null }, cover: "soft", quantity: 1, cityId: "x", delivery: { fee: null }, cities: [] })).toThrow();
  });

  it("checks print formats", () => {
    expect(FormatsSchema.safeParse(DEFAULT_FORMATS).success).toBe(true);
    expect(FormatsSchema.safeParse([...DEFAULT_FORMATS, DEFAULT_FORMATS[0]]).success).toBe(false);
    expect(FormatsSchema.safeParse(DEFAULT_FORMATS.map((f) => ({ ...f, published: false }))).success).toBe(false);
    expect(FormatsSchema.safeParse([{ ...DEFAULT_FORMATS[0], prices: { KZT: { soft: 0, hard: 100 } } }]).success).toBe(false);
    // Tenge prices are whole tenge, dollar ones whole cents.
    expect(FormatsSchema.safeParse([{ ...DEFAULT_FORMATS[0], prices: { KZT: { soft: 9_900_50, hard: 14_900_00 } } }]).success).toBe(false);
    expect(FormatsSchema.safeParse([{ ...DEFAULT_FORMATS[0], prices: { USD: { soft: 19_95, hard: 29_99 } } }]).success).toBe(true);
    expect(FormatsSchema.safeParse([{ ...DEFAULT_FORMATS[0], prices: { USD: { soft: 19.5, hard: 29_99 } } }]).success).toBe(false);
    expect(FormatsSchema.safeParse([{ ...DEFAULT_FORMATS[0], safeMm: 80 }]).success).toBe(false);
    expect(lowestCoverPrice(offeredFormats("KZ", data), "soft")).toEqual(kzt(6_900_00));
    const onlySquare = DEFAULT_FORMATS.map((f) => ({ ...f, published: f.id === "square-210" }));
    expect(lowestCoverPrice(formatsFor("KZ", { ...data, formats: onlySquare }), "hard")).toEqual(kzt(14_900_00));
  });

  it("makes city ids from Russian and Kazakh names", () => {
    expect(cityId("Усть-Каменогорск")).toBe("ust-kamenogorsk");
    expect(cityId(" Қостанай ")).toBe("kostanay");
    expect(cityId("Алматы", ["almaty"])).toBe("almaty-2");
    expect(cityId("Almaty", ["almaty", "almaty-2"])).toBe("almaty-3");
    expect(cityId("!!!")).toBe("city");
    expect(DEFAULT_CITIES.map((c) => c.id)).toEqual(DEFAULT_CITIES.map((c) => cityId(c.name.ru ?? "")));
  });

  it("upgrades the cities stored before ids, keeping their order", () => {
    const old = [
      { ru: "Алматы", kk: "Алматы", en: "Almaty", freeDelivery: true },
      { ru: "Туркестан", kk: "Түркістан", en: "Turkistan", freeDelivery: false },
      { ru: "Алматы ", kk: "", en: "Almaty 2", freeDelivery: false },
    ];
    expect(upgradeCities(old)).toEqual([
      { id: "almaty", country: "KZ", name: { ru: "Алматы", kk: "Алматы", en: "Almaty" }, freeDelivery: true },
      { id: "turkestan", country: "KZ", name: { ru: "Туркестан", kk: "Түркістан", en: "Turkistan" }, freeDelivery: false },
      { id: "almaty-2", country: "KZ", name: { ru: "Алматы ", en: "Almaty 2" }, freeDelivery: false },
    ]);
    expect(upgradeCities(DEFAULT_CITIES)).toBeNull();
    // Cities with ids but stored before countries: Kazakhstan's.
    const before = DEFAULT_CITIES.map(({ country: _, ...rest }) => rest);
    expect(upgradeCities(before)).toEqual(DEFAULT_CITIES);
    expect(upgradeCities("broken")).toBeNull();
    expect(CitiesSchema.safeParse(upgradeCities(old.slice(0, 2))).success).toBe(true);
    expect(cityName(DEFAULT_CITIES[7], "kk")).toBe("Өскемен");
    expect(cityName({ ...DEFAULT_CITIES[7], name: { ru: "Усть-Каменогорск", en: "Oskemen" } }, "kk")).toBe("Усть-Каменогорск");
  });

  it("normalizes Kazakh phone numbers", () => {
    const order = CreateOrderSchema.parse({
      bookId: "b",
      recipientName: "Айгерим",
      phone: "+7 (701) 123-45-67",
      email: " parent@example.com ",
      cityId: "almaty",
      address: "ул. Абая, 1",
      cover: "soft",
      quantity: "1",
    });
    expect(order.phone).toBe("+77011234567");
    expect(order.email).toBe("parent@example.com");
    expect(CreateOrderSchema.shape.phone.safeParse("8701").success).toBe(false);
  });

  it("requires a real email and takes an optional email language", () => {
    expect(CreateOrderSchema.shape.email.safeParse("not-an-email").success).toBe(false);
    expect(CreateOrderSchema.shape.email.safeParse(`${"a".repeat(196)}@x.kz`).success).toBe(false);
    expect(CreateOrderSchema.shape.locale.safeParse("kk").success).toBe(true);
    expect(CreateOrderSchema.shape.locale.safeParse("fr").success).toBe(false);
  });

  it("walks the order through its stages", () => {
    expect(orderStatusAt(0, 1000)).toBe("paid");
    expect(orderStatusAt(2500, 1000)).toBe("shipped");
    expect(orderStatusAt(99_000, 1000)).toBe("delivered");
  });

  it("hides all but the last four digits of a phone", () => {
    expect(maskPhone("+77011234567")).toBe("+7 *** *** 45 67");
    expect(maskPhone("87011234567")).toBe("*** *** 45 67");
    expect(maskPhone("12")).toBe("***");
  });

  it("dates each stage reached by its latest time in the history", () => {
    const timeline = orderTimeline({
      status: "printing",
      createdAt: "2026-01-01T10:00:00.000Z",
      history: [
        { status: "paid", at: "2026-01-01T10:00:00.000Z", note: null },
        { status: "shipped", at: "2026-01-02T10:00:00.000Z", note: null },
        { status: "printing", at: "2026-01-03T10:00:00.000Z", note: null },
      ],
    });
    expect(timeline).toEqual([
      { status: "paid", at: "2026-01-01T10:00:00.000Z", reached: true },
      { status: "printing", at: "2026-01-03T10:00:00.000Z", reached: true },
      // A step back in the admin: shipped is no longer reached.
      { status: "shipped", at: null, reached: false },
      { status: "delivered", at: null, reached: false },
    ]);
    expect(orderTimeline({ status: "paid", createdAt: "2026-01-01T10:00:00.000Z", history: [] })[0].at).toBe(
      "2026-01-01T10:00:00.000Z",
    );
  });
});

describe("methodologies", () => {
  const child = { name: "Арман", age: 3, gender: "boy", interests: ["машинки"], city: "Астана" };
  const method = (slug: string, ageMin: number, ageMax: number) => ({ slug, ageMin, ageMax });

  it("covers every age from 2 to 10 with a default that fits", () => {
    for (let age = 2; age <= 10; age++) {
      const picked = defaultMethodology(DEFAULT_METHODOLOGIES, age);
      expect(picked && fitsAge(picked, age)).toBe(true);
      expect(ageBand(age).ageMin).toBeLessThanOrEqual(age);
    }
    expect(defaultMethodology(DEFAULT_METHODOLOGIES, 3)?.slug).toBe("toddler-routine");
    expect(defaultMethodology(DEFAULT_METHODOLOGIES, 7)?.slug).toBe("adventure-quest");
  });

  it("falls back to the first method that fits when the usual one is not offered", () => {
    const methods = [method("growth-mindset", 5, 10), method("social-story", 2, 8), method("sel-emotions", 4, 10)];
    expect(defaultMethodology(methods, 3)?.slug).toBe("social-story");
    expect(defaultMethodology(methods, 9)?.slug).toBe("growth-mindset");
    expect(defaultMethodology([method("adventure-quest", 4, 10)], 2)).toBeUndefined();
  });

  it("seeds unique slugs, at least three beats and text in every language", () => {
    expect(new Set(DEFAULT_METHODOLOGIES.map((m) => m.slug)).size).toBe(DEFAULT_METHODOLOGIES.length);
    for (const m of DEFAULT_METHODOLOGIES) {
      expect(m.structure.length).toBeGreaterThanOrEqual(3);
      expect(MethodologySlugSchema.safeParse(m.slug).success).toBe(true);
      expect(CreateMethodologySchema.safeParse({ ...m, published: true, sortOrder: 0 }).success).toBe(true);
    }
  });

  it("takes slugs of lowercase latin letters, digits and dashes", () => {
    for (const slug of ["calm-down", "abc-2", "x9"]) expect(MethodologySlugSchema.safeParse(slug).success).toBe(true);
    for (const slug of ["Calm", "сказка", "a_b", "-a", "a--b", "a", "a".repeat(41), "new"]) {
      expect(MethodologySlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  describe("the admin's input", () => {
    const texts = (name: string) => ({ name, summary: `${name}: summary` });
    const input = {
      texts: { ru: texts("Спокойствие"), kk: texts("Тыныштық"), en: texts("Calm") },
      source: "Mindfulness for children",
      ageMin: 5,
      ageMax: 7,
      structure: ["The hero is upset."],
      rules: [],
      avoid: [],
      published: true,
      sortOrder: 10,
    };
    const problems = (value: unknown) =>
      UpdateMethodologySchema.safeParse(value).error?.issues.map((i) => i.path.join(".")) ?? [];

    it("accepts a full method", () => {
      expect(problems(input)).toEqual([]);
      expect(CreateMethodologySchema.safeParse({ ...input, slug: "calm" }).success).toBe(true);
    });

    it("keeps ages in order and within 2–12", () => {
      expect(problems({ ...input, ageMin: 8, ageMax: 6 })).toEqual(["ageMax"]);
      expect(problems({ ...input, ageMin: 1 })).toEqual(["ageMin"]);
      expect(problems({ ...input, ageMax: 13 })).toEqual(["ageMax"]);
    });

    it("needs at least one beat, and no empty lines", () => {
      expect(problems({ ...input, structure: [] })).toEqual(["structure"]);
      expect(problems({ ...input, rules: ["  "] })).toEqual(["rules.0"]);
    });

    it("always needs the Russian name and summary", () => {
      const draft = { ...input, published: false, texts: { ...input.texts, ru: { name: "", summary: "" } } };
      expect(problems(draft)).toEqual(["texts.ru.name", "texts.ru.summary"]);
    });

    it("publishes with the base languages, Kazakh optional, while a draft may wait", () => {
      const untranslated = { ...input, texts: { ...input.texts, kk: texts(""), en: { name: "Calm", summary: "" } } };
      expect(problems({ ...untranslated, published: false })).toEqual([]);
      const result = UpdateMethodologySchema.safeParse(untranslated);
      expect(result.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
        ["published", expect.stringContaining("не хватает en")],
      ]);
      expect(problems({ ...input, texts: { ru: input.texts.ru, en: input.texts.en } })).toEqual([]);
      expect(problems({ ...input, texts: { ...input.texts, kk: texts("") } })).toEqual([]);
    });

    it("reads a text in the asked language, else Russian, else English", () => {
      const all = { ru: texts("Спокойствие"), kk: { name: "", summary: "" }, en: texts("Calm") };
      expect(methodologyText(all, "kk")).toEqual(texts("Спокойствие"));
      expect(methodologyText(all, "en")).toEqual(texts("Calm"));
      expect(methodologyText({ en: texts("Calm") }, "kk").name).toBe("Calm");
    });
  });

  it("leaves checking the method itself to the API", () => {
    const result = CreateBookSchema.parse({
      child,
      methodology: "social-story",
      theme: "первый день в детском саду",
    });
    expect(result.methodology).toBe("social-story");
    expect(CreateBookSchema.safeParse({ child, methodology: "Not A Slug" }).success).toBe(false);
  });
});

describe("countries", () => {
  const list = DEFAULT_COUNTRIES;

  it("maps the visitor's IP country onto ours", () => {
    expect(countryFromIp("KZ", list)).toBe("KZ");
    expect(countryFromIp("uz", list)).toBe("UZ");
    expect(countryFromIp("KG", list)).toBe("KG");
    expect(countryFromIp("DE", list)).toBe("DE");
    expect(countryFromIp("NL", list)).toBe("other");
    expect(countryFromIp("other", list)).toBe("other");
    expect(countryFromIp(null, list)).toBe("other");
    expect(countryFromIp("", list)).toBe("other");
  });

  it("follows the owner's list: an unlisted country is other, and so is no country", () => {
    const owners = [{ code: "UZ", languages: ["ru" as const], currency: "USD" as const, print: false }];
    expect(countryFromIp("KZ", owners)).toBe("other");
    expect(countryFromIp(null, owners)).toBe("other");
    expect(countryFromIp(null, [])).toBe("other");
    expect(countryInfo("KZ", owners)).toEqual({ languages: ["en", "es", "de", "ru"], currency: "USD", print: false, payment: "manual" });
  });

  it("never lists Russia or Belarus, and prints only in Kazakhstan", () => {
    const codes = list.map((c) => c.code);
    expect(codes).not.toContain("RU");
    expect(codes).not.toContain("BY");
    expect(list.filter((c) => c.print).map((c) => c.code)).toEqual(["KZ"]);
    expect(countryInfo("other", list).print).toBe(false);
    expect(CountriesSchema.safeParse(list).success).toBe(true);
  });

  it("offers Kazakh only in Kazakhstan and falls back to the country's first language", () => {
    expect(languageFor("KZ", "kk", list)).toBe("kk");
    expect(languageFor("UZ", "kk", list)).toBe("ru");
    expect(languageFor("KG", "en", list)).toBe("en");
    expect(languageFor("DE", "kk", list)).toBe("de");
    expect(languageFor("DE", "ru", list)).toBe("de");
    expect(languageFor("AT", "en", list)).toBe("en");
    expect(languageFor("ES", "de", list)).toBe("es");
    expect(languageFor("MX", "es", list)).toBe("es");
    expect(languageFor("US", "es", list)).toBe("en");
    expect(languageFor("other", "es", list)).toBe("es");
    expect(languageFor("other", "de", list)).toBe("de");
    // Russian only where many families read it: never in Poland, English first in Georgia.
    expect(languageFor("PL", "ru", list)).toBe("en");
    expect(languageFor("GE", "kk", list)).toBe("en");
    expect(languageFor("GE", "ru", list)).toBe("ru");
    expect(languageFor("UZ", "en", list)).toBe("en");
    expect(languageFor("other", "kk", list)).toBe("en");
    expect(languageFor("other", "ru", list)).toBe("ru");
    expect(list.filter((c) => c.languages.includes("kk")).map((c) => c.code)).toEqual(["KZ"]);
  });

  it("checks the owner's list", () => {
    const kz = list[0];
    expect(CountriesSchema.parse([{ ...kz, code: " kz " }])[0].code).toBe("KZ");
    expect(CountriesSchema.safeParse([]).success).toBe(false);
    expect(CountriesSchema.safeParse([kz, kz]).success).toBe(false);
    expect(CountriesSchema.safeParse([{ ...kz, code: "XX" }]).success).toBe(false);
    expect(CountriesSchema.safeParse([{ ...kz, languages: [] }]).success).toBe(false);
    expect(CountriesSchema.safeParse([{ ...kz, languages: ["ru", "ru"] }]).success).toBe(false);
    expect(CountriesSchema.safeParse([{ ...kz, languages: ["fr"] }]).success).toBe(false);
    expect(CountriesSchema.safeParse([{ ...kz, currency: "GBP" }]).success).toBe(false);
  });

  it("prints in any currency, and takes a payment provider", () => {
    const kz = list[0];
    expect(CountriesSchema.safeParse([{ ...kz, currency: "USD" }]).success).toBe(true);
    expect(CountriesSchema.safeParse([{ ...kz, currency: "EUR", print: true, payment: "stripe" }]).success).toBe(true);
    expect(CountriesSchema.safeParse([{ ...kz, payment: "paypal" }]).success).toBe(false);
    expect(paymentProviderOf(kz)).toBe("manual");
    expect(paymentProviderOf({ payment: "kaspi" })).toBe("kaspi");
  });
});

describe("localized texts", () => {
  it("falls back from the asked language to Russian, then English", () => {
    expect(localized({ ru: "Привет", kk: "Сәлем", en: "Hi" }, "kk")).toBe("Сәлем");
    expect(localized({ ru: "Привет", en: "Hi" }, "kk")).toBe("Привет");
    expect(localized({ en: "Hi" }, "kk")).toBe("Hi");
    expect(localized({ ru: "Привет", en: "Hi" }, "es")).toBe("Hi");
    expect(localized({ ru: "Привет", en: "Hi", de: "Hallo" }, "de")).toBe("Hallo");
  });

  it("picks the language to show from the available ones in the same order", () => {
    expect(pickLanguage(["ru", "en", "kk"], "kk")).toBe("kk");
    expect(pickLanguage(["ru", "en"], "kk")).toBe("ru");
    expect(pickLanguage(["ru", "en"], "es")).toBe("en");
    expect(pickLanguage(["ru"], "de")).toBe("ru");
    expect(pickLanguage(["en"], "ru")).toBe("en");
    expect(pickLanguage(["kk"], "en")).toBe("kk");
    expect(pickLanguage([], "en")).toBeNull();
  });

  it("requires the base languages and drops empty optional ones", () => {
    const schema = localizedTextSchema(20);
    expect(schema.parse({ ru: " а ", en: "b", kk: "  " })).toEqual({ ru: "а", en: "b" });
    expect(schema.safeParse({ ru: "а", kk: "ә" }).success).toBe(false);
    expect(schema.safeParse({ ru: "а", en: "b", fr: "c" }).success).toBe(false);
    expect(schema.safeParse({ ru: "а".repeat(21), en: "b" }).success).toBe(false);
  });
});

describe("FAQ", () => {
  const ids = (country: string, countries = DEFAULT_COUNTRIES) => faqFor(DEFAULT_FAQ, country, countries).map((item) => item.id);

  it("seeds valid entries, with print and prices told apart for Kazakhstan", () => {
    expect(FaqSchema.safeParse(DEFAULT_FAQ).success).toBe(true);
    expect(ids("KZ")).toEqual(["time", "kazakh", "price-kz", "data", "print-kz", "account", "dislike"]);
    expect(ids("UZ")).toEqual(["time", "languages", "price-abroad", "data", "print-abroad", "account", "dislike"]);
    expect(ids("other")).toEqual(ids("UZ"));
  });

  it("tells print apart by the country's print flag, so opening print flips the answer", () => {
    const printInUz = DEFAULT_COUNTRIES.map((c) => (c.code === "UZ" ? { ...c, currency: "KZT" as const, print: true } : c));
    expect(ids("UZ", printInUz)).toContain("print-kz");
    expect(ids("UZ", printInUz)).not.toContain("print-abroad");
    const noPrintInKz = DEFAULT_COUNTRIES.map((c) => (c.code === "KZ" ? { ...c, print: false } : c));
    expect(ids("KZ", noPrintInKz)).toContain("print-abroad");
    expect(ids("KZ", noPrintInKz)).not.toContain("print-kz");
  });

  it("shows only published entries, for the countries picked", () => {
    const base = DEFAULT_FAQ[0];
    const items = [
      { ...base, id: "a", countries: ["other"] },
      { ...base, id: "b", published: false },
      { ...base, id: "c", countries: ["UZ", "KG"] },
    ];
    expect(faqFor(items, "other", DEFAULT_COUNTRIES).map((i) => i.id)).toEqual(["a"]);
    expect(faqFor(items, "KG", DEFAULT_COUNTRIES).map((i) => i.id)).toEqual(["c"]);
  });

  it("checks ids, countries and the leave-out list", () => {
    const base = DEFAULT_FAQ[0];
    expect(FaqSchema.safeParse([base, base]).success).toBe(false);
    expect(FaqSchema.safeParse([{ ...base, countries: ["XX"] }]).success).toBe(false);
    expect(FaqSchema.safeParse([{ ...base, countries: [], excludeCountries: true }]).success).toBe(false);
    expect(FaqSchema.safeParse([{ ...base, id: "Bad Id" }]).success).toBe(false);
    expect(FaqSchema.safeParse([{ ...base, print: "maybe" }]).success).toBe(false);
    expect(FaqSchema.parse([{ ...base, print: "with" }])[0].print).toBe("with");
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(fillFaq("от {templatePrice}, {nope}", { templatePrice: "$3.90" })).toBe("от $3.90, {nope}");
  });
});

describe("book prices", () => {
  const data = { prices: DEFAULT_PRICES, countries: DEFAULT_COUNTRIES };
  it("charges less for a catalog book than for a story of your own", () => {
    expect(bookPrice("template", "KZ", data)).toEqual({ amount: 1_900_00, currency: "KZT" });
    expect(bookPrice("custom", "KZ", data)).toEqual({ amount: 2_900_00, currency: "KZT" });
    expect(bookPrice("template", "UZ", data)).toEqual({ amount: 3_90, currency: "USD" });
    expect(bookPrice("custom", "other", data)).toEqual({ amount: 5_90, currency: "USD" });
  });

  it("uses the prices it is given", () => {
    const prices = { ...DEFAULT_PRICES, KZT: { ...DEFAULT_PRICES.KZT!, books: { template: 2_500_00, custom: 2_900_00 } }, USD: { books: { template: 4_50, custom: 5_90 }, delivery: 0 } };
    expect(bookPrice("template", "KZ", { ...data, prices })).toEqual({ amount: 2_500_00, currency: "KZT" });
    expect(bookPrice("template", "KG", { ...data, prices })).toEqual({ amount: 4_50, currency: "USD" });
  });

  it("takes only a known kind of book to buy", () => {
    expect(PurchaseSchema.parse({ kind: "custom" })).toEqual({ kind: "custom" });
    expect(PurchaseSchema.safeParse({}).success).toBe(false);
    expect(PurchaseSchema.safeParse({ kind: "print" }).success).toBe(false);
  });
});

describe("ClientErrorReportSchema", () => {
  it("takes a short report, refuses long texts and unknown kinds", () => {
    const report = { kind: "api", message: "Internal server error", path: "/create", status: 500, code: "x" };
    expect(ClientErrorReportSchema.parse(report)).toEqual(report);
    expect(ClientErrorReportSchema.safeParse({ ...report, kind: "form" }).success).toBe(false);
    expect(ClientErrorReportSchema.safeParse({ ...report, message: "m".repeat(501) }).success).toBe(false);
    expect(ClientErrorReportSchema.safeParse({ ...report, path: "/" + "p".repeat(200) }).success).toBe(false);
    expect(ClientErrorReportSchema.safeParse({ ...report, message: "  " }).success).toBe(false);
  });

  it("drops fields it does not know, such as form values", () => {
    const parsed = ClientErrorReportSchema.parse({ kind: "js", message: "boom", path: "/", childName: "Алия" });
    expect(parsed).not.toHaveProperty("childName");
  });
});

describe("JournalCallsQuerySchema", () => {
  it("defaults the period to a day and checks the filters", () => {
    expect(JournalCallsQuerySchema.parse({})).toEqual({ period: "24h" });
    expect(JournalCallsQuerySchema.parse({ kind: "story", status: "error", period: "7d" })).toMatchObject({ kind: "story" });
    expect(JournalCallsQuerySchema.safeParse({ kind: "poem" }).success).toBe(false);
  });
});

describe("reference data", () => {
  it("accepts the defaults it seeds", () => {
    expect(DefaultPricesSchema.parse(DEFAULT_PRICES)).toEqual(DEFAULT_PRICES);
    expect(CitiesSchema.parse(DEFAULT_CITIES)).toEqual(DEFAULT_CITIES);
  });

  it("refuses prices that are not whole tenge, cents, or positive", () => {
    const kzt = DEFAULT_PRICES.KZT!;
    const usd = DEFAULT_PRICES.USD!;
    expect(DefaultPricesSchema.safeParse({ KZT: { ...kzt, books: { ...kzt.books, template: 1_900_50 } } }).success).toBe(false);
    expect(DefaultPricesSchema.safeParse({ USD: { ...usd, books: { ...usd.books, custom: 5.999 } } }).success).toBe(false);
    expect(DefaultPricesSchema.safeParse({ USD: { ...usd, books: { ...usd.books, custom: 0 } } }).success).toBe(false);
    expect(DefaultPricesSchema.safeParse({ KZT: { ...kzt, delivery: -100 } }).success).toBe(false);
    expect(DefaultPricesSchema.safeParse({ KZT: { ...kzt, delivery: 0 } }).success).toBe(true);
    expect(DefaultPricesSchema.safeParse({ GBP: usd }).success).toBe(false);
    expect(BookPricesSchema.safeParse({ currency: "EUR", books: { template: 4_99, custom: 6_99 } }).success).toBe(true);
    expect(BookPricesSchema.safeParse({ currency: "KZT", books: { template: 4_99, custom: 6_99 } }).success).toBe(false);
    expect(CountryDeliverySchema.safeParse({ currency: "KZT", fee: 1_500_00, freeEverywhere: false, cost: { amount: 3_50, currency: "EUR" } }).success).toBe(true);
    expect(CountryDeliverySchema.safeParse({ currency: "KZT", fee: 1_500_50, freeEverywhere: false }).success).toBe(false);
  });

  it("refuses an empty city list, a name without English, bad ids and the same city twice", () => {
    expect(CitiesSchema.safeParse([]).success).toBe(false);
    expect(CitiesSchema.safeParse(DEFAULT_CITIES).success).toBe(true);
    expect(CitiesSchema.safeParse([{ id: "a", name: { ru: "А", kk: "А" }, freeDelivery: false }]).success).toBe(false);
    expect(CitiesSchema.safeParse([{ id: "Almaty City", name: { ru: "А", en: "A" }, freeDelivery: false }]).success).toBe(false);
    const sameId = CitiesSchema.safeParse([...DEFAULT_CITIES, { ...DEFAULT_CITIES[0], name: { ru: "Алма", en: "Alma" } }]);
    expect(sameId.error?.issues[0].path).toEqual([DEFAULT_CITIES.length, "id"]);
    const sameName = CitiesSchema.safeParse([...DEFAULT_CITIES, { ...DEFAULT_CITIES[0], id: "almaty-2", name: { ru: " алматы ", en: "A" } }]);
    expect(sameName.error?.issues[0].path).toEqual([DEFAULT_CITIES.length, "name", "ru"]);
  });

  it("takes real ISO country codes only, upper-cased, once each", () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(250);
    expect(UpdateBlockedSchema.parse({ extra: [" nl", "DE"] })).toEqual({ extra: ["NL", "DE"] });
    expect(UpdateBlockedSchema.safeParse({ extra: ["XX"] }).success).toBe(false);
    expect(UpdateBlockedSchema.safeParse({ extra: ["NLD"] }).success).toBe(false);
    expect(UpdateBlockedSchema.safeParse({ extra: ["NL", "nl"] }).success).toBe(false);
  });
});

describe("template countries", () => {
  it("takes distinct ISO codes, upper-cased, or none for everywhere", () => {
    expect(UpdateTemplateSchema.parse({ countries: [" kz", "DE"] })).toEqual({ countries: ["KZ", "DE"] });
    expect(UpdateTemplateSchema.parse({ countries: [] })).toEqual({ countries: [] });
    expect(UpdateTemplateSchema.safeParse({ countries: ["XX"] }).success).toBe(false);
    expect(UpdateTemplateSchema.safeParse({ countries: ["other"] }).success).toBe(false);
    expect(UpdateTemplateSchema.safeParse({ countries: ["KAZ"] }).success).toBe(false);
    expect(UpdateTemplateSchema.safeParse({ countries: ["KZ", "kz"] }).success).toBe(false);
    expect(UpdateTemplateSchema.safeParse({ countries: "KZ" }).success).toBe(false);
  });

  it("reads the visitor's country for the catalog: a code, else null", () => {
    expect(catalogCountry("KZ")).toBe("KZ");
    expect(catalogCountry(" de ")).toBe("DE");
    expect(catalogCountry("other")).toBeNull();
    expect(catalogCountry(undefined)).toBeNull();
    expect(catalogCountry("")).toBeNull();
    expect(catalogCountry("XX")).toBeNull();
  });
});

describe("example countries", () => {
  const inc = (countries: string[]) => ({ mode: "include" as const, countries });
  it("takes the book's own countries first, then its catalog book's, else none", () => {
    expect(showcaseRule(inc(["KZ"]), inc(["DE"]))).toEqual(inc(["KZ"]));
    expect(showcaseRule(inc([]), inc(["DE"]))).toEqual(inc(["DE"]));
    expect(showcaseRule(inc([]), inc([]))).toEqual(inc([]));
    expect(showcaseRule(inc([]), null)).toEqual(inc([]));
  });

  it("shows a story of its own limited to Kazakhstan there only", () => {
    expect(exampleShownIn(inc(["KZ"]), null, "KZ")).toBe(true);
    expect(exampleShownIn(inc(["KZ"]), null, "DE")).toBe(false);
    // "other", none and unknown codes reach here as null.
    expect(exampleShownIn(inc(["KZ"]), null, catalogCountry("other"))).toBe(false);
    expect(exampleShownIn(inc(["KZ"]), null, catalogCountry(undefined))).toBe(false);
    expect(exampleShownIn(inc(["KZ"]), null, catalogCountry("XX"))).toBe(false);
  });

  it("follows the catalog book when the book has no countries of its own", () => {
    expect(exampleShownIn(inc([]), inc(["KZ"]), "KZ")).toBe(true);
    expect(exampleShownIn(inc([]), inc(["KZ"]), "DE")).toBe(false);
    expect(exampleShownIn(inc([]), inc(["KZ"]), null)).toBe(false);
  });

  it("lets the book's own countries override its catalog book's", () => {
    expect(exampleShownIn(inc(["DE"]), inc(["KZ"]), "DE")).toBe(true);
    expect(exampleShownIn(inc(["DE"]), inc(["KZ"]), "KZ")).toBe(false);
    expect(exampleShownIn(inc(["DE", "KZ"]), inc([]), "KZ")).toBe(true);
    expect(exampleShownIn(inc(["DE"]), inc([]), null)).toBe(false);
  });

  it("shows a book limited nowhere to everyone, \"other\" included", () => {
    expect(exampleShownIn(inc([]), null, "DE")).toBe(true);
    expect(exampleShownIn(inc([]), null, null)).toBe(true);
    expect(exampleShownIn(inc([]), inc([]), null)).toBe(true);
  });

});

describe("examples", () => {
  it("tells a version's state from its book's status", () => {
    expect(exampleVersionState("done")).toBe("done");
    expect(exampleVersionState("failed")).toBe("failed");
    expect(exampleVersionState("story")).toBe("translating");
    expect(exampleVersionState("queued")).toBe("translating");
  });

  it("validates countries, the order and the languages to translate into", () => {
    expect(UpdateExampleSchema.parse({ countries: [" kz"] })).toEqual({ countries: ["KZ"], mode: "include" });
    expect(UpdateExampleSchema.safeParse({ countries: ["other"] }).success).toBe(false);
    expect(UpdateExampleSchema.safeParse({}).success).toBe(false);
    expect(TranslateExampleSchema.parse({ languages: ["en", "de"] })).toEqual({ languages: ["en", "de"] });
    expect(TranslateExampleSchema.safeParse({ languages: [] }).success).toBe(false);
    expect(TranslateExampleSchema.safeParse({ languages: ["fr"] }).success).toBe(false);
    expect(TranslateExampleSchema.safeParse({ languages: ["en", "en"] }).success).toBe(false);
    expect(ReorderExamplesSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(isExampleError("example_language_taken")).toBe(true);
    expect(isExampleError("admin_forbidden")).toBe(false);
  });

  it("shows the admin's language version, else the first finished one", () => {
    const versions = [
      { language: "en" as const, state: "translating" as const },
      { language: "kk" as const, state: "done" as const },
      { language: "ru" as const, state: "done" as const },
    ];
    expect(displayVersion(versions, "ru")?.language).toBe("ru");
    expect(displayVersion(versions, "en")?.language).toBe("kk");
    expect(displayVersion([{ language: "de" as const, state: "failed" as const }], "en")?.language).toBe("de");
    expect(displayVersion([], "en")).toBeNull();
  });

  it("spells a name in the script of the book's language", () => {
    expect(transliterate("Тимур", "en")).toBe("Timur");
    expect(transliterate("Amina", "ru")).toBe("Амина");
    expect(transliterate("Amina", "kk")).toBe("Амина");
    expect(transliterate("Амина", "de")).toBe("Amina");
    expect(transliterate("Жансая", "es")).toBe("Zhansaya");
    expect(transliterate("Айгерим", "en")).toBe("Aygerim");
    // Already in that script: as it is.
    expect(transliterate("Amina", "es")).toBe("Amina");
    expect(transliterate("Тимур", "kk")).toBe("Тимур");
  });
});

describe("template samples", () => {
  it("sets or clears a sample per language and refuses other keys", () => {
    expect(UpdateTemplateSchema.parse({ samples: { en: "abc", kk: null } })).toEqual({ samples: { en: "abc", kk: null } });
    expect(UpdateTemplateSchema.safeParse({ samples: { fr: "abc" } }).success).toBe(false);
    expect(UpdateTemplateSchema.safeParse({ samples: { en: "" } }).success).toBe(false);
  });
});
