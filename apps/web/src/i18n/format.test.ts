import { describe, expect, it } from "vitest";
import { format, pluralCategory } from "./format";
import { MESSAGES } from "./messages";

const METHODS = "{count, plural, one {# методика} few {# методики} many {# методик} other {# методики}}";

describe("pluralCategory", () => {
  it("knows the Russian one / few / many", () => {
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25, 101].map((n) => pluralCategory("ru", n))).toEqual([
      "one",
      "few",
      "few",
      "many",
      "many",
      "many",
      "one",
      "few",
      "many",
      "one",
    ]);
  });

  it("has only one / other in Kazakh, English, Spanish and German for everyday numbers", () => {
    for (const locale of ["kk", "en", "es", "de"] as const) {
      expect([1, 2, 5].map((n) => pluralCategory(locale, n))).toEqual(["one", "other", "other"]);
    }
  });
});

describe("format", () => {
  it("fills plain variables and leaves unknown ones", () => {
    expect(format("Шаг {n} из {total}", { n: 2, total: 5 }, "ru")).toBe("Шаг 2 из 5");
    expect(format("Привет, {name}", {}, "ru")).toBe("Привет, {name}");
    expect(format("Без переменных", undefined, "ru")).toBe("Без переменных");
  });

  it("picks the Russian form for 1, 2–4 and 5+", () => {
    expect(format(METHODS, { count: 1 }, "ru")).toBe("1 методика");
    expect(format(METHODS, { count: 3 }, "ru")).toBe("3 методики");
    expect(format(METHODS, { count: 5 }, "ru")).toBe("5 методик");
    expect(format(METHODS, { count: 11 }, "ru")).toBe("11 методик");
    expect(format(METHODS, { count: 21 }, "ru")).toBe("21 методика");
  });

  it("uses one / other in English and falls back to other", () => {
    const text = "{count, plural, one {# book} other {# books}} left";
    expect(format(text, { count: 1 }, "en")).toBe("1 book left");
    expect(format(text, { count: 7 }, "en")).toBe("7 books left");
    expect(format("{count, plural, other {# кітап}}", { count: 1 }, "kk")).toBe("1 кітап");
  });

  it("keeps variables inside a form and text around it", () => {
    const years = "{min}–{max, plural, one {# год} few {# года} many {# лет} other {# года}}";
    expect(format(years, { min: 2, max: 4 }, "ru")).toBe("2–4 года");
    expect(format(years, { min: 3, max: 7 }, "ru")).toBe("3–7 лет");
    expect(format("{n, plural, one {{name}: # раз} other {{name}: # раза}}", { n: 1, name: "Алия" }, "ru")).toBe("Алия: 1 раз");
  });

  it("leaves a plural whose number is missing", () => {
    expect(format(METHODS, { other: 1 }, "ru")).toBe(METHODS);
  });
});

describe("messages", () => {
  it("read right for 1, 2 and 5 methods in every language", () => {
    const say = (locale: "ru" | "kk" | "en" | "es" | "de", count: number) => format(MESSAGES[locale]["landing.trust.methods"], { count }, locale);
    expect([1, 2, 5].map((n) => say("ru", n))).toEqual([
      "1 методика детского развития",
      "2 методики детского развития",
      "5 методик детского развития",
    ]);
    expect([1, 5].map((n) => say("en", n))).toEqual(["1 child-development method", "5 child-development methods"]);
    expect(say("kk", 5)).toBe("Бала дамуының 5 әдістемесі");
    for (const locale of ["es", "de"] as const) {
      expect(say(locale, 1)).not.toBe(say(locale, 5).replace("5", "1"));
    }
  });

  it("exist in every language and give an `other` form wherever they pluralise", () => {
    const plurals = (text: string) => [...text.matchAll(/\{(\w+), plural,/g)].map((m) => m[1]).sort();
    for (const [key, ru] of Object.entries(MESSAGES.ru)) {
      for (const locale of ["kk", "en", "es", "de"] as const) {
        expect(MESSAGES[locale][key as keyof typeof MESSAGES.ru], `${locale} ${key}`).toBeDefined();
        // Every language that pluralises a number gives at least an `other` form.
        for (const text of [ru, MESSAGES[locale][key as keyof typeof MESSAGES.ru]]) {
          if (plurals(text).length) expect(text, key).toMatch(/other\s*\{/);
        }
      }
    }
  });
});
