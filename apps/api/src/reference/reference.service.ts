import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  COUNTRY_POLICY_BLOCKED,
  CitiesSchema,
  DEFAULT_CITIES,
  DEFAULT_PRICES,
  PricesSchema,
  REFERENCE_KEYS,
  UpdateBlockedSchema,
  bookPrice,
  orderPrice,
  type AdminReference,
  type BlockedCountries,
  type BookKind,
  type City,
  type Country,
  type Cover,
  type Prices,
  type Reference,
} from '@fabulka/shared';
import type { ZodType } from 'zod';
import { GEO_POLICY_URL, RESTRICTED_COUNTRIES } from '../geo/restricted';
import { PrismaService } from '../prisma/prisma.service';

/** How long the reference data is kept in memory; an edit in the admin drops it at once. */
export const CACHE_MS = 60_000;

interface Snapshot {
  prices: Prices;
  cities: City[];
  /** Countries the owner blocks on top of Meta's list. */
  extraBlocked: string[];
}

const DEFAULTS: Snapshot = {
  prices: DEFAULT_PRICES,
  cities: DEFAULT_CITIES,
  extraBlocked: [],
};

const SCHEMAS: { [K in keyof Snapshot]: ZodType<Snapshot[K]> } = {
  prices: PricesSchema,
  cities: CitiesSchema,
  extraBlocked: UpdateBlockedSchema.shape.extra,
};

const FIELDS = Object.keys(REFERENCE_KEYS) as (keyof Snapshot)[];

/**
 * Reference data the owner edits in the admin (prices, delivery cities, extra blocked countries),
 * kept in the Setting table. Every purchase, order and API request reads it, so it is cached in
 * memory (one process serves the API) and dropped on each edit.
 */
@Injectable()
export class ReferenceService implements OnModuleInit {
  private readonly logger = new Logger(ReferenceService.name);
  private cache: { at: number; value: Promise<Snapshot> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Stores today's defaults for the keys that are missing; never overwrites the owner's edits. */
  async onModuleInit() {
    const { count } = await this.prisma.setting.createMany({
      data: FIELDS.map((field) => ({
        key: REFERENCE_KEYS[field],
        value: DEFAULTS[field],
      })),
      skipDuplicates: true,
    });
    if (count) this.logger.log(`seeded ${count} reference settings`);
    this.invalidate();
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
    };
  }

  async prices(): Promise<Prices> {
    return (await this.snapshot()).prices;
  }

  async cities(): Promise<City[]> {
    return (await this.snapshot()).cities;
  }

  /** GET /reference: prices and cities for the site. */
  async public(): Promise<Reference> {
    const { prices, cities } = await this.snapshot();
    return { prices, cities };
  }

  async admin(): Promise<AdminReference> {
    const { prices, cities, extraBlocked } = await this.snapshot();
    return { prices, cities, blocked: blocked(extraBlocked) };
  }

  /** What one more book of this kind costs, at the stored prices. */
  async bookPrice(kind: BookKind, country: Country = 'KZ') {
    return bookPrice(kind, country, await this.prices());
  }

  /** What a printed order costs, at the stored prices and free-delivery cities. */
  async orderPrice(cover: Cover, quantity: number, city: string) {
    const { prices, cities } = await this.snapshot();
    return orderPrice(cover, quantity, city, prices, cities);
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
