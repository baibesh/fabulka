import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  CURRENCY_REGISTRY,
  MoneySchema,
  RateSchema,
  addMoney,
  convertMoney,
  divideRates,
  formatMoney,
  isPriceAmount,
  money,
  multiplyMoney,
  parseMoneyInput,
  priceStep,
  revenueOf,
  sumMoney,
  toDecimalString,
  toInputString,
  toUsd,
} from "./money";

const kzt = (amount: number) => money(amount, "KZT");
const usd = (amount: number) => money(amount, "USD");
const eur = (amount: number) => money(amount, "EUR");

describe("currency registry", () => {
  it("keeps ISO 4217 exponents, tenge included, and shows whole tenge", () => {
    expect(CURRENCIES).toEqual(["KZT", "USD", "EUR", "CAD", "AUD", "MYR", "CHF"]);
    // ISO 4217: KZT has two minor digits (tiyn) even though prices are whole tenge.
    expect(CURRENCY_REGISTRY.KZT).toEqual({ exponent: 2, symbol: "₸", decimals: 0, display: "narrowSymbol" });
    for (const currency of ["CAD", "AUD", "MYR", "CHF"] as const) {
      expect(CURRENCY_REGISTRY[currency]).toMatchObject({ exponent: 2, decimals: 2 });
      expect(priceStep(currency)).toBe(1);
    }
    expect(CURRENCY_REGISTRY.USD.exponent).toBe(2);
    expect(CURRENCY_REGISTRY.EUR.exponent).toBe(2);
    expect(priceStep("KZT")).toBe(100);
    expect(priceStep("USD")).toBe(1);
  });

  it("takes only whole minor units of a known currency", () => {
    expect(MoneySchema.safeParse({ amount: 190000, currency: "KZT" }).success).toBe(true);
    expect(MoneySchema.safeParse({ amount: 3.9, currency: "USD" }).success).toBe(false);
    expect(MoneySchema.safeParse({ amount: 100, currency: "GBP" }).success).toBe(false);
    expect(() => money(1.5, "EUR")).toThrow();
    expect(isPriceAmount(1_900_00, "KZT")).toBe(true);
    expect(isPriceAmount(1_900_50, "KZT")).toBe(false);
    expect(isPriceAmount(3_95, "USD")).toBe(true);
    expect(isPriceAmount(-1, "USD")).toBe(false);
  });
});

describe("money math", () => {
  it("adds, multiplies and sums in one currency only", () => {
    expect(addMoney(kzt(9_900_00), kzt(1_500_00))).toEqual(kzt(11_400_00));
    expect(multiplyMoney(eur(18_90), 3)).toEqual(eur(56_70));
    expect(sumMoney([usd(3_90), usd(5_90), usd(1)], "USD")).toEqual(usd(9_81));
    expect(sumMoney([], "EUR")).toEqual(eur(0));
    expect(() => addMoney(kzt(100), usd(100))).toThrow();
    expect(() => multiplyMoney(usd(100), 1.5)).toThrow();
  });

  it("writes exact decimals with no floats: 0.1 + 0.2 stays 0.30", () => {
    expect(toDecimalString(addMoney(usd(10), usd(20)))).toBe("0.30");
    expect(toDecimalString(kzt(1_900_00))).toBe("1900.00");
    expect(toDecimalString(usd(5))).toBe("0.05");
    expect(toDecimalString(eur(-1_25))).toBe("-1.25");
    expect(toInputString(kzt(1_900_00))).toBe("1900");
    expect(toInputString(usd(3_90))).toBe("3.90");
    // A computed amount finer than whole tenge rounds half away from zero.
    expect(toInputString(kzt(1_900_50))).toBe("1901");
  });
});

describe("admin input", () => {
  it("reads tenge as whole tenge, with spaces or separators grouping thousands", () => {
    expect(parseMoneyInput("1900", "KZT")).toEqual(kzt(1_900_00));
    expect(parseMoneyInput(" 14 900 ", "KZT")).toEqual(kzt(14_900_00));
    expect(parseMoneyInput("14 900", "KZT")).toEqual(kzt(14_900_00));
    expect(parseMoneyInput("1,900", "KZT")).toEqual(kzt(1_900_00));
    expect(parseMoneyInput("1.900", "KZT")).toEqual(kzt(1_900_00));
    expect(parseMoneyInput("0", "KZT")).toEqual(kzt(0));
    // No tiyn: tenge prices are whole.
    expect(parseMoneyInput("1900,5", "KZT")).toBeNull();
    expect(parseMoneyInput("1900.50", "KZT")).toBeNull();
  });

  it("reads dollars and euros with a comma or a point, up to cents", () => {
    expect(parseMoneyInput("3.9", "USD")).toEqual(usd(3_90));
    expect(parseMoneyInput("3,90", "EUR")).toEqual(eur(3_90));
    expect(parseMoneyInput("19", "EUR")).toEqual(eur(19_00));
    expect(parseMoneyInput("1.234,50", "EUR")).toEqual(eur(1_234_50));
    expect(parseMoneyInput("1,234.50", "USD")).toEqual(usd(1_234_50));
    expect(parseMoneyInput("1.234.567", "USD")).toEqual(usd(1_234_567_00));
    expect(parseMoneyInput("0.07", "USD")).toEqual(usd(7));
    // Three digits after a single separator: thousands or a typo for cents? Refused, never guessed.
    expect(parseMoneyInput("4.999", "USD")).toBeNull();
    expect(parseMoneyInput("1,234", "USD")).toBeNull();
    expect(parseMoneyInput("3.999", "EUR")).toBeNull();
  });

  it("refuses what is not a price", () => {
    for (const text of ["", "  ", "abc", "-5", "3.9999", "3,99.5", "1,2,3", "12,34,567", "3.", ".5", "1.234.5,6", "1e3", "$5"]) {
      expect(parseMoneyInput(text, "USD")).toBeNull();
    }
    expect(parseMoneyInput("99999999999999", "USD")).toBeNull();
  });
});

describe("formatting by language", () => {
  it("formats each currency in each interface language with Intl", () => {
    expect(formatMoney(kzt(1_900_00), "ru-RU")).toBe("1 900 ₸");
    expect(formatMoney(kzt(1_900_00), "kk-KZ")).toBe("1 900 ₸");
    expect(formatMoney(kzt(1_900_00), "en-US")).toBe("₸1,900");
    expect(formatMoney(usd(3_90), "en-US")).toBe("$3.90");
    expect(formatMoney(usd(3_90), "ru-RU")).toBe("3,90 $");
    expect(formatMoney(eur(18_90), "de-DE")).toBe("18,90 €");
    expect(formatMoney(eur(1_234_50), "de-DE")).toBe("1.234,50 €");
    expect(formatMoney(eur(18_90), "es-ES")).toBe("18,90 €");
    expect(formatMoney(eur(18_90), "en-US")).toBe("€18.90");
  });

  it("formats the Canadian and Australian dollar, ringgit and franc in every interface language", () => {
    // Intl's spaces (no-break, narrow no-break) as plain ones, for readable expectations.
    const shown = (amount: number, currency: "CAD" | "AUD" | "MYR" | "CHF", locale: string) =>
      formatMoney(money(amount, currency), locale).replace(/[\u00a0\u202f]/g, " ");
    const expected: Record<string, Record<"CAD" | "AUD" | "MYR" | "CHF", string>> = {
      // English pages are en-US: a bare "$" would read as US dollars, so CA$ and A$.
      "en-US": { CAD: "CA$6.90", AUD: "A$7.90", MYR: "RM 19.90", CHF: "CHF 4.90" },
      "ru-RU": { CAD: "6,90 CA$", AUD: "7,90 A$", MYR: "19,90 RM", CHF: "4,90 CHF" },
      // Kazakh is written as Russian-in-Kazakhstan (moneyLocale).
      "kk-KZ": { CAD: "6,90 CA$", AUD: "7,90 A$", MYR: "19,90 RM", CHF: "4,90 CHF" },
      "es-ES": { CAD: "6,90 CAD", AUD: "7,90 AUD", MYR: "19,90 RM", CHF: "4,90 CHF" },
      "de-DE": { CAD: "6,90 CA$", AUD: "7,90 AU$", MYR: "19,90 RM", CHF: "4,90 CHF" },
    };
    const amounts = { CAD: 6_90, AUD: 7_90, MYR: 19_90, CHF: 4_90 } as const;
    for (const [locale, row] of Object.entries(expected)) {
      for (const currency of ["CAD", "AUD", "MYR", "CHF"] as const) {
        expect(shown(amounts[currency], currency, locale), `${currency} in ${locale}`).toBe(row[currency]);
      }
    }
    expect(shown(1_234_50, "CHF", "de-DE")).toBe("1.234,50 CHF");
    expect(shown(24_90, "MYR", "en-US")).toBe("RM 24.90");
  });

  it("shows tenge whole, rounding a finer amount half away from zero", () => {
    expect(formatMoney(kzt(12_345_50), "en-US")).toBe("₸12,346");
    expect(formatMoney(kzt(12_345_49), "en-US")).toBe("₸12,345");
    expect(formatMoney(usd(1_234_567_88), "en-US")).toBe("$1,234,567.88");
  });
});

describe("exchange rates", () => {
  it("checks rates as positive decimals", () => {
    expect(RateSchema.safeParse("0.00196").success).toBe(true);
    expect(RateSchema.safeParse("1.08").success).toBe(true);
    expect(RateSchema.safeParse("0").success).toBe(false);
    expect(RateSchema.safeParse("-1").success).toBe(false);
    expect(RateSchema.safeParse("1e-3").success).toBe(false);
  });

  it("divides and converts with integer math, rounding to minor units", () => {
    // ECB: 1 EUR = 1.0812 USD and 1 EUR = 551.2 KZT, so 1 KZT = 1.0812 / 551.2 USD.
    expect(divideRates("1.0812", "551.2")).toBe("0.001961538462");
    expect(divideRates("1", "4")).toBe("0.25");
    expect(convertMoney(kzt(1_900_00), "0.002", "USD")).toEqual(usd(3_80));
    expect(convertMoney(eur(18_90), "1.0812", "USD")).toEqual(usd(20_43));
    expect(convertMoney(usd(3_90), "1", "USD")).toEqual(usd(3_90));
    expect(toUsd(usd(5_90), "999")).toEqual(usd(5_90));
    expect(toUsd(kzt(-1_900_00), "0.002")).toEqual(usd(-3_80));
  });

  it("reports revenue per currency and roughly in dollars at each sale's own rate", () => {
    const revenue = revenueOf([
      { currency: "KZT", fxToUsd: "0.002", count: 2, amount: 20_000_00 },
      { currency: "KZT", fxToUsd: "0.0025", count: 1, amount: 10_000_00 },
      { currency: "EUR", fxToUsd: null, count: 1, amount: 62_70 },
      { currency: "USD", fxToUsd: null, count: 1, amount: 5_90 },
    ]);
    expect(revenue.count).toBe(5);
    expect(revenue.byCurrency).toEqual([
      { currency: "KZT", count: 3, total: kzt(30_000_00) },
      { currency: "USD", count: 1, total: usd(5_90) },
      { currency: "EUR", count: 1, total: eur(62_70) },
    ]);
    // 40 + 25 + 5.90 dollars; the euro sale had no rate and is left out.
    expect(revenue.approxUsd).toEqual(usd(70_90));
    expect(revenue.unconverted).toBe(1);
    expect(revenueOf([])).toEqual({ count: 0, byCurrency: [], approxUsd: usd(0), unconverted: 0 });
  });
});
