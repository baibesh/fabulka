import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_COUNTRIES,
  DEFAULT_PRICES,
  bookPrice,
  type BookKind,
  type Prices,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReferenceService } from '../reference/reference.service';
import { QuotaService } from './quota.service';

function makeService(prisma: unknown, prices: Prices = DEFAULT_PRICES) {
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'FREE_BOOKS' ? 3 : fallback,
  };
  return new QuotaService(
    prisma as PrismaService,
    config as unknown as ConfigService,
    {
      bookPrice: (kind: BookKind, country: string) =>
        Promise.resolve(bookPrice(kind, country, prices, DEFAULT_COUNTRIES)),
    } as unknown as ReferenceService,
  );
}

/** A visitor with two books made and the purchases recorded so far. */
function prismaWith(
  credits: { books: number; priceKzt: number; priceUsd: number }[] = [],
) {
  const create = jest.fn(({ data }: { data: (typeof credits)[number] }) => {
    credits.push(data);
    return Promise.resolve(data);
  });
  return {
    create,
    prisma: {
      book: { count: jest.fn().mockResolvedValue(2) },
      credit: {
        create,
        aggregate: jest.fn(() =>
          Promise.resolve({
            _sum: { books: credits.reduce((sum, c) => sum + c.books, 0) },
          }),
        ),
      },
    },
  };
}

describe('QuotaService.buyBook', () => {
  it('records a catalog book at the catalog price', async () => {
    const { prisma, create } = prismaWith();
    const { quota, price } = await makeService(prisma).buyBook(
      'k',
      'template',
      'KZ',
    );

    expect(create).toHaveBeenCalledWith({
      data: { clientKey: 'k', books: 1, priceKzt: 1900, priceUsd: 0 },
    });
    expect(price).toEqual({ amount: 1900, currency: 'KZT' });
    expect(quota).toMatchObject({ used: 2, limit: 4, remaining: 2 });
  });

  it('records a story of your own at its higher price', async () => {
    const { prisma, create } = prismaWith();
    await makeService(prisma).buyBook('k', 'custom', 'KZ');

    expect(create).toHaveBeenCalledWith({
      data: { clientKey: 'k', books: 1, priceKzt: 2900, priceUsd: 0 },
    });
  });

  it('charges a country priced in dollars in dollars', async () => {
    const { prisma, create } = prismaWith();
    const { price } = await makeService(prisma).buyBook('k', 'template', 'PL');

    expect(price).toEqual({ amount: 3.9, currency: 'USD' });
    expect(create).toHaveBeenCalledWith({
      data: { clientKey: 'k', books: 1, priceKzt: 0, priceUsd: 3.9 },
    });
  });

  it('records the price the owner set in the admin', async () => {
    const { prisma, create } = prismaWith();
    const prices = {
      ...DEFAULT_PRICES,
      books: { ...DEFAULT_PRICES.books, custom: { KZT: 3500, USD: 7 } },
    };
    const { price } = await makeService(prisma, prices).buyBook(
      'k',
      'custom',
      'KZ',
    );

    expect(price.amount).toBe(3500);
    expect(create).toHaveBeenCalledWith({
      data: { clientKey: 'k', books: 1, priceKzt: 3500, priceUsd: 0 },
    });
  });
});
