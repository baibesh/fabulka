import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  CreateOrderSchema,
  CITY_UNKNOWN,
  PRINT_UNAVAILABLE,
  DEFAULT_CITIES,
  DEFAULT_PRICES,
  REFERENCE_KEYS,
} from '@fabulka/shared';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import { OrdersService } from './orders.service';

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
    }),
  );
  const prisma = {
    book: { findUnique: jest.fn().mockResolvedValue(book) },
    order: { create },
    setting: {
      findMany: () =>
        Promise.resolve(
          Object.entries(stored).map(([key, value]) => ({ key, value })),
        ),
    },
  };
  const mail = { send: jest.fn(), publicUrl: 'http://localhost' };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    { get: (_: string, fallback: unknown) => fallback } as ConfigService,
    new ReferenceService(prisma as unknown as PrismaService),
  );
  return { service, create };
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
      [REFERENCE_KEYS.prices]: {
        ...DEFAULT_PRICES,
        covers: { soft: 5000, hard: 8000 },
        deliveryKzt: 700,
      },
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

  it('uses the launch prices until the owner changes them', async () => {
    const { service } = makeService({});
    const order = await service.create(
      CreateOrderSchema.parse({ ...body, cover: 'soft', quantity: 1 }),
      'k',
    );
    expect(order).toMatchObject({ booksKzt: 9900, deliveryKzt: 1500 });
  });
});
