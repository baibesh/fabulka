import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  CURRENCIES,
  FxSourceSchema,
  RateSchema,
  rateString,
  scaledRate,
  type AdminFx,
  type Currency,
  type FxSource,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { mergeQuotes, parseEcb, parseNbk, type FxQuote } from './fx.parse';

/** Setting key of the superadmin's overrides: { [currency]: rate }. */
export const FX_MANUAL_KEY = 'fx.manual';
export const ECB_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const NBK_URL = 'https://nationalbank.kz/rss/rates_all.xml';
/** How often the rates are fetched again (they change once a working day). */
export const REFRESH_MS = 6 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;

/** A stored decimal as a plain decimal string without trailing zeros. */
export function decimalString(
  value: Prisma.Decimal | { toFixed(): string },
): string {
  const text = value.toFixed();
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

type Fetcher = (url: string) => Promise<string>;

const fetchText: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
};

/**
 * Exchange rates to USD, for reports only: every order and purchase records the rate of its currency
 * when it is made (fxToUsd), and dashboards show approximate dollar totals from those. Nothing is
 * ever charged at a converted price. Rates are fetched from the ECB (euro) and the National Bank of
 * Kazakhstan (tenge), no API key, every few hours (FX_REFRESH=off turns it off); a failed fetch keeps
 * the last rates. A superadmin's manual rate overrides the fetched one until cleared.
 */
@Injectable()
export class FxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FxService.name);
  private readonly enabled: boolean;
  private readonly urls: { ecb: string; nbk: string };
  private timer: NodeJS.Timeout | null = null;
  private cache: { at: number; rates: Promise<Map<Currency, string>> } | null =
    null;
  private last: {
    at: string | null;
    ok: boolean | null;
    error: string | null;
  } = {
    at: null,
    ok: null,
    error: null,
  };
  /** Replaced in tests. */
  fetcher: Fetcher = fetchText;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('FX_REFRESH', 'on') !== 'off';
    this.urls = {
      ecb: config.get<string>('FX_ECB_URL', ECB_URL),
      nbk: config.get<string>('FX_NBK_URL', NBK_URL),
    };
  }

  onModuleInit() {
    if (!this.enabled) return;
    // In the background: the API starts whether or not the sources answer.
    setTimeout(() => void this.refresh(), 0).unref();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Fetches today's rates and stores them (one row per day, currency and source). A source that fails
   * is skipped; when every source fails the last stored rates stay in use.
   */
  async refresh(): Promise<{
    ok: boolean;
    stored: number;
    error: string | null;
  }> {
    const quotes: FxQuote[] = [];
    const errors: string[] = [];
    for (const [url, parse] of [
      [this.urls.ecb, parseEcb],
      [this.urls.nbk, parseNbk],
    ] as const) {
      try {
        quotes.push(parse(await this.fetcher(url)));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const rows = mergeQuotes(quotes);
    for (const row of rows) {
      const date = new Date(`${row.date}T00:00:00Z`);
      const rateToUsd = new Prisma.Decimal(row.rate);
      await this.prisma.fxRate.upsert({
        where: {
          date_currency_source: {
            date,
            currency: row.currency,
            source: row.source,
          },
        },
        create: { date, currency: row.currency, source: row.source, rateToUsd },
        update: { rateToUsd },
      });
    }
    const error = errors.length ? errors.join('; ') : null;
    this.last = { at: new Date().toISOString(), ok: rows.length > 0, error };
    if (error)
      this.logger.warn(
        `exchange rates: ${error}${rows.length ? '' : ' (keeping the last rates)'}`,
      );
    this.invalidate();
    return { ok: rows.length > 0, stored: rows.length, error };
  }

  invalidate() {
    this.cache = null;
  }

  private async manual(): Promise<Partial<Record<Currency, string>>> {
    const row = await this.prisma.setting.findUnique({
      where: { key: FX_MANUAL_KEY },
    });
    const value = (row?.value ?? {}) as Record<string, unknown>;
    const manual: Partial<Record<Currency, string>> = {};
    for (const currency of CURRENCIES) {
      const parsed = RateSchema.safeParse(value[currency]);
      if (parsed.success) manual[currency] = parsed.data;
    }
    return manual;
  }

  /** The latest fetched rate of each currency. */
  private async fetched(): Promise<
    Map<Currency, { rate: string; source: FxSource; date: string }>
  > {
    const rows = await this.prisma.fxRate.findMany({
      where: { source: { not: 'manual' } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      distinct: ['currency'],
    });
    const map = new Map<
      Currency,
      { rate: string; source: FxSource; date: string }
    >();
    for (const row of rows) {
      const currency = CURRENCIES.find((c) => c === row.currency);
      const source = FxSourceSchema.safeParse(row.source).data;
      if (!currency || !source) continue;
      map.set(currency, {
        rate: decimalString(row.rateToUsd),
        source,
        date: row.date.toISOString().slice(0, 10),
      });
    }
    return map;
  }

  private async load(): Promise<Map<Currency, string>> {
    const [manual, fetched] = await Promise.all([
      this.manual(),
      this.fetched(),
    ]);
    const rates = new Map<Currency, string>([['USD', '1']]);
    for (const currency of CURRENCIES) {
      const rate = manual[currency] ?? fetched.get(currency)?.rate;
      if (rate && currency !== 'USD') rates.set(currency, rate);
    }
    return rates;
  }

  /** US dollars for one unit of `currency` now (the override, else the latest fetched); null when none is known. */
  async rateToUsd(currency: Currency): Promise<string | null> {
    if (currency === 'USD') return '1';
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const rates = this.load();
      rates.catch(() => {
        if (this.cache?.rates === rates) this.cache = null;
      });
      this.cache = { at: Date.now(), rates };
    }
    return (await this.cache.rates).get(currency) ?? null;
  }

  /** A rate as Prisma stores it, or null. */
  async decimalToUsd(currency: Currency): Promise<Prisma.Decimal | null> {
    const rate = await this.rateToUsd(currency).catch(() => null);
    return rate ? new Prisma.Decimal(rate) : null;
  }

  /** GET /admin/fx: each currency's rate in use, the last fetched one and the override. */
  async admin(): Promise<AdminFx> {
    const [manual, fetched] = await Promise.all([
      this.manual(),
      this.fetched(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      rates: CURRENCIES.map((currency) => {
        if (currency === 'USD') {
          return {
            currency,
            rate: '1',
            source: null,
            date: null,
            fetched: null,
            manual: null,
          };
        }
        const last = fetched.get(currency) ?? null;
        const own = manual[currency] ?? null;
        return {
          currency,
          rate: own ?? last?.rate ?? null,
          source: own ? 'manual' : (last?.source ?? null),
          date: own ? today : (last?.date ?? null),
          fetched: last,
          manual: own,
        };
      }),
      refresh: { enabled: this.enabled, ...this.last },
    };
  }

  /** The superadmin's rate for `currency` (kept until cleared), recorded as a manual row for today too. */
  async setManual(
    currency: Currency,
    rate: string,
    by: string | null,
  ): Promise<AdminFx> {
    // Kept as a plain decimal ("1.10" → "1.1"), as fetched rates are.
    const manual = {
      ...(await this.manual()),
      [currency]: rateString(scaledRate(RateSchema.parse(rate))),
    };
    await this.saveManual(manual);
    const date = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const rateToUsd = new Prisma.Decimal(manual[currency]!);
    await this.prisma.fxRate.upsert({
      where: { date_currency_source: { date, currency, source: 'manual' } },
      create: { date, currency, source: 'manual', rateToUsd, setBy: by },
      update: { rateToUsd, setBy: by },
    });
    this.invalidate();
    return this.admin();
  }

  /** Back to the fetched rate. */
  async clearManual(currency: Currency): Promise<AdminFx> {
    const manual = { ...(await this.manual()) };
    delete manual[currency];
    await this.saveManual(manual);
    this.invalidate();
    return this.admin();
  }

  /** The override of each currency (for the audit's before). */
  async overrides(): Promise<Partial<Record<Currency, string>>> {
    return this.manual();
  }

  private async saveManual(manual: Partial<Record<Currency, string>>) {
    const value = manual as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key: FX_MANUAL_KEY },
      create: { key: FX_MANUAL_KEY, value },
      update: { value },
    });
  }
}
