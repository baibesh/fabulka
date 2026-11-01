import { BadRequestException } from '@nestjs/common';
import {
  COUNTRY_BLOCKED,
  COUNTRY_POLICY_BLOCKED,
  DEFAULT_CITIES,
  DEFAULT_COUNTRIES,
  DEFAULT_FAQ,
  DEFAULT_PRICES,
  REFERENCE_KEYS,
  type Prices,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { RESTRICTED_COUNTRIES } from '../geo/restricted';
import { CACHE_MS, ReferenceService } from './reference.service';

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

const dearer: Prices = {
  ...DEFAULT_PRICES,
  books: { ...DEFAULT_PRICES.books, template: { KZT: 2500, USD: 4.5 } },
};

describe('ReferenceService seeding', () => {
  it('stores today’s prices, cities, countries and an empty extra block list when absent', async () => {
    const { service, rows } = settingsStore();
    await service.onModuleInit();

    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(DEFAULT_COUNTRIES);
    expect(rows.get(REFERENCE_KEYS.faq)).toEqual(DEFAULT_FAQ);

    expect(rows.get(REFERENCE_KEYS.prices)).toEqual(DEFAULT_PRICES);
    expect(rows.get(REFERENCE_KEYS.cities)).toEqual(DEFAULT_CITIES);
    expect(rows.get(REFERENCE_KEYS.extraBlocked)).toEqual([]);
    expect(await service.bookPrice('template')).toEqual({
      amount: 1900,
      currency: 'KZT',
    });
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
    expect((await service.prices()).books.template.KZT).toBe(2500);
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
    expect((await service.bookPrice('template', 'UZ')).amount).toBe(4.5);
    expect(setting.findMany).toHaveBeenCalledTimes(2);
  });

  it('picks up a change made elsewhere once the cache expires', async () => {
    jest.useFakeTimers();
    const { service, rows } = settingsStore();
    expect((await service.prices()).deliveryKzt).toBe(1500);
    rows.set(REFERENCE_KEYS.prices, { ...DEFAULT_PRICES, deliveryKzt: 900 });
    expect((await service.prices()).deliveryKzt).toBe(1500);
    jest.advanceTimersByTime(CACHE_MS + 1);
    expect((await service.prices()).deliveryKzt).toBe(900);
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
      service.setPrices({ ...DEFAULT_PRICES, deliveryKzt: -5 }),
    ).rejects.toThrow();
    await expect(
      service.setCities([...DEFAULT_CITIES, DEFAULT_CITIES[0]]),
    ).rejects.toThrow();
    expect(setting.upsert).not.toHaveBeenCalled();
  });

  it('prices orders by the stored free-delivery cities', async () => {
    const { service } = settingsStore();
    await service.setCities(
      DEFAULT_CITIES.map((c) => ({ ...c, freeDelivery: c.ru === 'Тараз' })),
    );
    expect(await service.orderPrice('soft', 1, 'Тараз')).toEqual({
      books: 9900,
      delivery: 0,
      total: 9900,
    });
    expect((await service.orderPrice('soft', 1, 'Алматы')).delivery).toBe(1500);
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
      { ...kz, currency: 'USD' },
    ]);
    expect(saved.map((c) => c.code)).toEqual(['NL', 'KZ']);
    expect(rows.get(REFERENCE_KEYS.countries)).toEqual(saved);
    expect((await service.public()).countries).toEqual(saved);
    expect(await service.bookPrice('template', 'KZ')).toEqual({
      amount: 3.9,
      currency: 'USD',
    });
    // Uzbekistan is no longer listed: it is "other", in dollars.
    expect((await service.bookPrice('template', 'UZ')).currency).toBe('USD');
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
