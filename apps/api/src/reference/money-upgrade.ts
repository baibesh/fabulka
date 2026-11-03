import {
  DEFAULT_FORMATS,
  DEFAULT_PRICES,
  type Currency,
  type DefaultPrices,
} from '@fabulka/shared';

/**
 * The reference settings as stored before money was { amount in minor units, currency }: tenge as
 * whole tenge, dollars as decimals, print in tenge only. This upgrades them on start, once:
 *
 * - reference.prices `{ books: { template: { KZT, USD }, custom: … }, deliveryKzt }` becomes the
 *   per-currency defaults `{ KZT: { books, delivery }, USD: …, EUR: … }`: tenge × 100, dollars ×
 *   100 (rounded to the cent); the dollar delivery fee and the euro list come from today's defaults
 *   (there was no print in dollars, and no euros).
 * - formats' `prices: { soft, hard }` (tenge) become `prices: { KZT: { soft×100, hard×100 } }`, with
 *   the default dollar and euro prices of a default format.
 * - a country's own prices keep their values, in the currency the country charges in.
 * - a country's own delivery fee and format prices were tenge: they stay tenge (and count once the
 *   country charges in tenge).
 *
 * Values already in today's shape are left alone. Returns only the fields that changed.
 */
export interface StoredMoneySettings {
  prices?: unknown;
  formats?: unknown;
  countries?: unknown;
  countryPrices?: unknown;
  countryDelivery?: unknown;
  countryFormats?: unknown;
}

type Legacy = Record<string, unknown>;
const isObject = (value: unknown): value is Legacy =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Whole tenge → tiyn. */
const tenge = (value: unknown) => Math.round(num(value)) * 100;
/** Dollars with decimals → cents, rounded to the cent. */
const cents = (value: unknown) => Math.round(num(value) * 100);

/** Old book prices `{ KZT, USD }` of one kind, in `currency`'s minor units. */
function legacyBook(price: unknown, currency: Currency): number {
  const p = isObject(price) ? price : {};
  return currency === 'KZT' ? tenge(p.KZT) : cents(p.USD);
}

const isLegacyPrices = (value: unknown) =>
  isObject(value) &&
  ('deliveryKzt' in value ||
    (isObject(value.books) &&
      isObject(value.books.template) &&
      'KZT' in value.books.template));

export function upgradePrices(stored: unknown): DefaultPrices | null {
  if (!isLegacyPrices(stored)) return null;
  const old = stored as Legacy;
  const books = isObject(old.books) ? old.books : {};
  return {
    KZT: {
      books: {
        template: legacyBook(books.template, 'KZT'),
        custom: legacyBook(books.custom, 'KZT'),
      },
      delivery: tenge(old.deliveryKzt),
    },
    USD: {
      books: {
        template: legacyBook(books.template, 'USD'),
        custom: legacyBook(books.custom, 'USD'),
      },
      delivery: DEFAULT_PRICES.USD!.delivery,
    },
    EUR: DEFAULT_PRICES.EUR,
  };
}

export function upgradeFormats(stored: unknown): unknown[] | null {
  if (!Array.isArray(stored)) return null;
  const legacy = stored.some(
    (f) =>
      isObject(f) && isObject(f.prices) && typeof f.prices.soft === 'number',
  );
  if (!legacy) return null;
  return stored.map((f: unknown) => {
    if (
      !isObject(f) ||
      !isObject(f.prices) ||
      typeof f.prices.soft !== 'number'
    )
      return f;
    const defaults = DEFAULT_FORMATS.find((d) => d.id === f.id)?.prices ?? {};
    return {
      ...f,
      prices: {
        ...defaults,
        KZT: { soft: tenge(f.prices.soft), hard: tenge(f.prices.hard) },
      },
    };
  });
}

export function upgradeCountryPrices(
  stored: unknown,
  countries: unknown,
): Record<string, unknown> | null {
  if (!isObject(stored)) return null;
  const legacy = Object.values(stored).some(isLegacyPrices);
  if (!legacy) return null;
  const list = Array.isArray(countries) ? (countries as Legacy[]) : [];
  const currencyOf = (code: string): Currency =>
    list.find((c) => c?.code === code)?.currency === 'KZT' ? 'KZT' : 'USD';
  return Object.fromEntries(
    Object.entries(stored).map(([code, entry]) => {
      if (!isLegacyPrices(entry)) return [code, entry];
      const books = isObject((entry as Legacy).books)
        ? ((entry as Legacy).books as Legacy)
        : {};
      const currency = currencyOf(code);
      return [
        code,
        {
          currency,
          books: {
            template: legacyBook(books.template, currency),
            custom: legacyBook(books.custom, currency),
          },
        },
      ];
    }),
  );
}

export function upgradeCountryDelivery(
  stored: unknown,
): Record<string, unknown> | null {
  if (!isObject(stored)) return null;
  const legacy = Object.values(stored).some(
    (d) => isObject(d) && 'feeKzt' in d,
  );
  if (!legacy) return null;
  return Object.fromEntries(
    Object.entries(stored).map(([code, d]) =>
      isObject(d) && 'feeKzt' in d
        ? [
            code,
            {
              currency: 'KZT',
              fee: tenge(d.feeKzt),
              freeEverywhere: d.freeEverywhere === true,
            },
          ]
        : [code, d],
    ),
  );
}

export function upgradeCountryFormats(
  stored: unknown,
): Record<string, unknown> | null {
  if (!isObject(stored)) return null;
  const isLegacy = (o: unknown) =>
    isObject(o) && isObject(o.prices) && !('currency' in o.prices);
  const legacy = Object.values(stored).some(
    (formats) => isObject(formats) && Object.values(formats).some(isLegacy),
  );
  if (!legacy) return null;
  return Object.fromEntries(
    Object.entries(stored).map(([code, formats]) => [
      code,
      isObject(formats)
        ? Object.fromEntries(
            Object.entries(formats).map(([id, o]) =>
              isLegacy(o)
                ? [
                    id,
                    {
                      ...(o as Legacy),
                      prices: {
                        currency: 'KZT',
                        soft: tenge(((o as Legacy).prices as Legacy).soft),
                        hard: tenge(((o as Legacy).prices as Legacy).hard),
                      },
                    },
                  ]
                : [id, o],
            ),
          )
        : formats,
    ]),
  );
}

/** Every money setting in today's shape: only the fields that changed (see above). */
export function upgradeMoneySettings(
  stored: StoredMoneySettings,
): Partial<Record<keyof StoredMoneySettings, unknown>> {
  const changed: Partial<Record<keyof StoredMoneySettings, unknown>> = {};
  const prices = upgradePrices(stored.prices);
  if (prices) changed.prices = prices;
  const formats = upgradeFormats(stored.formats);
  if (formats) changed.formats = formats;
  const countryPrices = upgradeCountryPrices(
    stored.countryPrices,
    stored.countries,
  );
  if (countryPrices) changed.countryPrices = countryPrices;
  const countryDelivery = upgradeCountryDelivery(stored.countryDelivery);
  if (countryDelivery) changed.countryDelivery = countryDelivery;
  const countryFormats = upgradeCountryFormats(stored.countryFormats);
  if (countryFormats) changed.countryFormats = countryFormats;
  return changed;
}
