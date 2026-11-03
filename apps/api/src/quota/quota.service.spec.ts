import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_COUNTRIES,
  DEFAULT_PRICES,
  bookPrice,
  countryInfo,
  type BookKind,
  type CountryEntry,
  type Currency,
  type DefaultPrices,
} from '@fabulka/shared';
import type { FxService } from '../fx/fx.service';
import { PaymentsService } from '../payments/payments.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReferenceService } from '../reference/reference.service';
import { QuotaService } from './quota.service';

function makeService(
  prisma: unknown,
  prices: DefaultPrices = DEFAULT_PRICES,
  countries: CountryEntry[] = DEFAULT_COUNTRIES,
) {
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'FREE_BOOKS' ? 3 : fallback,
  };
  const reference = {
    bookPrice: (kind: BookKind, country: string) =>
      Promise.resolve(bookPrice(kind, country, { prices, countries })),
    infoFor: (country: string) =>
      Promise.resolve(countryInfo(country, countries)),
  } as unknown as ReferenceService;
  const fx = {
    decimalToUsd: (currency: Currency) =>
      Promise.resolve(
        currency === 'USD'
          ? new Prisma.Decimal(1)
          : currency === 'KZT'
            ? new Prisma.Decimal('0.002')
            : null,
      ),
  } as unknown as FxService;
  return new QuotaService(
    prisma as PrismaService,
    config as unknown as ConfigService,
    reference,
    fx,
    new PaymentsService(prisma as PrismaService, reference),
  );
}

type CreditData = {
  books: number;
  currency: string;
  amount: number;
  paymentStatus: string;
};

/** A visitor with two books made and the purchases recorded so far. */
function prismaWith(credits: (CreditData & { id?: string })[] = []) {
  const create = jest.fn(({ data }: { data: CreditData }) => {
    const row = { ...data, id: `c${credits.length + 1}` };
    credits.push(row);
    return Promise.resolve(row);
  });
  const update = jest.fn(
    ({ where, data }: { where: { id: string }; data: Partial<CreditData> }) => {
      const row = credits.find((c) => c.id === where.id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  );
  const remove = jest.fn(({ where }: { where: { id: string } }) => {
    credits.splice(
      credits.findIndex((c) => c.id === where.id),
      1,
    );
    return Promise.resolve({});
  });
  return {
    create,
    update,
    credits,
    prisma: {
      book: { count: jest.fn().mockResolvedValue(2) },
      credit: {
        create,
        update,
        delete: remove,
        aggregate: jest.fn(({ where }: { where: { paymentStatus?: string } }) =>
          Promise.resolve({
            _sum: {
              books: credits
                .filter(
                  (c) =>
                    !where.paymentStatus ||
                    c.paymentStatus === where.paymentStatus,
                )
                .reduce((sum, c) => sum + c.books, 0),
            },
          }),
        ),
      },
    },
  };
}

describe('QuotaService.buyBook', () => {
  it('records a catalog book at the catalog price, in tiyn, with the rate and a paid manual payment', async () => {
    const { prisma, create, credits } = prismaWith();
    const { quota, price } = await makeService(prisma).buyBook(
      'k',
      'template',
      'KZ',
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        clientKey: 'k',
        books: 1,
        kind: 'template',
        currency: 'KZT',
        unitAmount: 1_900_00,
        amount: 1_900_00,
        fxToUsd: new Prisma.Decimal('0.002'),
        paymentStatus: 'pending',
      },
    });
    expect(credits[0]).toMatchObject({
      paymentProvider: 'manual',
      paymentId: 'manual_c1',
      paymentStatus: 'paid',
    });
    expect(price).toEqual({ amount: 1_900_00, currency: 'KZT' });
    expect(quota).toMatchObject({ used: 2, limit: 4, remaining: 2 });
  });

  it('records a story of your own at its higher price', async () => {
    const { prisma, create } = prismaWith();
    await makeService(prisma).buyBook('k', 'custom', 'KZ');

    expect(create.mock.calls[0][0].data).toMatchObject({
      currency: 'KZT',
      amount: 2_900_00,
    });
  });

  it('charges a country priced in dollars in dollars, and one in euros in euros', async () => {
    const { prisma, create } = prismaWith();
    const { price } = await makeService(prisma).buyBook('k', 'template', 'PL');
    expect(price).toEqual({ amount: 3_90, currency: 'USD' });
    expect(create.mock.calls[0][0].data).toMatchObject({
      currency: 'USD',
      amount: 3_90,
    });

    const euro = DEFAULT_COUNTRIES.map((c) =>
      c.code === 'DE' ? { ...c, currency: 'EUR' as const } : c,
    );
    const { price: eur } = await makeService(
      prisma,
      DEFAULT_PRICES,
      euro,
    ).buyBook('k', 'custom', 'DE');
    expect(eur).toEqual({ amount: 5_90, currency: 'EUR' });
    // No euro rate known: the purchase is kept without one (it shows as unconverted in reports).
    expect(create.mock.calls[1][0].data).toMatchObject({
      currency: 'EUR',
      fxToUsd: null,
    });
  });

  it('records the price the owner set in the admin', async () => {
    const { prisma, create } = prismaWith();
    const prices = {
      ...DEFAULT_PRICES,
      KZT: { books: { template: 1_900_00, custom: 3_500_00 }, delivery: 0 },
    };
    const { price } = await makeService(prisma, prices).buyBook(
      'k',
      'custom',
      'KZ',
    );

    expect(price.amount).toBe(3_500_00);
    expect(create.mock.calls[0][0].data).toMatchObject({ amount: 3_500_00 });
  });

  it('refuses when the currency has no price, and when the provider is not wired in', async () => {
    const { prisma, credits } = prismaWith();
    const euro = DEFAULT_COUNTRIES.map((c) =>
      c.code === 'DE' ? { ...c, currency: 'EUR' as const } : c,
    );
    await expect(
      makeService(prisma, { KZT: DEFAULT_PRICES.KZT }, euro).buyBook(
        'k',
        'template',
        'DE',
      ),
    ).rejects.toMatchObject({ response: { code: 'price_unset' } });
    const kaspi = DEFAULT_COUNTRIES.map((c) =>
      c.code === 'KZ' ? { ...c, payment: 'kaspi' as const } : c,
    );
    await expect(
      makeService(prisma, DEFAULT_PRICES, kaspi).buyBook('k', 'template', 'KZ'),
    ).rejects.toMatchObject({ response: { code: 'payment_unavailable' } });
    expect(credits).toHaveLength(0);
  });
});
