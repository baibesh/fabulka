import {
  CURRENCIES,
  divideRates,
  type Currency,
  type FxSource,
} from '@fabulka/shared';

/** Rates to USD from one source for one day: US dollars for one unit of each currency it covers. */
export interface FxQuote {
  source: FxSource;
  /** YYYY-MM-DD. */
  date: string;
  rates: Partial<Record<Currency, string>>;
}

const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * The ECB's daily reference rates (eurofxref-daily.xml): units of each currency for one euro. Gives
 * EUR (dollars per euro) and every other registered currency the ECB lists, through the euro.
 */
export function parseEcb(xml: string): FxQuote {
  const date = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!date) throw new Error('ECB: no date');
  const perEur = new Map<string, string>();
  for (const [, code, rate] of xml.matchAll(
    /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g,
  )) {
    if (DECIMAL.test(rate)) perEur.set(code, rate);
  }
  const usd = perEur.get('USD');
  if (!usd) throw new Error('ECB: no USD rate');
  const rates: Partial<Record<Currency, string>> = {};
  for (const currency of CURRENCIES) {
    if (currency === 'USD') continue;
    if (currency === 'EUR') rates.EUR = usd;
    else if (perEur.has(currency))
      rates[currency] = divideRates(usd, perEur.get(currency)!);
  }
  return { source: 'ecb', date, rates };
}

/**
 * The National Bank of Kazakhstan's official rates (rss/rates_all.xml): tenge for `quant` units of
 * each currency. Gives KZT (dollars per tenge) — the ECB does not list the tenge.
 */
export function parseNbk(xml: string): FxQuote {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
    ([, item]) => ({
      code: /<title>\s*([A-Z]{3})\s*<\/title>/.exec(item)?.[1],
      date: /<pubDate>\s*(\d{2})\.(\d{2})\.(\d{4})\s*<\/pubDate>/.exec(item),
      rate: /<description>\s*([\d.]+)\s*<\/description>/.exec(item)?.[1],
      quant: /<quant>\s*(\d+)\s*<\/quant>/.exec(item)?.[1] ?? '1',
    }),
  );
  const usd = items.find((i) => i.code === 'USD');
  if (!usd?.rate || !DECIMAL.test(usd.rate) || !usd.date)
    throw new Error('NBK: no USD rate');
  const [, day, month, year] = usd.date;
  // Tenge for one dollar → dollars for one tenge.
  const kztPerUsd = divideRates(usd.rate, usd.quant);
  return {
    source: 'nbk',
    date: `${year}-${month}-${day}`,
    rates: { KZT: divideRates('1', kztPerUsd) },
  };
}

/** One rate per currency from several sources: the first source listing it wins. */
export function mergeQuotes(
  quotes: readonly FxQuote[],
): { currency: Currency; rate: string; source: FxSource; date: string }[] {
  const merged: {
    currency: Currency;
    rate: string;
    source: FxSource;
    date: string;
  }[] = [];
  for (const currency of CURRENCIES) {
    if (currency === 'USD') continue;
    const quote = quotes.find((q) => q.rates[currency]);
    if (quote)
      merged.push({
        currency,
        rate: quote.rates[currency]!,
        source: quote.source,
        date: quote.date,
      });
  }
  return merged;
}
