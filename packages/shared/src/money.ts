import { z } from "zod";

// ---- Money ---------------------------------------------------------------------------------------
//
// Every price, order and purchase is Money: an integer amount in the currency's ISO 4217 minor units
// plus the currency's code. No floats anywhere: amounts are integers, and turning them into text (or
// a decimal string for JSON-LD) is done with integer and string arithmetic.
//
// Display and input rounding, per currency (`decimals` below):
// - KZT: ISO 4217 says 2 (tiyn), but tenge prices are whole: they are typed and shown with no
//   decimals, so every stored KZT price is a multiple of 100 minor units (validated on save).
// - USD and EUR: 2 decimals, typed and shown as cents.
// A computed amount finer than what is shown (an approximate conversion to dollars) is rounded half
// away from zero when shown, which is Intl.NumberFormat's default ("halfExpand").

export interface CurrencyInfo {
  /** ISO 4217 minor-unit exponent: amounts are stored in units of 10^-exponent. */
  exponent: number;
  /** The narrow symbol, for labels ("Price, €"); prices themselves are formatted by Intl. */
  symbol: string;
  /** Decimals typed and shown; never more than `exponent`. Prices are multiples of 10^(exponent − decimals). */
  decimals: number;
}

/** The currencies Fabulka can price in. Adding one is one line here. */
export const CURRENCY_REGISTRY = {
  KZT: { exponent: 2, symbol: "₸", decimals: 0 },
  USD: { exponent: 2, symbol: "$", decimals: 2 },
  EUR: { exponent: 2, symbol: "€", decimals: 2 },
} as const satisfies Record<string, CurrencyInfo>;

export type Currency = keyof typeof CURRENCY_REGISTRY;
export const CURRENCIES = Object.keys(CURRENCY_REGISTRY) as [Currency, ...Currency[]];
export const CurrencySchema = z.enum(CURRENCIES);

export function currencyInfo(currency: Currency): CurrencyInfo {
  return CURRENCY_REGISTRY[currency];
}

/** The largest amount in minor units a price or an order may hold (keeps sums far from 2^53). */
export const MAX_MINOR = 100_000_000_000;

/** An amount in minor units: a whole number, 0 or more. */
export const MinorAmountSchema = z.number().int().min(0).max(MAX_MINOR);

export const MoneySchema = z.object({ amount: z.number().int().min(-MAX_MINOR).max(MAX_MINOR), currency: CurrencySchema });
export type Money = z.infer<typeof MoneySchema>;

export function money(amount: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amount)) throw new Error(`Money amounts are whole minor units, got ${amount}`);
  return { amount, currency };
}

/** The smallest step a price may move by, in minor units: 100 for whole tenge, 1 for cents. */
export function priceStep(currency: Currency): number {
  const { exponent, decimals } = CURRENCY_REGISTRY[currency];
  return 10 ** (exponent - decimals);
}

/** Whether `amount` is a valid price in this currency: a whole, non-negative number of shown units. */
export function isPriceAmount(amount: unknown, currency: Currency): amount is number {
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_MINOR && amount % priceStep(currency) === 0;
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
}

export function addMoney(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function multiplyMoney(m: Money, times: number): Money {
  if (!Number.isSafeInteger(times)) throw new Error(`Money is multiplied by whole numbers, got ${times}`);
  return money(m.amount * times, m.currency);
}

/** The sum of amounts in one currency (zero for none). */
export function sumMoney(items: readonly Money[], currency: Currency): Money {
  return items.reduce((sum, item) => addMoney(sum, item), money(0, currency));
}

/** Integer and fraction digits of an amount, exactly: 190050 KZT → ["1900", "50"]. */
function digits({ amount, currency }: Money): { negative: boolean; whole: string; fraction: string } {
  const { exponent } = CURRENCY_REGISTRY[currency];
  const text = String(Math.abs(amount)).padStart(exponent + 1, "0");
  return {
    negative: amount < 0,
    whole: exponent ? text.slice(0, -exponent) : text,
    fraction: exponent ? text.slice(-exponent) : "",
  };
}

/** The amount in major units as an exact decimal string: { 1900_00, KZT } → "1900.00" (JSON-LD, Intl). */
export function toDecimalString(m: Money): string {
  const { negative, whole, fraction } = digits(m);
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** The amount as an admin types it, with the currency's shown decimals: "1900", "3.90". Rounds half away from zero. */
export function toInputString(m: Money): string {
  const { decimals, exponent } = CURRENCY_REGISTRY[m.currency];
  const step = 10 ** (exponent - decimals);
  const rounded = Math.sign(m.amount) * Math.round(Math.abs(m.amount) / step) * step;
  const { negative, whole, fraction } = digits(money(rounded, m.currency));
  const shown = fraction.slice(0, decimals);
  return `${negative ? "-" : ""}${whole}${shown ? `.${shown}` : ""}`;
}

/**
 * A price an admin typed, in minor units of `currency`; null when it is not one. Spaces and
 * apostrophes group thousands; "," or "." is the decimal separator when the currency has decimals
 * and it is the last separator followed by at most that many digits ("3,9", "1.234,50", "1,234.50");
 * otherwise separators group thousands ("1,900", "1.900"). More decimals than the currency shows
 * (a fraction of a cent, tiyn) is not a price.
 */
export function parseMoneyInput(text: string, currency: Currency): Money | null {
  const { exponent, decimals } = CURRENCY_REGISTRY[currency];
  const cleaned = text.trim().replace(/[\s  '’]/g, "");
  if (!cleaned || !/^\d[\d.,]*$/.test(cleaned) || /[.,]$/.test(cleaned)) return null;
  let whole = cleaned;
  let fraction = "";
  const last = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  if (last >= 0) {
    const separator = cleaned[last];
    const tail = cleaned.slice(last + 1);
    const mixed = cleaned.includes(separator === "." ? "," : ".");
    const once = cleaned.indexOf(separator) === last;
    // A decimal part: the last separator when both kinds appear, or a single one. A single one
    // followed by exactly three digits is a thousands group in a currency shown whole ("1,900"
    // tenge) and ambiguous in one with decimals ("4.999" dollars: refused rather than guessed).
    const decimal = mixed || (once && (tail.length !== 3 || decimals > 0));
    if (once && !mixed && tail.length === 3 && decimals > 0) return null;
    if (decimal) {
      whole = cleaned.slice(0, last);
      fraction = tail;
      // The decimal separator appears once; the rest group thousands.
      if (whole.includes(separator)) return null;
    }
    // Groups before the decimal part: one to three digits, then exactly three each.
    const groups = whole.split(/[.,]/);
    if (groups.length > 1 && (!groups[0] || groups[0].length > 3 || groups.slice(1).some((g) => g.length !== 3))) return null;
    whole = groups.join("");
  }
  if (fraction.length > decimals) return null;
  const minor = Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || "0");
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return null;
  return money(minor, currency);
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * The locale amounts are formatted with. Kazakh writes amounts as Russian does (CLDR: "1 900 ₸",
 * "5,90 $"), but not every browser carries Kazakh number data (one without it writes "$ 5.90"),
 * and the server's and the browser's text must match on hydration: Kazakh uses Russian-in-Kazakhstan.
 */
export function moneyLocale(locale: string): string {
  return /^kk(-|$)/i.test(locale) ? "ru-KZ" : locale;
}

/**
 * Money as a person reads it in `locale` (a BCP 47 tag such as "ru-RU" or "de-DE"), with the
 * currency's shown decimals and narrow symbol: "1 900 ₸", "₸1,900", "19,90 €", "$3.90".
 */
export function formatMoney(m: Money, locale: string): string {
  const { decimals } = CURRENCY_REGISTRY[m.currency];
  const tag = moneyLocale(locale);
  const key = `${tag}|${m.currency}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat(tag, {
      style: "currency",
      currency: m.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, format);
  }
  // An exact decimal string, not a float: Intl formats it digit for digit.
  return format.format(toDecimalString(m) as unknown as number);
}

// ---- Exchange rates (reporting only) -------------------------------------------------------------
//
// A rate is a decimal string: US dollars for one unit of the currency ("0.00196" for KZT). Rates are
// only ever used to show approximate totals in dollars; nothing is charged at a converted price.

/** Fraction digits rates are kept and multiplied at. */
export const RATE_DECIMALS = 12;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);

/** A rate as typed or stored: a positive decimal with at most RATE_DECIMALS fraction digits. */
export const RateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,12})?$/, "A decimal such as 0.00196")
  .refine((rate) => /[1-9]/.test(rate), "The rate is above zero");

/** A decimal string as an integer scaled by 10^RATE_DECIMALS. */
export function scaledRate(rate: string): bigint {
  const [whole, fraction = ""] = rate.trim().split(".");
  return BigInt(whole || "0") * RATE_SCALE + BigInt(fraction.slice(0, RATE_DECIMALS).padEnd(RATE_DECIMALS, "0"));
}

/** A scaled integer back as a decimal string without trailing zeros: 1960000000n → "0.00196". */
export function rateString(scaled: bigint): string {
  const whole = scaled / RATE_SCALE;
  const fraction = (scaled % RATE_SCALE).toString().padStart(RATE_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** a / b for two decimal rates, at RATE_DECIMALS, rounded half up. */
export function divideRates(a: string, b: string): string {
  const divisor = scaledRate(b);
  if (divisor === 0n) throw new Error("Division by a zero rate");
  return rateString((scaledRate(a) * RATE_SCALE * 2n + divisor) / (divisor * 2n));
}

/**
 * Money converted at a rate (target units per one unit of the source currency), rounded half away
 * from zero to the target's minor units: { 1_900_00 KZT } at "0.002" USD → { 380 USD }.
 */
export function convertMoney(m: Money, rate: string, target: Currency): Money {
  const from = BigInt(CURRENCY_REGISTRY[m.currency].exponent);
  const to = BigInt(CURRENCY_REGISTRY[target].exponent);
  const numerator = BigInt(m.amount) * scaledRate(rate) * 10n ** to;
  const denominator = RATE_SCALE * 10n ** from;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (denominator * 2n);
  return money(Number(negative ? -rounded : rounded), target);
}

/** An approximate amount in US dollars at a rate to USD (reports only). */
export function toUsd(m: Money, rateToUsd: string): Money {
  return m.currency === "USD" ? m : convertMoney(m, rateToUsd, "USD");
}

// ---- Revenue reports -----------------------------------------------------------------------------

/** Sales in one currency: how many, and their total as charged. */
export const CurrencyRevenueSchema = z.object({ currency: CurrencySchema, count: z.number().int(), total: MoneySchema });
export type CurrencyRevenue = z.infer<typeof CurrencyRevenueSchema>;

/**
 * Sales by currency (never added across currencies), and roughly in dollars: each sale at the rate
 * to USD it was made at. Sales made with no rate known are left out of `approxUsd` (`unconverted`).
 */
export const RevenueSchema = z.object({
  count: z.number().int(),
  byCurrency: z.array(CurrencyRevenueSchema),
  approxUsd: MoneySchema,
  unconverted: z.number().int(),
});
export type Revenue = z.infer<typeof RevenueSchema>;

/** One group of sales for a revenue report: a currency, a rate (null: none known), how many, their sum. */
export interface RevenueGroup {
  currency: Currency;
  fxToUsd: string | null;
  count: number;
  amount: number;
}

/** Revenue by currency and roughly in dollars from sales grouped by currency and rate. */
export function revenueOf(groups: readonly RevenueGroup[]): Revenue {
  const byCurrency = new Map<Currency, CurrencyRevenue>();
  let usd = 0;
  let unconverted = 0;
  let count = 0;
  for (const group of groups) {
    count += group.count;
    const row = byCurrency.get(group.currency) ?? { currency: group.currency, count: 0, total: money(0, group.currency) };
    row.count += group.count;
    row.total = money(row.total.amount + group.amount, group.currency);
    byCurrency.set(group.currency, row);
    const rate = group.currency === "USD" ? "1" : group.fxToUsd;
    if (rate) usd += toUsd(money(group.amount, group.currency), rate).amount;
    else unconverted += group.count;
  }
  return {
    count,
    byCurrency: CURRENCIES.flatMap((c) => byCurrency.get(c) ?? []),
    approxUsd: money(usd, "USD"),
    unconverted,
  };
}

/**
 * Print margin of the orders whose print partner costs were known when ordered, roughly in dollars:
 * what they were sold for, what printing and delivering them cost, and the difference.
 */
export const MarginSchema = z.object({
  orders: z.number().int(),
  revenue: MoneySchema,
  cost: MoneySchema,
  margin: MoneySchema,
});
export type Margin = z.infer<typeof MarginSchema>;

// ---- Exchange rates in the admin (reports only) --------------------------------------------------

/** Where a rate came from: the ECB's daily reference rates, the National Bank of Kazakhstan, or a superadmin. */
export const FX_SOURCES = ["ecb", "nbk", "manual"] as const;
export const FxSourceSchema = z.enum(FX_SOURCES);
export type FxSource = z.infer<typeof FxSourceSchema>;

/** One currency's rate to USD as the admin shows it: the one in use, the last fetched one and a manual override. */
export const FxRateRowSchema = z.object({
  currency: CurrencySchema,
  /** The rate orders and purchases record now (the override when set); null when none is known. */
  rate: z.string().nullable(),
  source: FxSourceSchema.nullable(),
  /** The day the rate is for (YYYY-MM-DD). */
  date: z.string().nullable(),
  /** The last rate fetched from a public source, whatever the override. */
  fetched: z.object({ rate: z.string(), source: FxSourceSchema, date: z.string() }).nullable(),
  /** The superadmin's override; while set it is used instead of fetched rates. */
  manual: z.string().nullable(),
});
export type FxRateRow = z.infer<typeof FxRateRowSchema>;

/** GET /admin/fx. */
export const AdminFxSchema = z.object({
  rates: z.array(FxRateRowSchema),
  refresh: z.object({
    /** Fetching runs daily unless switched off (FX_REFRESH=off). */
    enabled: z.boolean(),
    at: z.string().nullable(),
    ok: z.boolean().nullable(),
    error: z.string().nullable(),
  }),
});
export type AdminFx = z.infer<typeof AdminFxSchema>;

/** Body of PUT /admin/fx: a superadmin's rate for one currency (US dollars for one unit). */
export const ManualRateSchema = z.object({ currency: CurrencySchema, rate: RateSchema });
export type ManualRate = z.infer<typeof ManualRateSchema>;
