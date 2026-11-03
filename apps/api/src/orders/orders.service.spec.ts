import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  CreateOrderSchema,
  CITY_UNKNOWN,
  PRINT_UNAVAILABLE,
  DEFAULT_CITIES,
  DEFAULT_PRICES,
  REFERENCE_KEYS,
  BOOK_FORMATS,
  DEFAULT_FORMATS,
  FORMAT_UNKNOWN,
  legacyLayout,
  BUILTIN_ROLES,
  DEFAULT_COUNTRIES,
  SUPER_ROLE,
  accessOf,
} from '@fabulka/shared';
import type { BooksService } from '../books/books.service';
import type { MailService } from '../mail/mail.service';
import type { PdfService } from '../pdf/pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import type { FxService } from '../fx/fx.service';
import { PaymentsService } from '../payments/payments.service';
import { Prisma } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { backfilledCountry } from './orders.service';

const SUPER = accessOf([SUPER_ROLE], BUILTIN_ROLES, []);
const DE = accessOf(['country_manager'], BUILTIN_ROLES, ['DE']);
import { OrdersService, ownsOrder } from './orders.service';

const book = {
  id: 'b1',
  clientKey: 'k',
  userId: null,
  status: 'done',
  title: 'Книга',
  language: 'ru',
};

/** An order service over a done book, with the owner's prices and cities stored. */
function makeService(
  stored: Record<string, unknown>,
  rates: Record<string, string> = { KZT: '0.002' },
) {
  let created: Record<string, unknown> = {};
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    created = { id: 'o1', status: null, createdAt: new Date(), ...data };
    return Promise.resolve(created);
  });
  const prisma = {
    book: { findUnique: jest.fn().mockResolvedValue(book) },
    order: {
      create,
      delete: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      // After the payment: the created row with the payment, its book, stages and lines.
      update: jest.fn(
        ({
          data,
        }: {
          data: Record<string, unknown>;
        }): Promise<Record<string, unknown>> => {
          const { lines, events, ...rest } = { ...created, ...data } as Record<
            string,
            unknown
          > & {
            lines?: { create: unknown[] };
            events?: { create: { status: string } };
          };
          return Promise.resolve({
            ...rest,
            book,
            events: events
              ? [{ ...events.create, note: null, createdAt: new Date() }]
              : [],
            lines: lines?.create ?? [],
          });
        },
      ),
    },
    setting: {
      findMany: () =>
        Promise.resolve(
          Object.entries(stored).map(([key, value]) => ({ key, value })),
        ),
    },
  };
  const mail = { send: jest.fn(), publicUrl: 'http://localhost' };
  // The book is already in the format asked for (or switching re-renders it): its layout comes back.
  const books = {
    ensureFormat: jest.fn((_: string, format: string) =>
      Promise.resolve({ ...legacyLayout(), format: BOOK_FORMATS[format] }),
    ),
  };
  const reference = new ReferenceService(prisma as unknown as PrismaService);
  const fx = {
    decimalToUsd: (currency: string) =>
      Promise.resolve(
        currency === 'USD'
          ? new Prisma.Decimal(1)
          : rates[currency]
            ? new Prisma.Decimal(rates[currency])
            : null,
      ),
  } as unknown as FxService;
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    { get: (_: string, fallback: unknown) => fallback } as ConfigService,
    reference,
    new StorageService({
      get: (_: string, fallback: unknown) => fallback,
    } as ConfigService),
    books as unknown as BooksService,
    {} as PdfService,
    fx,
    new PaymentsService(prisma as unknown as PrismaService, reference),
  );
  return { service, create, prisma, mail, books };
}

const kzt = (amount: number) => ({ amount, currency: 'KZT' });

const body = {
  bookId: 'b1',
  recipientName: 'Айгерим',
  phone: '+7 701 123 45 67',
  email: 'a@example.com',
  cityId: 'shymkent',
  address: 'ул. Абая, 1',
  cover: 'hard',
  quantity: 2,
};

describe('OrdersService.create', () => {
  it('totals the order with the owner’s prices, ignoring amounts the client sends', async () => {
    const { service, create } = makeService({
      [REFERENCE_KEYS.prices]: {
        ...DEFAULT_PRICES,
        KZT: { ...DEFAULT_PRICES.KZT, delivery: 700_00 },
      },
      [REFERENCE_KEYS.formats]: DEFAULT_FORMATS.map((f) =>
        f.id === 'square-210'
          ? {
              ...f,
              prices: { ...f.prices, KZT: { soft: 5_000_00, hard: 8_000_00 } },
            }
          : f,
      ),
      [REFERENCE_KEYS.cities]: DEFAULT_CITIES,
    });
    const input = CreateOrderSchema.parse({
      ...body,
      booksKzt: 1,
      deliveryKzt: 0,
      totalKzt: 1,
    });
    const order = await service.create(input, 'k');

    expect(order).toMatchObject({
      currency: 'KZT',
      subtotal: kzt(16_000_00),
      delivery: kzt(700_00),
      total: kzt(16_700_00),
      lines: [
        {
          bookId: 'b1',
          format: 'square-210',
          cover: 'hard',
          quantity: 2,
          unit: kzt(8_000_00),
          total: kzt(16_000_00),
        },
      ],
      payment: { provider: 'manual', status: 'paid' },
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      currency: 'KZT',
      itemsAmount: 16_000_00,
      deliveryAmount: 700_00,
      totalAmount: 16_700_00,
      fxToUsd: new Prisma.Decimal('0.002'),
      paymentStatus: 'pending',
      lines: {
        create: [
          {
            position: 0,
            bookId: 'b1',
            format: 'square-210',
            cover: 'hard',
            quantity: 2,
            unitAmount: 8_000_00,
            lineAmount: 16_000_00,
            unitCost: null,
          },
        ],
      },
    });
  });

  it('snapshots a euro order in euros with its rate and the print partner’s costs', async () => {
    const countries = DEFAULT_COUNTRIES.map((c) =>
      c.code === 'DE' ? { ...c, currency: 'EUR' as const, print: true } : c,
    );
    const { service, create } = makeService(
      {
        [REFERENCE_KEYS.countries]: countries,
        [REFERENCE_KEYS.cities]: [
          ...DEFAULT_CITIES,
          {
            id: 'berlin',
            country: 'DE',
            name: { ru: 'Берлин', en: 'Berlin' },
            freeDelivery: false,
          },
        ],
        [REFERENCE_KEYS.countryFormats]: {
          DE: {
            'square-210': { cost: { currency: 'EUR', soft: 6_00, hard: 9_50 } },
          },
        },
        [REFERENCE_KEYS.countryDelivery]: {
          DE: {
            currency: 'EUR',
            fee: 4_90,
            freeEverywhere: false,
            cost: { amount: 3_00, currency: 'EUR' },
          },
        },
      },
      { EUR: '1.12' },
    );
    const order = await service.create(
      CreateOrderSchema.parse({
        ...body,
        phone: '+49 151 2345 6789',
        cityId: 'berlin',
        locale: 'de',
      }),
      'k',
      null,
      'DE',
    );
    expect(order).toMatchObject({
      currency: 'EUR',
      lines: [
        {
          unit: { amount: 27_90, currency: 'EUR' },
          total: { amount: 55_80, currency: 'EUR' },
        },
      ],
      delivery: { amount: 4_90, currency: 'EUR' },
      total: { amount: 60_70, currency: 'EUR' },
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      country: 'DE',
      fxToUsd: new Prisma.Decimal('1.12'),
      deliveryCost: 3_00,
      deliveryCostCurrency: 'EUR',
      lines: {
        create: [
          {
            unitCost: 9_50,
            costCurrency: 'EUR',
            costFxToUsd: new Prisma.Decimal('1.12'),
          },
        ],
      },
    });
  });

  it('delivers free to the cities the owner marked', async () => {
    const { service } = makeService({
      [REFERENCE_KEYS.prices]: DEFAULT_PRICES,
      [REFERENCE_KEYS.cities]: DEFAULT_CITIES.map((c) => ({
        ...c,
        freeDelivery: c.id === 'shymkent',
      })),
    });
    const order = await service.create(CreateOrderSchema.parse(body), 'k');

    expect(order).toMatchObject({
      subtotal: kzt(29_800_00),
      delivery: kzt(0),
      total: kzt(29_800_00),
    });
  });

  it('stores the city’s id and its Russian name', async () => {
    const { service, create } = makeService({});
    await service.create(
      CreateOrderSchema.parse({ ...body, cityId: 'ust-kamenogorsk' }),
      'k',
    );
    expect(create.mock.calls[0][0].data).toMatchObject({
      city: 'Усть-Каменогорск',
      cityId: 'ust-kamenogorsk',
    });
  });

  it('refuses a city that is not on the list', async () => {
    const { service, create } = makeService({});
    const error = await service
      .create(CreateOrderSchema.parse({ ...body, cityId: 'tirana' }), 'k')
      .catch((e: unknown) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: CITY_UNKNOWN,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an order from a country without print', async () => {
    const { service, create } = makeService({});
    const error = await service
      .create(CreateOrderSchema.parse(body), 'k', null, 'PL')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: PRINT_UNAVAILABLE,
    });
    await expect(
      service.create(CreateOrderSchema.parse(body), 'k', null, 'other'),
    ).rejects.toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('prices the copies by the format picked and lays the book out at it', async () => {
    const { service, books, create } = makeService({});
    const order = await service.create(
      CreateOrderSchema.parse({
        ...body,
        cover: 'soft',
        quantity: 1,
        format: 'a4-landscape',
      }),
      'k',
    );
    expect(books.ensureFormat).toHaveBeenCalledWith('b1', 'a4-landscape');
    expect(order).toMatchObject({
      subtotal: kzt(13_900_00),
      format: { id: 'a4-landscape', widthMm: 297 },
    });
    expect(create.mock.calls[0][0].data.layout).toMatchObject({
      format: { id: 'a4-landscape' },
    });
  });

  it('refuses a format that is not published', async () => {
    const { service, create } = makeService({
      [REFERENCE_KEYS.formats]: DEFAULT_FORMATS.map((f) => ({
        ...f,
        published: f.id !== 'a5-portrait',
      })),
    });
    const error = await service
      .create(CreateOrderSchema.parse({ ...body, format: 'a5-portrait' }), 'k')
      .catch((e: unknown) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: FORMAT_UNKNOWN,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the launch prices until the owner changes them', async () => {
    const { service } = makeService({});
    const order = await service.create(
      CreateOrderSchema.parse({ ...body, cover: 'soft', quantity: 1 }),
      'k',
    );
    expect(order).toMatchObject({
      subtotal: kzt(9_900_00),
      delivery: kzt(1_500_00),
    });
  });

  it('refuses up front where the payment provider is not wired in yet', async () => {
    const { service, create } = makeService({
      [REFERENCE_KEYS.countries]: DEFAULT_COUNTRIES.map((c) =>
        c.code === 'KZ' ? { ...c, payment: 'kaspi' } : c,
      ),
    });
    await expect(
      service.create(CreateOrderSchema.parse(body), 'k'),
    ).rejects.toMatchObject({ response: { code: 'payment_unavailable' } });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('OrdersService.create (owner and history)', () => {
  it('keeps the visitor key, the account and the first stage', async () => {
    const { service, create, prisma } = makeService({});
    const order = await service.create(
      CreateOrderSchema.parse(body),
      'k',
      'user-1',
    );
    expect(create.mock.calls[0][0].data).toMatchObject({
      clientKey: 'k',
      userId: 'user-1',
    });
    // Paid by hand at once: the first stage comes with the payment.
    expect(callArg(prisma.order.update, 0).data).toMatchObject({
      paymentProvider: 'manual',
      paymentId: 'manual_o1',
      paymentStatus: 'paid',
      events: { create: { status: 'paid' } },
    });
    expect(order.history.map((e) => e.status)).toEqual(['paid']);
    expect(order.phoneMasked).toBe('+7 *** *** 45 67');
  });

  it('stores no account for an anonymous order', async () => {
    const { service, create } = makeService({});
    await service.create(CreateOrderSchema.parse(body), 'k');
    expect(create.mock.calls[0][0].data).toMatchObject({
      clientKey: 'k',
      userId: null,
    });
  });
});

describe('order ownership', () => {
  it('lets only the browser see an anonymous order', () => {
    const order = { clientKey: 'k', userId: null };
    expect(ownsOrder(order, 'k')).toBe(true);
    expect(ownsOrder(order, 'k', 'user-1')).toBe(true);
    expect(ownsOrder(order, 'other')).toBe(false);
  });

  it('lets only the account see an order that moved to it', () => {
    const order = { clientKey: 'k', userId: 'user-1' };
    expect(ownsOrder(order, 'other', 'user-1')).toBe(true);
    expect(ownsOrder(order, 'k')).toBe(false);
    expect(ownsOrder(order, 'k', 'user-2')).toBe(false);
  });

  it('answers 404 to anyone else', async () => {
    const { service, prisma } = makeService({});
    prisma.order.findUnique.mockResolvedValue(orderRow({ clientKey: 'k' }));
    await expect(service.get('o1', 'stranger')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.get('o1', 'k')).resolves.toMatchObject({ id: 'o1' });
  });

  it('lists the account’s orders and this browser’s anonymous ones', async () => {
    const { service, prisma } = makeService({});
    await service.mine('k', 'user-1');
    expect(callArg(prisma.order.findMany, 0).where).toEqual({
      OR: [{ userId: 'user-1' }, { clientKey: 'k', userId: null }],
    });
    await service.mine('k');
    expect(callArg(prisma.order.findMany, 1).where).toEqual({
      clientKey: 'k',
      userId: null,
    });
  });
});

describe('OrdersService.setStatus (history)', () => {
  it('writes the new stage with the note', async () => {
    const { service, prisma, mail } = makeService({});
    const before = orderRow({ status: 'printing' });
    prisma.order.findUnique.mockResolvedValue(before);
    prisma.order.update.mockResolvedValue({ ...before, status: 'shipped' });
    await service.setStatus('o1', 'shipped', 'KZ123', SUPER);
    expect(callArg(prisma.order.update, 0).data).toEqual({
      status: 'shipped',
      events: {
        createMany: { data: [{ status: 'shipped', note: 'KZ123' }] },
      },
    });
    expect(mail.send).toHaveBeenCalled();
  });

  it('keeps the timer’s stages passed before a stage set by hand', async () => {
    const { service, prisma } = makeService({});
    // The timer (20 s a stage by default) is at "shipped" after 50 s.
    const createdAt = new Date(Date.now() - 50_000);
    const before = orderRow({ status: null, createdAt });
    prisma.order.findUnique.mockResolvedValue(before);
    prisma.order.update.mockResolvedValue({ ...before, status: 'delivered' });
    await service.setStatus('o1', 'delivered', undefined, SUPER);
    const { events } = callArg(prisma.order.update, 0).data as {
      events: { createMany: { data: { status: string; createdAt?: Date }[] } };
    };
    const data = events.createMany.data;
    expect(data.map((e) => e.status)).toEqual([
      'printing',
      'shipped',
      'delivered',
    ]);
    expect(data[0].createdAt).toEqual(new Date(createdAt.getTime() + 20_000));
  });

  it('writes nothing when the stage stays and there is no note', async () => {
    const { service, prisma, mail } = makeService({});
    const before = orderRow({ status: 'printing' });
    prisma.order.findUnique.mockResolvedValue(before);
    prisma.order.update.mockResolvedValue(before);
    await service.setStatus('o1', 'printing', undefined, SUPER);
    expect(callArg(prisma.order.update, 0).data).toEqual({
      status: 'printing',
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('shows the timer’s stages in the history while it runs the order', async () => {
    const { service, prisma } = makeService({});
    const createdAt = new Date(Date.now() - 30_000);
    prisma.order.findUnique.mockResolvedValue(
      orderRow({ status: null, createdAt }),
    );
    const order = await service.get('o1', 'k');
    expect(order.status).toBe('printing');
    expect(order.history.map((e) => e.status)).toEqual(['paid', 'printing']);
  });
});

describe('OrdersService: country scope', () => {
  it("lists a manager's countries' orders only, narrowed to the working country", async () => {
    const { service, prisma } = makeService({});
    await service.list(DE);
    expect(callArg(prisma.order.findMany, 0).where).toEqual({
      country: { in: ['DE'] },
    });
    await service.list(SUPER);
    expect(callArg(prisma.order.findMany, 1).where).toBeUndefined();
    await service.list(SUPER, 'kz');
    expect(callArg(prisma.order.findMany, 2).where).toEqual({
      country: { in: ['KZ'] },
    });
    // A working country outside the manager's: nothing, without asking the database.
    expect(await service.list(DE, 'KZ')).toEqual([]);
    expect(prisma.order.findMany).toHaveBeenCalledTimes(3);
  });

  it("refuses a manager another country's order, and one with no country", async () => {
    const { service, prisma } = makeService({});
    const code = (promise: Promise<unknown>) =>
      promise.then(
        () => 'ok',
        (error: { getResponse(): { code: string } }) =>
          error.getResponse().code,
      );
    prisma.order.findUnique.mockResolvedValue(orderRow({ country: 'KZ' }));
    expect(await code(service.setStatus('o1', 'shipped', undefined, DE))).toBe(
      'scope_forbidden',
    );
    expect(await code(service.printFile('o1', DE))).toBe('scope_forbidden');
    prisma.order.findUnique.mockResolvedValue(orderRow({ country: null }));
    expect(await code(service.setStatus('o1', 'shipped', undefined, DE))).toBe(
      'scope_forbidden',
    );
    const de = orderRow({ country: 'DE', status: 'printing' });
    prisma.order.findUnique.mockResolvedValue(de);
    prisma.order.update.mockResolvedValue({ ...de, status: 'shipped' });
    expect(await code(service.setStatus('o1', 'shipped', undefined, DE))).toBe(
      'ok',
    );
  });
});

describe('backfilledCountry', () => {
  const kzOnly = DEFAULT_COUNTRIES;
  const twoPrint = DEFAULT_COUNTRIES.map((c) =>
    c.code === 'UZ' ? { ...c, currency: 'KZT' as const, print: true } : c,
  );

  it("takes the book's country when it has print, else the only print country", () => {
    expect(backfilledCountry('KZ', kzOnly)).toBe('KZ');
    expect(backfilledCountry('kz', kzOnly)).toBe('KZ');
    // A book made abroad (or with no country) could only have been ordered from Kazakhstan.
    expect(backfilledCountry('DE', kzOnly)).toBe('KZ');
    expect(backfilledCountry(null, kzOnly)).toBe('KZ');
  });

  it('leaves an order it cannot place without a country', () => {
    expect(backfilledCountry('UZ', twoPrint)).toBe('UZ');
    expect(backfilledCountry(null, twoPrint)).toBeNull();
    expect(backfilledCountry('DE', twoPrint)).toBeNull();
    expect(
      backfilledCountry(
        'KZ',
        kzOnly.map((c) => ({ ...c, print: false })),
      ),
    ).toBeNull();
  });
});

function orderRow(over: Record<string, unknown> = {}) {
  const createdAt = (over.createdAt as Date | undefined) ?? new Date();
  return {
    id: 'o1',
    bookId: 'b1',
    recipientName: 'Айгерим',
    phone: '+77011234567',
    email: 'a@example.com',
    locale: null,
    city: 'Шымкент',
    cityId: 'shymkent',
    address: 'ул. Абая, 1',
    cover: 'soft',
    quantity: 1,
    currency: 'KZT',
    itemsAmount: 9_900_00,
    deliveryAmount: 1_500_00,
    totalAmount: 11_400_00,
    fxToUsd: null,
    paymentProvider: 'manual',
    paymentStatus: 'paid',
    lines: [],
    status: 'paid',
    clientKey: 'k',
    userId: null,
    createdAt,
    book: { ...book, heroImagePath: null },
    events: [{ status: 'paid', note: null, createdAt }],
    ...over,
  };
}

/** The argument a Prisma mock was called with the n-th time. */
function callArg(
  fn: jest.Mock,
  n: number,
): { where?: unknown; data?: unknown } {
  return (fn.mock.calls as [{ where?: unknown; data?: unknown }][])[n][0];
}
