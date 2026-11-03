import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_FORMATS,
  COUNTRY_BLOCKED,
  COUNTRY_POLICY_BLOCKED,
  DEFAULT_CITIES,
  DEFAULT_COUNTRIES,
  DEFAULT_FAQ,
  DEFAULT_PRICES,
  REFERENCE_KEYS,
  type DefaultPrices,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { RESTRICTED_COUNTRIES } from '../geo/restricted';
import { CACHE_MS, ReferenceService, upgradeStored } from './reference.service';
import {
  SEEDED_COUNTRIES_V1,
  SEEDED_COUNTRIES_V2,
  SEEDED_FAQ_V1,
  SEEDED_FAQ_V2,
  SEEDED_FAQ_V3,
  SEEDED_FAQ_V4,
  SEEDED_FAQ_V5,
  SEEDED_FAQ_V6,
} from './seeded';

/** The Setting table in memory behind the few Prisma calls the service makes. */
function settingsStore(initial: Record<string, unknown> = {}) {
  const rows = new Map<string, unknown>(Object.entries(initial));
  const setting = {
    createMany: jest.fn(
      ({ data }: { data: { key: string; value: unknown }[] }) => {
        const added = data.filter((row) => !rows.has(row.key));
        for (const row of added) rows.set(row.key, row.value);
        return Promise.resolve({ count: added.length });
      },
    ),
    findMany: jest.fn(({ where }: { where: { key: { in: string[] } } }) =>
      Promise.resolve(
        where.key.in
          .filter((key) => rows.has(key))
          .map((key) => ({ key, value: rows.get(key) })),
      ),
    ),
    upsert: jest.fn(
      ({
        where,
        update,
      }: {
        where: { key: string };
        update: { value: unknown };
      }) => {
        rows.set(where.key, update.value);
        return Promise.resolve({});
      },
    ),
  };
  const service = new ReferenceService({
    setting,
  } as unknown as PrismaService);
  return { service, rows, setting };
}

const dearer: DefaultPrices = {
  ...DEFAULT_PRICES,
  KZT: { books: { template: 2_500_00, custom: 2_900_00 }, delivery: 1_500_00 },
  USD: { books: { template: 4_50, custom: 5_90 }, delivery: 9_90 },
};
const kzt = (amount: number) => ({ amount, currency: 'KZT' });

/** What an order of one book in this format from `country` to the city costs, as the service prices it. */
async function quote(
  service: ReferenceService,
  formatId: string,
  cover: 'soft' | 'hard',
  quantity: number,
  cityId: string,
  country = 'KZ',
) {
  const format = await service.offeredFormat(formatId, country);
  const result = await service.quote(
    'b1',
    format,
    cover,
    quantity,
    cityId,
    country,
  );
  if (!result) throw new Error('not priced');
  return result;
}

describe('ReferenceService seeding', () => {
  it('stores today’s prices, cities, countries and an empty extra block list when absent', async () => {
    const { service, rows } = settingsStore();
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(DEFAULT_COUNTRIES);
    expect(rows.get(REFERENCE_KEYS.faq)).toEqual(DEFAULT_FAQ);

    expect(rows.get(REFERENCE_KEYS.prices)).toEqual(DEFAULT_PRICES);
    expect(rows.get(REFERENCE_KEYS.cities)).toEqual(DEFAULT_CITIES);
    expect(rows.get(REFERENCE_KEYS.extraBlocked)).toEqual([]);
    expect(await service.bookPrice('template')).toEqual(kzt(1_900_00));
  });

  it('never overwrites what the owner has changed', async () => {
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.prices]: dearer,
      [REFERENCE_KEYS.extraBlocked]: ['NL'],
    });
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.prices)).toEqual(dearer);
    expect(rows.get(REFERENCE_KEYS.extraBlocked)).toEqual(['NL']);
    expect(rows.get(REFERENCE_KEYS.cities)).toEqual(DEFAULT_CITIES);
    expect((await service.prices()).KZT?.books.template).toBe(2_500_00);
  });

  it('upgrades an untouched older seed of the countries and the FAQ to today’s', async () => {
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.countries]: structuredClone(SEEDED_COUNTRIES_V1),
      [REFERENCE_KEYS.faq]: structuredClone(SEEDED_FAQ_V1),
    });
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(DEFAULT_COUNTRIES);
    expect(rows.get(REFERENCE_KEYS.faq)).toEqual(DEFAULT_FAQ);
    const pl = (await service.countries()).find((c) => c.code === 'PL');
    expect(pl?.languages).toEqual(['en']);
  });

  it('upgrades the seed stored before Spanish and German to today’s', async () => {
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.countries]: structuredClone(SEEDED_COUNTRIES_V2),
      [REFERENCE_KEYS.faq]: structuredClone(SEEDED_FAQ_V2),
    });
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(DEFAULT_COUNTRIES);
    expect(rows.get(REFERENCE_KEYS.faq)).toEqual(DEFAULT_FAQ);
    const countries = await service.countries();
    expect(countries.find((c) => c.code === 'DE')?.languages).toEqual([
      'de',
      'en',
    ]);
    expect(countries.find((c) => c.code === 'MX')?.languages).toEqual([
      'es',
      'en',
    ]);
    const faq = await service.public();
    expect(faq.faq.every((item) => item.q.es && item.q.de)).toBe(true);
  });

  it('upgrades every FAQ seed stored before the photo page to today’s', async () => {
    const seeds = [
      SEEDED_FAQ_V1,
      SEEDED_FAQ_V2,
      SEEDED_FAQ_V3,
      SEEDED_FAQ_V4,
      SEEDED_FAQ_V5,
    ];
    for (const seed of seeds) {
      expect(upgradeStored('faq', structuredClone(seed))).toEqual(DEFAULT_FAQ);
    }
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.faq]: structuredClone(SEEDED_FAQ_V3),
    });
    await service.onModuleInit();
    expect(rows.get(REFERENCE_KEYS.faq)).toEqual(DEFAULT_FAQ);
    const data = (await service.public()).faq.find(
      (item) => item.id === 'data',
    );
    expect(data?.a.ru).toContain('страницу с фото ребёнка');
    expect(data?.a.ru).not.toContain('не просим');
  });

  it('leaves an edited FAQ of the proofread seeds alone', () => {
    for (const seed of [
      SEEDED_FAQ_V3,
      SEEDED_FAQ_V4,
      SEEDED_FAQ_V5,
      SEEDED_FAQ_V6,
    ]) {
      const faq = (structuredClone(seed) as { published: boolean }[]).map(
        (item, i) => (i === 0 ? { ...item, published: false } : item),
      );
      expect(upgradeStored('faq', faq)).toBeNull();
    }
    expect(upgradeStored('faq', structuredClone(DEFAULT_FAQ))).toBeNull();
  });

  it('matches the old seed whatever the key order the database keeps', async () => {
    // Postgres JSONB stores object keys in its own order.
    const reordered = (SEEDED_COUNTRIES_V1 as Record<string, unknown>[]).map(
      ({ print, currency, languages, code }) => ({
        print,
        currency,
        languages,
        code,
      }),
    );
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.countries]: reordered,
    });
    await service.onModuleInit();
    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(DEFAULT_COUNTRIES);
  });

  it('leaves the countries and the FAQ the owner edited alone', async () => {
    const countries = structuredClone(SEEDED_COUNTRIES_V1) as {
      code: string;
    }[];
    countries.splice(1, 1); // Uzbekistan taken off
    const faq = (
      structuredClone(SEEDED_FAQ_V1) as { published: boolean }[]
    ).map((item, i) => (i === 0 ? { ...item, published: false } : item));
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.countries]: countries,
      [REFERENCE_KEYS.faq]: faq,
    });
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(countries);
    expect(rows.get(REFERENCE_KEYS.faq)).toEqual(faq);
  });

  it('gives cities stored before ids their ids, in order, and prices by them', async () => {
    const old = [
      { ru: 'Алматы', kk: 'Алматы', en: 'Almaty', freeDelivery: false },
      { ru: 'Тараз', kk: 'Тараз', en: 'Taraz', freeDelivery: true },
    ];
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.cities]: old,
    });
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.cities)).toEqual([
      {
        id: 'almaty',
        country: 'KZ',
        name: { ru: 'Алматы', kk: 'Алматы', en: 'Almaty' },
        freeDelivery: false,
      },
      {
        id: 'taraz',
        country: 'KZ',
        name: { ru: 'Тараз', kk: 'Тараз', en: 'Taraz' },
        freeDelivery: true,
      },
    ]);
    expect(
      (await quote(service, 'square-210', 'soft', 1, 'taraz')).delivery,
    ).toEqual(kzt(0));
    expect(
      (await quote(service, 'square-210', 'soft', 1, 'almaty')).delivery,
    ).toEqual(kzt(1_500_00));
  });

  it('keeps print on where a list priced it in dollars: print is priced in any currency now', async () => {
    const countries = [
      { code: 'KZ', languages: ['kk', 'ru'], currency: 'KZT', print: true },
      { code: 'UZ', languages: ['ru'], currency: 'USD', print: true },
    ];
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.countries]: countries,
    });
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(countries);
    expect((await service.infoFor('UZ')).print).toBe(true);
  });

  it('upgrades tenge and dollar prices stored before minor units, keeping every country override', async () => {
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.prices]: {
        books: {
          template: { KZT: 2500, USD: 4.5 },
          custom: { KZT: 2900, USD: 5.9 },
        },
        deliveryKzt: 1200,
      },
      [REFERENCE_KEYS.formats]: DEFAULT_FORMATS.map((f) => ({
        ...f,
        prices:
          f.id === 'square-210'
            ? { soft: 9500, hard: 14500 }
            : { soft: 7000, hard: 11000 },
      })),
      [REFERENCE_KEYS.countryPrices]: {
        DE: {
          books: {
            template: { KZT: 1900, USD: 4.9 },
            custom: { KZT: 2900, USD: 6.9 },
          },
          deliveryKzt: 9999,
        },
        KZ: {
          books: {
            template: { KZT: 2100, USD: 3.9 },
            custom: { KZT: 3100, USD: 5.9 },
          },
          deliveryKzt: 1500,
        },
      },
      [REFERENCE_KEYS.countryDelivery]: {
        KZ: { feeKzt: 2500, freeEverywhere: false },
      },
      [REFERENCE_KEYS.countryFormats]: {
        KZ: { 'a5-portrait': { prices: { soft: 5000, hard: 8000 } } },
      },
    });
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.prices)).toEqual({
      KZT: {
        books: { template: 2_500_00, custom: 2_900_00 },
        delivery: 1_200_00,
      },
      USD: {
        books: { template: 4_50, custom: 5_90 },
        delivery: DEFAULT_PRICES.USD!.delivery,
      },
      EUR: DEFAULT_PRICES.EUR,
    });
    expect(rows.get(REFERENCE_KEYS.countryPrices)).toEqual({
      DE: { currency: 'USD', books: { template: 4_90, custom: 6_90 } },
      KZ: { currency: 'KZT', books: { template: 2_100_00, custom: 3_100_00 } },
    });
    expect(rows.get(REFERENCE_KEYS.countryDelivery)).toEqual({
      KZ: { currency: 'KZT', fee: 2_500_00, freeEverywhere: false },
    });
    const formats = rows.get(REFERENCE_KEYS.formats) as typeof DEFAULT_FORMATS;
    expect(formats[0].prices).toEqual({
      ...DEFAULT_FORMATS[0].prices,
      KZT: { soft: 9_500_00, hard: 14_500_00 },
    });
    expect(await service.bookPrice('template', 'DE')).toEqual({
      amount: 4_90,
      currency: 'USD',
    });
    expect(await service.bookPrice('template', 'KZ')).toEqual(kzt(2_100_00));
    const order = await quote(service, 'a5-portrait', 'soft', 2, 'shymkent');
    expect(order).toMatchObject({
      subtotal: kzt(10_000_00),
      delivery: kzt(2_500_00),
      total: kzt(12_500_00),
    });
    // Upgraded once: a second start changes nothing.
    const writes = rows.size;
    await service.onModuleInit();
    expect(rows.size).toBe(writes);
    expect(rows.get(REFERENCE_KEYS.countryFormats)).toEqual({
      KZ: {
        'a5-portrait': {
          prices: { currency: 'KZT', soft: 5_000_00, hard: 8_000_00 },
        },
      },
    });
  });

  it('falls back to the default for a missing or broken value', async () => {
    const { service } = settingsStore({
      [REFERENCE_KEYS.prices]: { books: 'free' },
    });
    expect(await service.prices()).toEqual(DEFAULT_PRICES);
    expect(await service.cities()).toEqual(DEFAULT_CITIES);
    expect(await service.blocked('NL')).toBe(false);
  });
});

describe('ReferenceService cache', () => {
  afterEach(() => jest.useRealTimers());

  it('reads the database once, then again after an edit', async () => {
    const { service, setting } = settingsStore();
    await service.prices();
    await service.cities();
    await service.blocked('NL');
    expect(setting.findMany).toHaveBeenCalledTimes(1);

    await service.setPrices(dearer);
    expect(setting.findMany).toHaveBeenCalledTimes(2);
    expect((await service.bookPrice('template', 'UZ'))?.amount).toBe(4_50);
    expect(setting.findMany).toHaveBeenCalledTimes(2);
  });

  it('picks up a change made elsewhere once the cache expires', async () => {
    jest.useFakeTimers();
    const { service, rows } = settingsStore();
    expect((await service.prices()).KZT?.delivery).toBe(1_500_00);
    rows.set(REFERENCE_KEYS.prices, {
      ...DEFAULT_PRICES,
      KZT: { ...DEFAULT_PRICES.KZT!, delivery: 900_00 },
    });
    expect((await service.prices()).KZT?.delivery).toBe(1_500_00);
    jest.advanceTimersByTime(CACHE_MS + 1);
    expect((await service.prices()).KZT?.delivery).toBe(900_00);
  });

  it('does not keep a failed read', async () => {
    const { service, setting } = settingsStore();
    setting.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.prices()).rejects.toThrow('db down');
    expect(await service.prices()).toEqual(DEFAULT_PRICES);
  });
});

describe('ReferenceService edits', () => {
  it('refuses invalid prices and cities', async () => {
    const { service, setting } = settingsStore();
    await expect(
      service.setPrices({
        ...DEFAULT_PRICES,
        KZT: { ...DEFAULT_PRICES.KZT!, delivery: -5 },
      }),
    ).rejects.toThrow();
    await expect(
      service.setCities([...DEFAULT_CITIES, DEFAULT_CITIES[0]]),
    ).rejects.toThrow();
    expect(setting.upsert).not.toHaveBeenCalled();
  });

  it('prices orders by the stored free-delivery cities', async () => {
    const { service } = settingsStore();
    await service.setCities(
      DEFAULT_CITIES.map((c) => ({ ...c, freeDelivery: c.id === 'taraz' })),
    );
    expect(
      await quote(service, 'square-210', 'soft', 1, 'taraz'),
    ).toMatchObject({
      subtotal: kzt(9_900_00),
      delivery: kzt(0),
      total: kzt(9_900_00),
    });
    expect(
      (await quote(service, 'square-210', 'soft', 1, 'almaty')).delivery,
    ).toEqual(kzt(1_500_00));
  });
});

describe('ReferenceService formats', () => {
  it('seeds the formats with the square book at the cover prices the owner had set', async () => {
    const { service, rows } = settingsStore({
      [REFERENCE_KEYS.prices]: {
        ...DEFAULT_PRICES,
        covers: { soft: 8800, hard: 13800 },
      },
    });
    await service.onModuleInit();
    const formats = rows.get(REFERENCE_KEYS.formats) as typeof DEFAULT_FORMATS;
    expect(formats.map((f) => f.id)).toEqual([
      'square-210',
      'a4-landscape',
      'a5-portrait',
    ]);
    expect(formats[0].prices).toEqual({
      ...DEFAULT_FORMATS[0].prices,
      KZT: { soft: 8_800_00, hard: 13_800_00 },
    });
    expect(formats[1].prices).toEqual(DEFAULT_FORMATS[1].prices);
  });

  it('offers only published formats on the site and refuses an unpublished one', async () => {
    const { service } = settingsStore();
    await service.setFormats(
      DEFAULT_FORMATS.map((f) => ({
        ...f,
        published: f.id !== 'a4-landscape',
      })),
    );
    expect((await service.public()).formats.map((f) => f.id)).toEqual([
      'square-210',
      'a5-portrait',
    ]);
    expect((await service.admin()).formats).toHaveLength(3);
    await expect(service.publishedFormat('a4-landscape')).rejects.toThrow(
      BadRequestException,
    );
    expect((await service.defaultFormat()).id).toBe('square-210');
  });
});

describe('ReferenceService blocked countries', () => {
  it('blocks the owner’s extra countries on top of Meta’s list', async () => {
    const { service, rows } = settingsStore();
    const result = await service.setExtraBlocked(['nl', 'DE']);

    expect(rows.get(REFERENCE_KEYS.extraBlocked)).toEqual(['NL', 'DE']);
    expect(result.extra).toEqual(['NL', 'DE']);
    expect(result.meta.map((c) => c.code)).toEqual(
      Object.keys(RESTRICTED_COUNTRIES),
    );
    expect(await service.blocked('NL')).toBe(true);
    expect(await service.blocked('RU')).toBe(true);
    expect(await service.blocked('KZ')).toBe(false);
  });

  it('can never unblock a country on Meta’s list', async () => {
    const { service, rows } = settingsStore();
    await service.setExtraBlocked([]);
    for (const code of Object.keys(RESTRICTED_COUNTRIES)) {
      expect(await service.blocked(code)).toBe(true);
    }
    // Even a stored value that tried to list (or leave out) Meta's countries changes nothing.
    rows.set(REFERENCE_KEYS.extraBlocked, ['RU']);
    service.invalidate();
    expect(await service.blocked('RU')).toBe(true);
    expect((await service.admin()).blocked.meta).toContainEqual({
      code: 'RU',
      name: 'Russia',
    });
  });

  it('refuses a Meta-listed code as an extra, saying so', async () => {
    const { service, setting } = settingsStore();
    const error = await service
      .setExtraBlocked(['NL', 'ru'])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: COUNTRY_POLICY_BLOCKED,
      countries: ['RU'],
    });
    expect(setting.upsert).not.toHaveBeenCalled();
  });

  it('refuses codes that are not ISO countries', async () => {
    const { service } = settingsStore();
    await expect(service.setExtraBlocked(['XX'])).rejects.toThrow();
    await expect(service.setExtraBlocked(['NL', 'NL'])).rejects.toThrow();
  });
});

describe('ReferenceService countries', () => {
  const kz = DEFAULT_COUNTRIES[0];
  const de = DEFAULT_COUNTRIES.find((c) => c.code === 'DE')!;

  it('stores the owner’s list in order and prices by each country’s currency', async () => {
    const { service, rows } = settingsStore();
    const saved = await service.setCountries([
      { ...de, code: 'nl' },
      { ...kz, currency: 'USD', print: false },
    ]);
    expect(saved.map((c) => c.code)).toEqual(['NL', 'KZ']);
    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(saved);
    expect((await service.public()).countries).toEqual(saved);
    expect(await service.bookPrice('template', 'KZ')).toEqual({
      amount: 3_90,
      currency: 'USD',
    });
    // Uzbekistan is no longer listed: it is "other", in dollars.
    expect((await service.bookPrice('template', 'UZ'))?.currency).toBe('USD');
  });

  it('refuses a Meta-listed code, saying so', async () => {
    const { service, setting } = settingsStore();
    const error = await service
      .setCountries([kz, { ...de, code: 'ru' }])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: COUNTRY_POLICY_BLOCKED,
      countries: ['RU'],
    });
    expect(setting.upsert).not.toHaveBeenCalled();
  });

  it('refuses a country the owner blocked, and hides one blocked later', async () => {
    const { service } = settingsStore();
    await service.setExtraBlocked(['NL']);
    const error = await service
      .setCountries([kz, { ...de, code: 'NL' }])
      .catch((e: unknown) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: COUNTRY_BLOCKED,
      countries: ['NL'],
    });

    await service.setExtraBlocked(['DE']);
    expect((await service.public()).countries.map((c) => c.code)).not.toContain(
      'DE',
    );
    expect((await service.admin()).countries.map((c) => c.code)).toContain(
      'DE',
    );
  });

  it('takes print in any currency, priced in it', async () => {
    const { service } = settingsStore();
    await service.setCountries([kz, { ...de, currency: 'EUR', print: true }]);
    expect(await service.infoFor('DE')).toMatchObject({
      currency: 'EUR',
      print: true,
    });
    const format = await service.offeredFormat('square-210', 'DE');
    expect(format.prices?.soft).toEqual({ amount: 18_90, currency: 'EUR' });
  });

  it('takes the country chosen on the site, else the IP’s, else other', async () => {
    const { service } = settingsStore();
    expect(await service.visitorCountry('PL', 'KZ')).toBe('PL');
    expect(await service.visitorCountry('other', 'KZ')).toBe('other');
    expect(await service.visitorCountry('NL', 'KZ')).toBe('other');
    expect(await service.visitorCountry(undefined, 'UZ')).toBe('UZ');
    expect(await service.visitorCountry(undefined, null)).toBe('other');
  });

  it('refuses an empty list, duplicates and unknown codes', async () => {
    const { service } = settingsStore();
    await expect(service.setCountries([])).rejects.toThrow();
    await expect(service.setCountries([kz, kz])).rejects.toThrow();
    await expect(
      service.setCountries([{ ...kz, code: 'XX' }]),
    ).rejects.toThrow();
  });
});

describe('ReferenceService FAQ', () => {
  it('stores the list and gives the site only the published entries', async () => {
    const { service, rows } = settingsStore();
    const [first, second] = DEFAULT_FAQ;
    const saved = await service.setFaq([
      { ...second, published: false },
      { ...first, q: { ru: ' Вопрос ', en: 'Question' } },
    ]);
    expect(rows.get(REFERENCE_KEYS.faq)).toEqual(saved);
    expect(saved[1].q).toEqual({ ru: 'Вопрос', en: 'Question' });
    expect((await service.public()).faq.map((i) => i.id)).toEqual([first.id]);
    expect((await service.admin()).faq).toHaveLength(2);
  });

  it('refuses an entry without the base languages', async () => {
    const { service, setting } = settingsStore();
    await expect(
      service.setFaq([{ ...DEFAULT_FAQ[0], a: { kk: 'Жауап' } }]),
    ).rejects.toThrow();
    expect(setting.upsert).not.toHaveBeenCalled();
  });
});

describe('ReferenceService country prices and landing', () => {
  const de = {
    currency: 'USD' as const,
    books: { template: 4_90, custom: 6_90 },
  };

  it("prices a country from its own list, the others from their currency's default, until it is cleared", async () => {
    const { service, rows } = settingsStore();
    await service.setCountryPrices('DE', de);
    expect(rows.get(REFERENCE_KEYS.countryPrices)).toEqual({ DE: de });
    expect(await service.bookPrice('template', 'DE')).toEqual({
      amount: 4_90,
      currency: 'USD',
    });
    expect((await service.bookPrice('template', 'AT'))?.amount).toBe(3_90);
    expect((await service.public()).countryPrices).toEqual({ DE: de });
    await service.setCountryPrices('DE', null);
    expect((await service.bookPrice('template', 'DE'))?.amount).toBe(3_90);
  });

  it("refuses a country's prices in another currency than it charges in", async () => {
    const { service, setting } = settingsStore();
    await expect(
      service.setCountryPrices('DE', { ...de, currency: 'EUR' }),
    ).rejects.toMatchObject({
      response: { code: 'currency_mismatch', expected: 'USD' },
    });
    await expect(
      service.setCountryDelivery('KZ', {
        currency: 'USD',
        fee: 5_00,
        freeEverywhere: false,
      }),
    ).rejects.toMatchObject({ response: { code: 'currency_mismatch' } });
    await expect(
      service.setCountryFormats('KZ', {
        'square-210': { prices: { currency: 'EUR', soft: 10_00, hard: 20_00 } },
      }),
    ).rejects.toMatchObject({ response: { code: 'currency_mismatch' } });
    // A print partner's cost may be in any currency.
    await service.setCountryFormats('KZ', {
      'square-210': { cost: { currency: 'EUR', soft: 6_00, hard: 9_00 } },
    });
    expect(setting.upsert).toHaveBeenCalledTimes(1);
  });

  it("sets one currency's default book prices and delivery fee, keeping the others", async () => {
    const { service } = settingsStore();
    await service.setDefaultBookPrices({
      currency: 'EUR',
      books: { template: 4_50, custom: 6_50 },
    });
    await service.setDeliveryFee('EUR', 5_90);
    const prices = await service.prices();
    expect(prices.EUR).toEqual({
      books: { template: 4_50, custom: 6_50 },
      delivery: 5_90,
    });
    expect(prices.KZT).toEqual(DEFAULT_PRICES.KZT);
    await expect(
      service.setDefaultBookPrices({
        currency: 'KZT',
        books: { template: 1_900_50, custom: 2_900_00 },
      }),
    ).rejects.toThrow();
  });

  it("delivers an order at its country's own fee", async () => {
    const { service } = settingsStore({
      [REFERENCE_KEYS.countryDelivery]: {
        KZ: { currency: 'KZT', fee: 2_500_00, freeEverywhere: false },
      },
    });
    const price = await quote(service, 'square-210', 'soft', 1, 'shymkent');
    expect(price.delivery).toEqual(kzt(2_500_00));
  });

  it('keeps landing overrides by country and refuses a country the site does not offer', async () => {
    const { service } = settingsStore();
    await service.setLanding('DE', {
      hero: { de: { title: 'Hallo' } },
      faqHidden: [],
      faq: [],
      hiddenSections: [],
    });
    expect((await service.public()).landing.DE.hero.de?.title).toBe('Hallo');
    await expect(service.setLanding('FR', null)).rejects.toMatchObject({
      response: { code: 'country_unknown' },
    });
    await expect(service.setCountryPrices('FR', de)).rejects.toThrow(
      BadRequestException,
    );
    await service.setLanding('DE', null);
    expect((await service.admin()).landing).toEqual({});
  });
});

describe('ReferenceService per-country cities and formats', () => {
  const berlin = {
    id: 'berlin',
    country: 'DE',
    name: { ru: 'Берлин', en: 'Berlin' },
    freeDelivery: true,
  };

  it("replaces one country's cities and keeps the others", async () => {
    const { service } = settingsStore();
    expect(await service.setCountryCities('DE', [berlin])).toEqual([berlin]);
    expect(await service.citiesFor('DE')).toEqual([berlin]);
    expect(await service.citiesFor('KZ')).toEqual(DEFAULT_CITIES);
    // A city sent for Germany is Germany's, whatever it says.
    await service.setCountryCities('DE', [
      berlin,
      {
        ...berlin,
        id: 'munich',
        country: 'KZ',
        name: { ru: 'Мюнхен', en: 'Munich' },
      },
    ]);
    expect((await service.citiesFor('DE')).map((c) => c.id)).toEqual([
      'berlin',
      'munich',
    ]);
    expect(await service.citiesFor('KZ')).toEqual(DEFAULT_CITIES);
    await expect(
      service.setCountryCities('DE', [{ ...berlin, id: 'almaty' }]),
    ).rejects.toMatchObject({ response: { code: 'city_id_taken' } });
    await service.setCountryCities('DE', []);
    expect(await service.citiesFor('DE')).toEqual([]);
  });

  it("offers and prices formats per country, and orders only to the country's cities", async () => {
    const { service } = settingsStore();
    const [square, a4] = DEFAULT_FORMATS;
    await service.setCountryFormats('KZ', {
      [square.id]: { published: false },
      [a4.id]: { prices: { currency: 'KZT', soft: 5_000_00, hard: 8_000_00 } },
    });
    await expect(service.offeredFormat(square.id, 'KZ')).rejects.toThrow(
      BadRequestException,
    );
    expect((await service.offeredFormat(a4.id, 'KZ')).prices?.soft).toEqual(
      kzt(5_000_00),
    );
    expect((await service.offeredFormat(a4.id, 'UZ')).prices?.soft).toEqual({
      amount: a4.prices.USD!.soft,
      currency: 'USD',
    });
    // Offered somewhere: its sizes may still lay a book out.
    expect((await service.publishedFormat(square.id)).id).toBe(square.id);
    await expect(
      service.setCountryFormats('KZ', { nope: { published: true } }),
    ).rejects.toMatchObject({ response: { code: 'format_unknown' } });
    await service.setCountryCities('DE', [berlin]);
    // Berlin is not a Kazakh city: an order from Kazakhstan pays the fee there.
    expect((await quote(service, a4.id, 'soft', 1, 'berlin')).delivery).toEqual(
      kzt(DEFAULT_PRICES.KZT!.delivery),
    );
  });
});
