import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  COUNTRY_BLOCKED,
  COUNTRY_POLICY_BLOCKED,
  COUNTRY_UNKNOWN,
  CITY_ID_TAKEN,
  CitiesSchema,
  CountriesSchema,
  CountryCitiesSchema,
  CountryDeliveriesSchema,
  CountryDeliverySchema,
  CountryFormatOverridesSchema,
  CountryFormatsSchema,
  CountryLandingSchema,
  CountryPricesSchema,
  BookPricesSchema,
  DefaultPricesSchema,
  LandingOverridesSchema,
  DEFAULT_CITIES,
  DEFAULT_COUNTRIES,
  DEFAULT_FAQ,
  DEFAULT_FORMATS,
  DEFAULT_PRICES,
  FORMAT_UNKNOWN,
  FaqSchema,
  FormatsSchema,
  REFERENCE_KEYS,
  UpdateBlockedSchema,
  bookPrice,
  countryFromIp,
  countryInfo,
  citiesOf,
  deliveryFor,
  formatsFor,
  quoteOrder,
  upgradeCities,
  type AdminReference,
  type BlockedCountries,
  type BookKind,
  type BookPrices,
  type City,
  type Currency,
  type DefaultPrices,
  type LocalFormat,
  type Money,
  type OrderQuote,
  type Country,
  type CountryEntry,
  type CountryDeliveries,
  type CountryDelivery,
  type CountryFormatOverrides,
  type CountryFormats,
  type CountryLanding,
  type CountryPrices,
  type LandingOverrides,
  type Cover,
  type FaqItem,
  type PrintFormat,
  type Reference,
} from '@fabulka/shared';
import type { ZodType } from 'zod';
import { sameJson } from '../common/same-json';
import { GEO_POLICY_URL, RESTRICTED_COUNTRIES } from '../geo/restricted';
import { PrismaService } from '../prisma/prisma.service';
import {
  LINEUP_KEY,
  LINEUP_VERSION,
  describeLineup,
  launchLineup,
  type LineupFlag,
} from './launch-lineup';
import { upgradeMoneySettings } from './money-upgrade';
import {
  SEEDED_FAQ_V1,
  SEEDED_FAQ_V2,
  SEEDED_FAQ_V3,
  SEEDED_FAQ_V4,
  SEEDED_FAQ_V5,
  SEEDED_FAQ_V6,
} from './seeded';

/** How long the reference data is kept in memory; an edit in the admin drops it at once. */
export const CACHE_MS = 60_000;

interface Snapshot {
  /** Each currency's default book prices and delivery fee. */
  prices: DefaultPrices;
  cities: City[];
  /** Countries the owner blocks on top of Meta's list. */
  extraBlocked: string[];
  /** Countries the site offers, in its order; everyone else is "other". */
  countries: CountryEntry[];
  /** The landing's questions, drafts included. */
  faq: FaqItem[];
  /** Print formats, unpublished ones included. */
  formats: PrintFormat[];
  /** Countries priced from their own list. */
  countryPrices: CountryPrices;
  /** Countries' landing overrides. */
  landing: LandingOverrides;
  /** Countries' own delivery fee and free-delivery rule. */
  countryDelivery: CountryDeliveries;
  /** Countries' own format offer and cover prices. */
  countryFormats: CountryFormats;
}

const DEFAULTS: Snapshot = {
  prices: DEFAULT_PRICES,
  cities: DEFAULT_CITIES,
  extraBlocked: [],
  countries: DEFAULT_COUNTRIES,
  faq: DEFAULT_FAQ,
  formats: DEFAULT_FORMATS,
  countryPrices: {},
  landing: {},
  countryDelivery: {},
  countryFormats: {},
};

const SCHEMAS: { [K in keyof Snapshot]: ZodType<Snapshot[K]> } = {
  prices: DefaultPricesSchema,
  cities: CitiesSchema,
  extraBlocked: UpdateBlockedSchema.shape.extra,
  countries: CountriesSchema,
  faq: FaqSchema,
  formats: FormatsSchema,
  countryPrices: CountryPricesSchema,
  landing: LandingOverridesSchema,
  countryDelivery: CountryDeliveriesSchema,
  countryFormats: CountryFormatsSchema,
};

const FIELDS = Object.keys(REFERENCE_KEYS) as (keyof Snapshot)[];

/**
 * Seeds the API stored once, by field. A stored value still equal to one of them was never edited
 * by the owner, so today's default replaces it on start; an edited one is left alone. The countries'
 * older seeds become the launch lineup once (launch-lineup.ts), not here.
 */
const SEEDED: Partial<Record<keyof Snapshot, unknown[]>> = {
  faq: [
    SEEDED_FAQ_V1,
    SEEDED_FAQ_V2,
    SEEDED_FAQ_V3,
    SEEDED_FAQ_V4,
    SEEDED_FAQ_V5,
    SEEDED_FAQ_V6,
  ],
};

/**
 * Stored default prices with a list for every currency the code knows: a currency added since (the
 * Canadian and Australian dollar, ringgit, franc) gets today's default list; the stored lists are
 * kept exactly as they are. Null when nothing is missing (or the value is not a price list yet).
 */
export function addMissingCurrencies(stored: unknown): DefaultPrices | null {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored))
    return null;
  const parsed = DefaultPricesSchema.safeParse(stored);
  if (!parsed.success) return null;
  const missing = (
    Object.keys(DEFAULT_PRICES) as (keyof typeof DEFAULT_PRICES)[]
  ).filter((currency) => !parsed.data[currency]);
  if (!missing.length) return null;
  const next: DefaultPrices = {
    ...(stored as DefaultPrices),
  };
  for (const currency of missing) next[currency] = DEFAULT_PRICES[currency];
  return next;
}

/**
 * What start-up changes in a stored value, or null to leave it: an untouched older seed becomes
 * today's default; cities stored before ids get ids from their Russian names (upgradeCities). Money
 * stored before minor units is upgraded across fields (upgradeMoneySettings).
 */
export function upgradeStored(field: keyof Snapshot, stored: unknown): unknown {
  if (SEEDED[field]?.some((seed) => sameJson(seed, stored))) {
    return DEFAULTS[field];
  }
  if (field === 'cities') return upgradeCities(stored);
  return null;
}

/** A 400 when a price is saved in another currency than the country charges in. */
export const CURRENCY_MISMATCH = 'currency_mismatch';

/**
 * Reference data the owner edits in the admin (prices, delivery cities, the countries the site
 * offers, the landing's FAQ, extra blocked countries),
 * kept in the Setting table. Every purchase, order and API request reads it, so it is cached in
 * memory (one process serves the API) and dropped on each edit.
 */
@Injectable()
export class ReferenceService implements OnModuleInit {
  private readonly logger = new Logger(ReferenceService.name);
  private cache: { at: number; value: Promise<Snapshot> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores today's defaults for the keys that are missing, and upgrades stored values the owner
   * never edited (see upgradeStored); never overwrites the owner's edits.
   */
  async onModuleInit() {
    const formats = await this.seedFormats();
    const { count } = await this.prisma.setting.createMany({
      data: FIELDS.map((field) => ({
        key: REFERENCE_KEYS[field],
        value: field === 'formats' ? formats : DEFAULTS[field],
      })),
      skipDuplicates: true,
    });
    if (count) this.logger.log(`seeded ${count} reference settings`);
    await this.upgrade();
    this.invalidate();
  }

  /**
   * The formats to seed: today's defaults, with the square book at the cover prices the owner set
   * before prices moved to formats (reference.prices.covers, whole tenge), if they had set any.
   */
  private async seedFormats(): Promise<PrintFormat[]> {
    const [row] = await this.prisma.setting.findMany({
      where: { key: { in: [REFERENCE_KEYS.prices] } },
    });
    const covers = (
      row?.value as { covers?: { soft?: unknown; hard?: unknown } }
    )?.covers;
    const soft = Number(covers?.soft);
    const hard = Number(covers?.hard);
    if (!(soft > 0 && hard > 0)) return DEFAULT_FORMATS;
    return DEFAULT_FORMATS.map((f) =>
      f.id === 'square-210'
        ? {
            ...f,
            prices: {
              ...f.prices,
              KZT: {
                soft: Math.round(soft) * 100,
                hard: Math.round(hard) * 100,
              },
            },
          }
        : f,
    );
  }

  private async upgrade() {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: FIELDS.map((field) => REFERENCE_KEYS[field]) } },
    });
    const values = new Map<keyof Snapshot, unknown>();
    for (const field of FIELDS) {
      const row = rows.find((r) => r.key === REFERENCE_KEYS[field]);
      if (row) values.set(field, row.value);
    }
    const changed = new Map<keyof Snapshot, unknown>();
    for (const [field, value] of values) {
      const next = upgradeStored(field, value);
      if (next !== null) {
        changed.set(field, next);
        values.set(field, next);
      }
    }
    // Money stored before minor units and currencies (see money-upgrade.ts).
    const money = upgradeMoneySettings({
      prices: values.get('prices'),
      formats: values.get('formats'),
      countries: values.get('countries'),
      countryPrices: values.get('countryPrices'),
      countryDelivery: values.get('countryDelivery'),
      countryFormats: values.get('countryFormats'),
    });
    for (const [field, value] of Object.entries(money)) {
      changed.set(field as keyof Snapshot, value);
      values.set(field as keyof Snapshot, value);
    }
    // Currencies added in code get their default list; stored lists stay as they are.
    const prices = addMissingCurrencies(values.get('prices'));
    if (prices) {
      changed.set('prices', prices);
      this.logger.log(
        `added default prices for ${Object.keys(prices)
          .filter((c) => !(values.get('prices') as Record<string, unknown>)[c])
          .join(', ')}`,
      );
      values.set('prices', prices);
    }
    // The launch country lineup, once (launch-lineup.ts).
    const lineup = await this.applyLineup(values.get('countries'));
    if (lineup) changed.set('countries', lineup);
    for (const [field, next] of changed) {
      const key = REFERENCE_KEYS[field];
      const json = next as Prisma.InputJsonValue;
      await this.prisma.setting.upsert({
        where: { key },
        create: { key, value: json },
        update: { value: json },
      });
      this.logger.log(`upgraded ${key}`);
    }
  }

  /**
   * The launch lineup, on the first start that has none recorded: the countries it becomes (null
   * to leave them), with the outcome stored under LINEUP_KEY so it never runs again, whatever the
   * owner does with the list afterwards.
   */
  private async applyLineup(stored: unknown): Promise<CountryEntry[] | null> {
    const done = await this.prisma.setting.findUnique({
      where: { key: LINEUP_KEY },
    });
    if (done) return null;
    const { countries, outcome } = launchLineup(stored);
    const flag: LineupFlag = {
      version: LINEUP_VERSION,
      at: new Date().toISOString(),
      outcome,
    };
    await this.prisma.setting.create({
      data: {
        key: LINEUP_KEY,
        value: flag as unknown as Prisma.InputJsonValue,
      },
    });
    const line = describeLineup(outcome);
    if (outcome.action === 'skipped') this.logger.warn(line);
    else this.logger.log(line);
    return countries;
  }

  invalidate() {
    this.cache = null;
  }

  private snapshot(): Promise<Snapshot> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const value = this.load();
      // A failed read is not kept: the next request asks the database again.
      value.catch(() => {
        if (this.cache?.value === value) this.cache = null;
      });
      this.cache = { at: Date.now(), value };
    }
    return this.cache.value;
  }

  /** The stored values; a missing or broken one falls back to its default rather than failing. */
  private async load(): Promise<Snapshot> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: FIELDS.map((field) => REFERENCE_KEYS[field]) } },
    });
    const pick = <K extends keyof Snapshot>(field: K): Snapshot[K] => {
      const row = rows.find((r) => r.key === REFERENCE_KEYS[field]);
      if (!row) return DEFAULTS[field];
      const parsed = SCHEMAS[field].safeParse(row.value);
      if (parsed.success) return parsed.data;
      this.logger.warn(`${row.key} is not valid, using the default`);
      return DEFAULTS[field];
    };
    return {
      // A currency the stored list has no entry for gets today's default for it (a currency added in code).
      prices: { ...DEFAULT_PRICES, ...pick('prices') },
      cities: pick('cities'),
      extraBlocked: pick('extraBlocked'),
      countries: pick('countries'),
      faq: pick('faq'),
      formats: pick('formats'),
      countryPrices: pick('countryPrices'),
      landing: pick('landing'),
      countryDelivery: pick('countryDelivery'),
      countryFormats: pick('countryFormats'),
    };
  }

  /** Every format, unpublished ones too (an order or a book may have one that is no longer offered). */
  async formats(): Promise<PrintFormat[]> {
    return (await this.snapshot()).formats;
  }

  /**
   * The format with this id offered anywhere (globally, or switched on by some country), for its
   * sizes. 400 format_unknown otherwise.
   */
  async publishedFormat(id: string): Promise<PrintFormat> {
    const { formats, countryFormats } = await this.snapshot();
    const format = formats.find(
      (f) =>
        f.id === id &&
        (f.published ||
          Object.values(countryFormats).some((o) => o[id]?.published)),
    );
    if (!format) throw formatUnknown(id);
    return format;
  }

  /**
   * The format with this id as `country` offers it: switched on there and priced in its currency
   * (formatsFor). 400 format_unknown otherwise.
   */
  async offeredFormat(id: string, country: Country): Promise<LocalFormat> {
    const format = formatsFor(country, await this.pricing()).find(
      (f) => f.id === id && f.published && f.prices,
    );
    if (!format) throw formatUnknown(id);
    return format;
  }

  /** What the pricing helpers read (prices, formats, the countries' own, the offered countries). */
  private async pricing() {
    const snapshot = await this.snapshot();
    return { ...snapshot, countries: await this.countries() };
  }

  /** The format new books are laid out in: the first published one. */
  async defaultFormat(): Promise<PrintFormat> {
    const formats = await this.formats();
    return formats.find((f) => f.published) ?? formats[0];
  }

  async setFormats(formats: PrintFormat[]): Promise<PrintFormat[]> {
    return (await this.save('formats', FormatsSchema.parse(formats))).formats;
  }

  async prices(): Promise<DefaultPrices> {
    return (await this.snapshot()).prices;
  }

  async cities(): Promise<City[]> {
    return (await this.snapshot()).cities;
  }

  /** The cities of one country, in order: where an order from there may go. */
  async citiesFor(country: Country): Promise<City[]> {
    return citiesOf(country, (await this.snapshot()).cities);
  }

  /**
   * The countries the site offers. A blocked one (Meta's list, or the owner's added after it was
   * listed) is left out: its visitors are turned away anyway.
   */
  async countries(): Promise<CountryEntry[]> {
    const { countries, extraBlocked } = await this.snapshot();
    return countries.filter(
      (c) =>
        !(c.code in RESTRICTED_COUNTRIES) && !extraBlocked.includes(c.code),
    );
  }

  /**
   * GET /reference: prices (the global list and the countries' own), cities, the offered countries,
   * the published FAQ and the countries' landing overrides for the site.
   */
  async public(): Promise<Reference> {
    const {
      prices,
      cities,
      faq,
      formats,
      countryPrices,
      landing,
      countryDelivery,
      countryFormats,
    } = await this.snapshot();
    return {
      prices,
      // A format nobody offers stays off the site; one some country offers comes with its global flag.
      formats: formats.filter(
        (f) =>
          f.published ||
          Object.values(countryFormats).some((o) => o[f.id]?.published),
      ),
      countryDelivery,
      countryFormats,
      cities,
      countries: await this.countries(),
      faq: faq.filter((item) => item.published),
      countryPrices,
      // A country's draft questions stay off the site, like the shared ones.
      landing: Object.fromEntries(
        Object.entries(landing).map(([code, own]) => [
          code,
          { ...own, faq: own.faq.filter((item) => item.published) },
        ]),
      ),
    };
  }

  async admin(): Promise<AdminReference> {
    const {
      prices,
      cities,
      extraBlocked,
      countries,
      faq,
      formats,
      countryPrices,
      landing,
      countryDelivery,
      countryFormats,
    } = await this.snapshot();
    return {
      prices,
      formats,
      cities,
      countries,
      faq,
      countryPrices,
      landing,
      countryDelivery,
      countryFormats,
      blocked: blocked(extraBlocked),
    };
  }

  /**
   * The visitor's country as the site has it: the one chosen on the site (the x-country header),
   * else the one of their IP; a listed code or "other". No code at all (a local or unknown
   * address) is "other" too, as on the site.
   */
  async visitorCountry(
    chosen: string | undefined,
    ipCountry: string | null,
  ): Promise<Country> {
    return countryFromIp(chosen ?? ipCountry, await this.countries());
  }

  /** What the site offers in the visitor's country (languages, currency, print). */
  async infoFor(country: Country) {
    return countryInfo(country, await this.countries());
  }

  /**
   * What one more book of this kind costs in `country`, in its currency: its own book prices when it
   * has them in that currency, else the currency's default. Null when the currency has no price.
   */
  async bookPrice(
    kind: BookKind,
    country: Country = 'KZ',
  ): Promise<Money | null> {
    return bookPrice(kind, country, await this.pricing());
  }

  /**
   * What a printed order of this book from `country` in this format to the city with this id costs,
   * in the country's currency, at its prices (its own, else its currency's default) and the stored
   * cities. Null when the currency has no delivery fee to charge.
   */
  async quote(
    bookId: string,
    format: LocalFormat,
    cover: Cover,
    quantity: number,
    cityId: string,
    country: Country = 'KZ',
  ): Promise<OrderQuote | null> {
    const pricing = await this.pricing();
    try {
      return quoteOrder({
        bookId,
        format,
        cover,
        quantity,
        cityId,
        delivery: deliveryFor(country, pricing),
        cities: citiesOf(country, pricing.cities),
      });
    } catch {
      return null;
    }
  }

  /** 400 currency_mismatch unless `currency` is what `country` charges in. */
  async assertCurrency(country: string, currency: Currency): Promise<void> {
    const expected = (await this.infoFor(country)).currency;
    if (expected === currency) return;
    throw new BadRequestException({
      code: CURRENCY_MISMATCH,
      expected,
      message: `${country} charges in ${expected}, not ${currency}`,
    });
  }

  /**
   * One country's cities, in order (replacing the ones it had; other countries' stay). Ids stay
   * those the cities have (orders refer to them); a new one must not be another country's: 400
   * city_id_taken.
   */
  async setCountryCities(country: string, cities: City[]): Promise<City[]> {
    await this.assertOffered(country);
    const own = CountryCitiesSchema.parse(cities).map((c) => ({
      ...c,
      country,
    }));
    const { cities: all } = await this.snapshot();
    const others = all.filter((c) => c.country !== country);
    const taken = own.filter((c) => others.some((o) => o.id === c.id));
    if (taken.length) {
      throw new BadRequestException({
        code: CITY_ID_TAKEN,
        cities: taken.map((c) => c.id),
        message: `${taken.map((c) => c.id).join(', ')}: another country has a city with this id`,
      });
    }
    const next = CitiesSchema.parse([...others, ...own]);
    return citiesOf(country, (await this.save('cities', next)).cities);
  }

  /**
   * The country's own delivery fee and rule (in its currency; the partner's cost in any), or null for
   * its currency's default fee again. 400 currency_mismatch for a fee in another currency.
   */
  async setCountryDelivery(
    country: string,
    delivery: CountryDelivery | null,
  ): Promise<CountryDeliveries> {
    await this.assertOffered(country);
    const { countryDelivery } = await this.snapshot();
    const next = { ...countryDelivery };
    if (delivery) {
      const parsed = CountryDeliverySchema.parse(delivery);
      await this.assertCurrency(country, parsed.currency);
      next[country] = parsed;
    } else delete next[country];
    return (await this.save('countryDelivery', next)).countryDelivery;
  }

  /** One currency's default delivery fee: countries charging in it without their own pay it. */
  async setDeliveryFee(
    currency: Currency,
    fee: number,
  ): Promise<DefaultPrices> {
    const { prices } = await this.snapshot();
    const list = prices[currency] ?? DEFAULT_PRICES[currency];
    if (!list)
      throw new BadRequestException(`No default prices in ${currency} yet`);
    return this.setPrices({
      ...prices,
      [currency]: { ...list, delivery: fee },
    });
  }

  /** One currency's default book prices: countries charging in it without their own pay them. */
  async setDefaultBookPrices(prices: BookPrices): Promise<DefaultPrices> {
    const parsed = BookPricesSchema.parse(prices);
    const { prices: all } = await this.snapshot();
    const list = all[parsed.currency] ?? DEFAULT_PRICES[parsed.currency];
    const delivery = list?.delivery ?? 0;
    return this.setPrices({
      ...all,
      [parsed.currency]: { books: parsed.books, delivery },
    });
  }

  /**
   * The country's own format offer and cover prices (by format id; only formats there are), or
   * null to follow the global formats again. 400 format_unknown for an unknown id.
   */
  async setCountryFormats(
    country: string,
    overrides: CountryFormatOverrides | null,
  ): Promise<CountryFormats> {
    await this.assertOffered(country);
    const { countryFormats, formats } = await this.snapshot();
    const next = { ...countryFormats };
    if (overrides) {
      const parsed = CountryFormatOverridesSchema.parse(overrides);
      for (const o of Object.values(parsed)) {
        if (o.prices) await this.assertCurrency(country, o.prices.currency);
      }
      const unknown = Object.keys(parsed).filter(
        (id) => !formats.some((f) => f.id === id),
      );
      if (unknown.length) throw formatUnknown(unknown.join(', '));
      next[country] = parsed;
    } else delete next[country];
    return (await this.save('countryFormats', next)).countryFormats;
  }

  /**
   * The country's own book prices (in its currency), or null to price it from its currency's default
   * again. 400 country_unknown for a country the site does not offer, currency_mismatch for prices
   * in another currency than it charges in.
   */
  async setCountryPrices(
    country: string,
    prices: BookPrices | null,
  ): Promise<CountryPrices> {
    await this.assertOffered(country);
    const { countryPrices } = await this.snapshot();
    const next = { ...countryPrices };
    if (prices) {
      const parsed = BookPricesSchema.parse(prices);
      await this.assertCurrency(country, parsed.currency);
      next[country] = parsed;
    } else delete next[country];
    return (await this.save('countryPrices', next)).countryPrices;
  }

  /**
   * The country's landing overrides, or null to show it the defaults again. Overrides without
   * `images` keep the pictures the country has (they are set one by one: setLandingImages).
   */
  async setLanding(
    country: string,
    landing: CountryLanding | null,
  ): Promise<LandingOverrides> {
    await this.assertOffered(country);
    const { landing: all } = await this.snapshot();
    const next = { ...all };
    if (landing) {
      const parsed = CountryLandingSchema.parse(landing);
      const images = parsed.images ?? all[country]?.images;
      next[country] = { ...parsed, ...(images && { images }) };
    } else delete next[country];
    return (await this.save('landing', next)).landing;
  }

  /** The country's landing pictures (by slot and language), the rest of its overrides as they are. */
  async setLandingImages(
    country: string,
    images: NonNullable<CountryLanding['images']>,
  ): Promise<CountryLanding> {
    await this.assertOffered(country);
    const { landing: all } = await this.snapshot();
    const current = all[country] ?? CountryLandingSchema.parse({});
    const next = CountryLandingSchema.parse({ ...current, images });
    return (await this.save('landing', { ...all, [country]: next })).landing[
      country
    ];
  }

  /** 400 country_unknown unless the site offers the country (reference.countries, less blocked ones). */
  private async assertOffered(country: string): Promise<void> {
    if ((await this.countries()).some((c) => c.code === country)) return;
    throw new BadRequestException({
      code: COUNTRY_UNKNOWN,
      message: `${country} is not one of the countries the site offers`,
    });
  }

  /**
   * Whether visitors from this ISO country are turned away: Meta's list (always, whatever the
   * admin holds) or one the owner added.
   */
  async blocked(country: string): Promise<boolean> {
    if (country in RESTRICTED_COUNTRIES) return true;
    return (await this.snapshot()).extraBlocked.includes(country);
  }

  /** Every currency's default prices at once. */
  async setPrices(prices: DefaultPrices): Promise<DefaultPrices> {
    return (await this.save('prices', DefaultPricesSchema.parse(prices)))
      .prices;
  }

  async setCities(cities: City[]): Promise<City[]> {
    return (await this.save('cities', CitiesSchema.parse(cities))).cities;
  }

  /** The landing's questions, in order, drafts included. */
  async setFaq(faq: FaqItem[]): Promise<FaqItem[]> {
    return (await this.save('faq', FaqSchema.parse(faq))).faq;
  }

  /**
   * The countries the site offers. A blocked code is refused, saying which list blocks it: Meta's
   * (country_policy_blocked, never offered) or the owner's (country_blocked, unblock it first).
   */
  async setCountries(countries: CountryEntry[]): Promise<CountryEntry[]> {
    const list = CountriesSchema.parse(countries);
    const codes = list.map((c) => c.code);
    const meta = codes.filter((code) => code in RESTRICTED_COUNTRIES);
    if (meta.length) {
      throw new BadRequestException({
        code: COUNTRY_POLICY_BLOCKED,
        countries: meta,
        message: `${meta.join(', ')}: blocked by Meta's policy, cannot be offered`,
      });
    }
    const { extraBlocked } = await this.snapshot();
    const extra = codes.filter((code) => extraBlocked.includes(code));
    if (extra.length) {
      throw new BadRequestException({
        code: COUNTRY_BLOCKED,
        countries: extra,
        message: `${extra.join(', ')}: blocked in the admin, unblock it first`,
      });
    }
    return (await this.save('countries', list)).countries;
  }

  /**
   * The countries the owner blocks on top of Meta's list. A code on Meta's list is refused: it is
   * blocked anyway, and the admin must never look like it decides about those.
   */
  async setExtraBlocked(codes: string[]): Promise<BlockedCountries> {
    const extra = UpdateBlockedSchema.parse({ extra: codes }).extra;
    const meta = extra.filter((code) => code in RESTRICTED_COUNTRIES);
    if (meta.length) {
      throw new BadRequestException({
        code: COUNTRY_POLICY_BLOCKED,
        countries: meta,
        message: `${meta.join(', ')}: already blocked by Meta's policy`,
      });
    }
    return blocked((await this.save('extraBlocked', extra)).extraBlocked);
  }

  private async save<K extends keyof Snapshot>(
    field: K,
    value: Snapshot[K],
  ): Promise<Snapshot> {
    const key = REFERENCE_KEYS[field];
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: json },
      update: { value: json },
    });
    this.invalidate();
    return this.snapshot();
  }
}

function formatUnknown(id: string) {
  return new BadRequestException({
    code: FORMAT_UNKNOWN,
    message: `No print format ${id}`,
  });
}

function blocked(extra: string[]): BlockedCountries {
  return {
    meta: Object.entries(RESTRICTED_COUNTRIES).map(([code, name]) => ({
      code,
      name,
    })),
    extra,
    policyUrl: GEO_POLICY_URL,
  };
}
