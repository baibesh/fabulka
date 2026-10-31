import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  COUNTRY_INFO,
  ChildProfileSchema,
  ClientErrorReportSchema,
  CreateBookSchema,
  JournalCallsQuerySchema,
  METHODOLOGIES,
  ageBand,
  defaultMethodology,
  fitsAge,
  CreateOrderSchema,
  PurchaseSchema,
  StorySchema,
  bookPrice,
  countryFromIp,
  languageFor,
  orderPrice,
  orderStatusAt,
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
  it("prices delivery by city", () => {
    expect(orderPrice("hard", 2, "Алматы")).toEqual({ books: 29800, delivery: 0, total: 29800 });
    expect(orderPrice("soft", 1, "Шымкент")).toEqual({ books: 9900, delivery: 1500, total: 11400 });
  });

  it("normalizes Kazakh phone numbers", () => {
    const order = CreateOrderSchema.parse({
      bookId: "b",
      recipientName: "Айгерим",
      phone: "+7 (701) 123-45-67",
      email: " parent@example.com ",
      city: "Алматы",
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
    expect(CreateOrderSchema.shape.locale.safeParse("de").success).toBe(false);
  });

  it("walks the order through its stages", () => {
    expect(orderStatusAt(0, 1000)).toBe("paid");
    expect(orderStatusAt(2500, 1000)).toBe("shipped");
    expect(orderStatusAt(99_000, 1000)).toBe("delivered");
  });
});

describe("methodologies", () => {
  const child = { name: "Арман", age: 3, gender: "boy", interests: ["машинки"], city: "Астана" };

  it("covers every age from 2 to 10 with a default that fits", () => {
    for (let age = 2; age <= 10; age++) {
      expect(fitsAge(defaultMethodology(age), age)).toBe(true);
      expect(ageBand(age).ageMin).toBeLessThanOrEqual(age);
    }
  });

  it("has unique slugs and at least three beats each", () => {
    expect(new Set(METHODOLOGIES.map((m) => m.slug)).size).toBe(METHODOLOGIES.length);
    for (const m of METHODOLOGIES) expect(m.structure.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a method meant for older children", () => {
    const result = CreateBookSchema.safeParse({ child, methodology: "growth-mindset" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["methodology"]);
  });

  it("accepts a fitting method with a theme", () => {
    const result = CreateBookSchema.parse({
      child,
      methodology: "social-story",
      theme: "первый день в детском саду",
    });
    expect(result.methodology).toBe("social-story");
  });
});

describe("countries", () => {
  it("maps the visitor's IP country onto ours", () => {
    expect(countryFromIp("KZ")).toBe("KZ");
    expect(countryFromIp("uz")).toBe("UZ");
    expect(countryFromIp("KG")).toBe("KG");
    expect(countryFromIp("DE")).toBe("other");
    expect(countryFromIp("other")).toBe("other");
    expect(countryFromIp(null)).toBe("KZ");
  });

  it("never lists Russia or Belarus, and prints only in Kazakhstan", () => {
    expect(COUNTRIES).not.toContain("RU");
    expect(COUNTRIES).not.toContain("BY");
    expect(COUNTRIES.filter((c) => COUNTRY_INFO[c].print)).toEqual(["KZ"]);
  });

  it("offers Kazakh only in Kazakhstan and falls back to the country's first language", () => {
    expect(languageFor("KZ", "kk")).toBe("kk");
    expect(languageFor("UZ", "kk")).toBe("ru");
    expect(languageFor("KG", "en")).toBe("en");
    expect(languageFor("other", "kk")).toBe("en");
    expect(languageFor("other", "ru")).toBe("ru");
  });
});

describe("book prices", () => {
  it("charges less for a catalog book than for a story of your own", () => {
    expect(bookPrice("template", "KZ")).toEqual({ amount: 1900, currency: "KZT" });
    expect(bookPrice("custom", "KZ")).toEqual({ amount: 2900, currency: "KZT" });
    expect(bookPrice("template", "UZ")).toEqual({ amount: 3.9, currency: "USD" });
    expect(bookPrice("custom", "other")).toEqual({ amount: 5.9, currency: "USD" });
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
