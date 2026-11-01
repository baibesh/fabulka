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
  CitiesSchema,
  CountriesSchema,
  DEFAULT_CITIES,
  DEFAULT_COUNTRIES,
  DEFAULT_FAQ,
  DEFAULT_FORMATS,
  DEFAULT_PRICES,
  FORMAT_UNKNOWN,
  FaqSchema,
  FormatsSchema,
  PRINT_CURRENCY,
  PricesSchema,
  REFERENCE_KEYS,
  UpdateBlockedSchema,
  bookPrice,
  countryFromIp,
  countryInfo,
  orderPrice,
  upgradeCities,
  type AdminReference,
  type BlockedCountries,
  type BookKind,
  type City,
  type Country,
  type CountryEntry,
  type Cover,
  type FaqItem,
  type Prices,
  type PrintFormat,
  type Reference,
} from '@fabulka/shared';
import type { ZodType } from 'zod';
import { sameJson } from '../common/same-json';
import { GEO_POLICY_URL, RESTRICTED_COUNTRIES } from '../geo/restricted';
import { PrismaService } from '../prisma/prisma.service';
import {
  SEEDED_COUNTRIES_V1,
  SEEDED_COUNTRIES_V2,
  SEEDED_FAQ_V1,
  SEEDED_FAQ_V2,
  SEEDED_FAQ_V3,
  SEEDED_FAQ_V4,
  SEEDED_FAQ_V5,
} from './seeded';

/** How long the reference data is kept in memory; an edit in the admin drops it at once. */
export const CACHE_MS = 60_000;

interface Snapshot {
  prices: Prices;
  cities: City[];
  /** Countries the owner blocks on top of Meta's list. */
  extraBlocked: string[];
  /** Countries the site offers, in its order; everyone else is "other". */
  countries: CountryEntry[];
  /** The landing's questions, drafts included. */
  faq: FaqItem[];
  /** Print formats, unpublished ones included. */
  formats: PrintFormat[];
}

const DEFAULTS: Snapshot = {
  prices: DEFAULT_PRICES,
  cities: DEFAULT_CITIES,
  extraBlocked: [],
  countries: DEFAULT_COUNTRIES,
  faq: DEFAULT_FAQ,
  formats: DEFAULT_FORMATS,
};

const SCHEMAS: { [K in keyof Snapshot]: ZodType<Snapshot[K]> } = {
  prices: PricesSchema,
  cities: CitiesSchema,
  extraBlocked: UpdateBlockedSchema.shape.extra,
  countries: CountriesSchema,
  faq: FaqSchema,
  formats: FormatsSchema,
};

const FIELDS = Object.keys(REFERENCE_KEYS) as (keyof Snapshot)[];

/**
 * Seeds the API stored once, by field. A stored value still equal to one of them was never edited
 * by the owner, so today's default replaces it on start; an edited one is left alone.
 */
const SEEDED: Partial<Record<keyof Snapshot, unknown[]>> = {
  countries: [SEEDED_COUNTRIES_V1, SEEDED_COUNTRIES_V2],
  faq: [SEEDED_FAQ_V1, SEEDED_FAQ_V2, SEEDED_FAQ_V3, SEEDED_FAQ_V4, SEEDED_FAQ_V5],
};

/**
 * What start-up changes in a stored value, or null to leave it: an untouched older seed becomes
 * today's default; cities stored before ids get ids from their Russian names (upgradeCities); a
 * country with print priced in anything but tenge (allowed before print was tied to the currency)
 * loses print rather than make the whole list unreadable.
 */
export function upgradeStored(field: keyof Snapshot, stored: unknown): unknown {
  if (SEEDED[field]?.some((seed) => sameJson(seed, stored))) {
    return DEFAULTS[field];
  }
  if (field === 'cities') return upgradeCities(stored);
  if (field === 'countries' && Array.isArray(stored)) {
    const list = stored as Partial<CountryEntry>[];
    if (list.some((c) => c?.print && c.currency !== PRINT_CURRENCY)) {
      return list.map((c) =>
        c?.print && c.currency !== PRINT_CURRENCY ? { ...c, print: false } : c,
      );
    }
  }
  return null;
}

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
   * before prices moved to formats (reference.prices.covers), if they had set any.
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
      f.id === 'square-210' ? { ...f, prices: { soft, hard } } : f,
    );
  }

  private async upgrade() {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: FIELDS.map((field) => REFERENCE_KEYS[field]) } },
    });
    for (const field of FIELDS) {
      const key = REFERENCE_KEYS[field];
      const row = rows.find((r) => r.key === key);
      const next = row ? upgradeStored(field, row.value) : null;
      if (next === null) continue;
      const json = next as Prisma.InputJsonValue;
      await this.prisma.setting.upsert({
        where: { key },
        create: { key, value: json },
        update: { value: json },
      });
      this.logger.log(`upgraded ${key}`);
    }
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
      prices: pick('prices'),
      cities: pick('cities'),
      extraBlocked: pick('extraBlocked'),
      countries: pick('countries'),
      faq: pick('faq'),
      formats: pick('formats'),
    };
  }

  /** Every format, unpublished ones too (an order or a book may have one that is no longer offered). */
  async formats(): Promise<PrintFormat[]> {
    return (await this.snapshot()).formats;
  }

  /** The published format with this id; 400 format_unknown otherwise. */
  async publishedFormat(id: string): Promise<PrintFormat> {
    const format = (await this.formats()).find(
      (f) => f.id === id && f.published,
    );
    if (!format) {
      throw new BadRequestException({
        code: FORMAT_UNKNOWN,
        message: `No print format ${id}`,
      });
    }
    return format;
  }

  /** The format new books are laid out in: the first published one. */
  async defaultFormat(): Promise<PrintFormat> {
    const formats = await this.formats();
    return formats.find((f) => f.published) ?? formats[0];
  }

  async setFormats(formats: PrintFormat[]): Promise<PrintFormat[]> {
    return (await this.save('formats', FormatsSchema.parse(formats))).formats;
  }

  async prices(): Promise<Prices> {
    return (await this.snapshot()).prices;
  }

  async cities(): Promise<City[]> {
    return (await this.snapshot()).cities;
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

  /** GET /reference: prices, cities, the offered countries and the published FAQ for the site. */
  async public(): Promise<Reference> {
    const { prices, cities, faq, formats } = await this.snapshot();
    return {
      prices,
      formats: formats.filter((f) => f.published),
      cities,
      countries: await this.countries(),
      faq: faq.filter((item) => item.published),
    };
  }

  async admin(): Promise<AdminReference> {
    const { prices, cities, extraBlocked, countries, faq, formats } =
      await this.snapshot();
    return {
      prices,
      formats,
      cities,
      countries,
      faq,
      blocked: blocked(extraBlocked),
    };
  }

  /**
   * The visitor's country as the site has it: the one chosen on the site (the x-country header),
   * else the one of their IP; a listed code or "other". No code at all (a local address) is
   * Kazakhstan.
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

  /** What one more book of this kind costs, at the stored prices and the country's currency. */
  async bookPrice(kind: BookKind, country: Country = 'KZ') {
    return bookPrice(
      kind,
      country,
      await this.prices(),
      await this.countries(),
    );
  }

  /** What a printed order in this format to the city with this id costs, at the stored prices and cities. */
  async orderPrice(
    format: PrintFormat,
    cover: Cover,
    quantity: number,
    cityId: string,
  ) {
    const { prices, cities } = await this.snapshot();
    return orderPrice(format, cover, quantity, cityId, prices, cities);
  }

  /**
   * Whether visitors from this ISO country are turned away: Meta's list (always, whatever the
   * admin holds) or one the owner added.
   */
  async blocked(country: string): Promise<boolean> {
    if (country in RESTRICTED_COUNTRIES) return true;
    return (await this.snapshot()).extraBlocked.includes(country);
  }

  async setPrices(prices: Prices): Promise<Prices> {
    return (await this.save('prices', PricesSchema.parse(prices))).prices;
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
