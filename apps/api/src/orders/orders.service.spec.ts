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
} from '@fabulka/shared';
import type { BooksService } from '../books/books.service';
import type { MailService } from '../mail/mail.service';
import type { PdfService } from '../pdf/pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import { StorageService } from '../storage/storage.service';
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
function makeService(stored: Record<string, unknown>) {
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'o1',
      status: null,
      createdAt: new Date(),
      ...data,
      book,
      events: [{ status: 'paid', note: null, createdAt: new Date() }],
    }),
  );
  const prisma = {
    book: { findUnique: jest.fn().mockResolvedValue(book) },
    order: {
      create,
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
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
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    { get: (_: string, fallback: unknown) => fallback } as ConfigService,
    new ReferenceService(prisma as unknown as PrismaService),
    new StorageService({
      get: (_: string, fallback: unknown) => fallback,
    } as ConfigService),
    books as unknown as BooksService,
    {} as PdfService,
  );
  return { service, create, prisma, mail, books };
}

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
      [REFERENCE_KEYS.prices]: { ...DEFAULT_PRICES, deliveryKzt: 700 },
      [REFERENCE_KEYS.formats]: DEFAULT_FORMATS.map((f) =>
        f.id === 'square-210'
          ? { ...f, prices: { soft: 5000, hard: 8000 } }
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
      booksKzt: 16000,
      deliveryKzt: 700,
      totalKzt: 16700,
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      booksKzt: 16000,
      deliveryKzt: 700,
      totalKzt: 16700,
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
      booksKzt: 29800,
      deliveryKzt: 0,
      totalKzt: 29800,
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
      booksKzt: 13900,
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
    expect(order).toMatchObject({ booksKzt: 9900, deliveryKzt: 1500 });
  });
});

describe('OrdersService.create (owner and history)', () => {
  it('keeps the visitor key, the account and the first stage', async () => {
    const { service, create } = makeService({});
    const order = await service.create(
      CreateOrderSchema.parse(body),
      'k',
      'user-1',
    );
    expect(create.mock.calls[0][0].data).toMatchObject({
      clientKey: 'k',
      userId: 'user-1',
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
    await service.setStatus('o1', 'shipped', 'KZ123');
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
    await service.setStatus('o1', 'delivered');
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
    await service.setStatus('o1', 'printing');
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
    booksKzt: 9900,
    deliveryKzt: 1500,
    totalKzt: 11400,
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
