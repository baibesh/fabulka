import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { mergeQuotes, parseEcb, parseNbk } from './fx.parse';
import {
  ECB_URL,
  FX_MANUAL_KEY,
  FxService,
  NBK_URL,
  decimalString,
} from './fx.service';

const ECB = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<Cube>
		<Cube time='2026-11-02'>
			<Cube currency='USD' rate='1.1216'/>
			<Cube currency='JPY' rate='177.10'/>
			<Cube currency='GBP' rate='0.83580'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

const NBK = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <item><title>AUD</title><pubDate>03.11.2026</pubDate><description>317.96</description><quant>1</quant></item>
  <item><title>USD</title><pubDate>03.11.2026</pubDate><description>509.88</description><quant>1</quant></item>
  <item><title>JPY</title><pubDate>03.11.2026</pubDate><description>32.6</description><quant>10</quant></item>
</channel></rss>`;

describe('exchange rate feeds', () => {
  it('reads the ECB: dollars per euro, through the euro for the rest', () => {
    expect(parseEcb(ECB)).toEqual({
      source: 'ecb',
      date: '2026-11-02',
      rates: { EUR: '1.1216' },
    });
    expect(() => parseEcb('<Cube time="2026-11-02"></Cube>')).toThrow('no USD');
    expect(() => parseEcb('<html>maintenance</html>')).toThrow('no date');
  });

  it('reads the National Bank of Kazakhstan: dollars per tenge', () => {
    // 1 / 509.88 dollars for one tenge.
    expect(parseNbk(NBK)).toEqual({
      source: 'nbk',
      date: '2026-11-03',
      rates: { KZT: '0.001961245783' },
    });
    expect(() => parseNbk('<rss></rss>')).toThrow('no USD');
  });

  it('takes each currency from the first source that lists it', () => {
    expect(mergeQuotes([parseEcb(ECB), parseNbk(NBK)])).toEqual([
      {
        currency: 'KZT',
        rate: '0.001961245783',
        source: 'nbk',
        date: '2026-11-03',
      },
      { currency: 'EUR', rate: '1.1216', source: 'ecb', date: '2026-11-02' },
    ]);
    expect(mergeQuotes([])).toEqual([]);
  });

  it('writes stored decimals plainly', () => {
    expect(decimalString(new Prisma.Decimal('0.001961245783'))).toBe(
      '0.001961245783',
    );
    expect(decimalString(new Prisma.Decimal('1.120000000000'))).toBe('1.12');
    expect(decimalString(new Prisma.Decimal('0.00000001'))).toBe('0.00000001');
    expect(decimalString(new Prisma.Decimal('2'))).toBe('2');
  });
});

type Row = {
  date: Date;
  currency: string;
  source: string;
  rateToUsd: Prisma.Decimal;
  createdAt: Date;
};

function setup(manual: Record<string, string> = {}) {
  const rows: Row[] = [];
  const settings = new Map<string, unknown>([[FX_MANUAL_KEY, manual]]);
  const prisma = {
    fxRate: {
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: {
            date_currency_source: {
              date: Date;
              currency: string;
              source: string;
            };
          };
          create: Row;
          update: Partial<Row>;
        }) => {
          const key = where.date_currency_source;
          const row = rows.find(
            (r) =>
              r.date.getTime() === key.date.getTime() &&
              r.currency === key.currency &&
              r.source === key.source,
          );
          if (row) Object.assign(row, update);
          else rows.push({ ...create, createdAt: new Date() });
          return Promise.resolve({});
        },
      ),
      findMany: jest.fn(() =>
        Promise.resolve(
          [...rows]
            .filter((r) => r.source !== 'manual')
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .filter(
              (r, i, all) =>
                all.findIndex((o) => o.currency === r.currency) === i,
            ),
        ),
      ),
    },
    setting: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(
          settings.has(where.key) ? { value: settings.get(where.key) } : null,
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
          settings.set(where.key, update.value);
          return Promise.resolve({});
        },
      ),
    },
  };
  const config = {
    get: (_key: string, fallback?: unknown) => fallback,
  } as unknown as ConfigService;
  const fx = new FxService(prisma as unknown as PrismaService, config);
  return { fx, rows };
}

describe('FxService', () => {
  it('stores fetched rates and gives each currency its rate; USD is always 1', async () => {
    const { fx, rows } = setup();
    fx.fetcher = (url) => Promise.resolve(url === ECB_URL ? ECB : NBK);
    expect(await fx.refresh()).toEqual({ ok: true, stored: 2, error: null });
    expect(rows).toHaveLength(2);
    expect(await fx.rateToUsd('EUR')).toBe('1.1216');
    expect(await fx.rateToUsd('KZT')).toBe('0.001961245783');
    expect(await fx.rateToUsd('USD')).toBe('1');
  });

  it('keeps the last rates when the sources fail', async () => {
    const { fx } = setup();
    fx.fetcher = (url) => Promise.resolve(url === ECB_URL ? ECB : NBK);
    await fx.refresh();
    fx.fetcher = () => Promise.reject(new Error('offline'));
    const result = await fx.refresh();
    expect(result).toMatchObject({ ok: false, stored: 0 });
    expect(result.error).toContain('offline');
    expect(await fx.rateToUsd('EUR')).toBe('1.1216');
    expect((await fx.admin()).refresh).toMatchObject({
      enabled: true,
      ok: false,
    });
  });

  it('keeps going with one source when the other fails', async () => {
    const { fx } = setup();
    fx.fetcher = (url) =>
      url === NBK_URL
        ? Promise.resolve(NBK)
        : Promise.reject(new Error('ECB down'));
    expect(await fx.refresh()).toEqual({
      ok: true,
      stored: 1,
      error: 'ECB down',
    });
    expect(await fx.rateToUsd('KZT')).toBe('0.001961245783');
    expect(await fx.rateToUsd('EUR')).toBeNull();
  });

  it("uses a superadmin's rate over the fetched one until it is cleared", async () => {
    const { fx, rows } = setup();
    fx.fetcher = (url) => Promise.resolve(url === ECB_URL ? ECB : NBK);
    await fx.refresh();
    const after = await fx.setManual('EUR', '1.20', 'admin@e2e.test');
    expect(after.rates.find((r) => r.currency === 'EUR')).toMatchObject({
      rate: '1.2',
      source: 'manual',
      manual: '1.2',
      fetched: { rate: '1.1216' },
    });
    expect(await fx.rateToUsd('EUR')).toBe('1.2');
    expect(
      rows.some((r) => r.source === 'manual' && r.currency === 'EUR'),
    ).toBe(true);
    // A refresh does not overwrite the override.
    await fx.refresh();
    expect(await fx.rateToUsd('EUR')).toBe('1.2');
    await fx.clearManual('EUR');
    expect(await fx.rateToUsd('EUR')).toBe('1.1216');
    expect(await fx.decimalToUsd('EUR')).toEqual(new Prisma.Decimal('1.1216'));
  });
});
