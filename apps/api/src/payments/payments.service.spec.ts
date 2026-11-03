import {
  DEFAULT_COUNTRIES,
  countryInfo,
  type CountryEntry,
  type PaymentStatus,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReferenceService } from '../reference/reference.service';
import {
  ManualPaymentProvider,
  PlaceholderPaymentProvider,
  type Payment,
  type PaymentProvider,
  type PaymentRequest,
  type PaymentUpdate,
} from './payment-provider';
import { PaymentsService, defaultProviders } from './payments.service';

/** A provider that takes payments on a hosted page and reports back by webhook, as Stripe would. */
class FakeProvider implements PaymentProvider {
  readonly key = 'stripe' as const;
  readonly live = true;
  readonly requests: PaymentRequest[] = [];

  create(request: PaymentRequest): Promise<Payment> {
    this.requests.push(request);
    return Promise.resolve({
      provider: this.key,
      id: `pi_${request.reference}`,
      status: 'pending',
      redirectUrl: `https://pay.example/${request.reference}`,
    });
  }

  webhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<PaymentUpdate | null> {
    if (headers['x-signature'] !== 'ok')
      return Promise.reject(new Error('bad signature'));
    const { id, status } = body as { id: string; status: PaymentStatus };
    return Promise.resolve({ id, status });
  }

  status(): Promise<PaymentStatus> {
    return Promise.resolve('pending');
  }
}

function setup(countries: CountryEntry[] = DEFAULT_COUNTRIES) {
  const orders = [
    {
      id: 'o1',
      paymentProvider: 'stripe',
      paymentId: 'pi_o1',
      paymentStatus: 'pending',
      events: [] as { status: string }[],
    },
  ];
  const credits = [
    {
      id: 'c1',
      paymentProvider: 'stripe',
      paymentId: 'pi_c1',
      paymentStatus: 'pending',
    },
  ];
  const prisma = {
    order: {
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { paymentProvider: string; paymentId: string };
        }) =>
          Promise.resolve(
            orders.find(
              (o) =>
                o.paymentId === where.paymentId &&
                o.paymentProvider === where.paymentProvider,
            ) ?? null,
          ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: {
            paymentStatus: string;
            events?: { create: { status: string } };
          };
        }) => {
          const row = orders.find((o) => o.id === where.id)!;
          row.paymentStatus = data.paymentStatus;
          if (data.events) row.events.push(data.events.create);
          return Promise.resolve(row);
        },
      ),
    },
    credit: {
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { paymentId: string };
          data: { paymentStatus: string };
        }) => {
          const rows = credits.filter((c) => c.paymentId === where.paymentId);
          rows.forEach((c) => (c.paymentStatus = data.paymentStatus));
          return Promise.resolve({ count: rows.length });
        },
      ),
    },
  };
  const reference = {
    infoFor: (country: string) =>
      Promise.resolve(countryInfo(country, countries)),
  } as unknown as ReferenceService;
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    reference,
  );
  return { service, orders, credits };
}

const euro = { amount: 62_70, currency: 'EUR' as const };

describe('PaymentsService', () => {
  it('pays by hand where no provider is set: paid at once, nothing charged', async () => {
    const { service } = setup();
    const payment = await service.pay('KZ', {
      purpose: 'order',
      reference: 'o9',
      amount: euro,
      description: 'x',
    });
    expect(payment).toEqual({
      provider: 'manual',
      id: 'manual_o9',
      status: 'paid',
      redirectUrl: null,
    });
    expect(await new ManualPaymentProvider().status()).toBe('paid');
  });

  it('refuses a country set to a placeholder provider', async () => {
    const countries = DEFAULT_COUNTRIES.map((c) =>
      c.code === 'DE' ? { ...c, payment: 'stripe' as const } : c,
    );
    const { service } = setup(countries);
    await expect(service.assertAvailable('DE')).rejects.toMatchObject({
      response: { code: 'payment_unavailable', provider: 'stripe' },
    });
    await expect(
      service.pay('DE', {
        purpose: 'credit',
        reference: 'c',
        amount: euro,
        description: 'x',
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      new PlaceholderPaymentProvider('kaspi').create(),
    ).rejects.toThrow('kaspi');
  });

  it('hands a wired-in provider exactly the Money, and moves the order when its webhook says paid', async () => {
    const countries = DEFAULT_COUNTRIES.map((c) =>
      c.code === 'DE'
        ? { ...c, currency: 'EUR' as const, payment: 'stripe' as const }
        : c,
    );
    const { service, orders, credits } = setup(countries);
    const fake = new FakeProvider();
    service.useProviders({ ...defaultProviders(), stripe: fake });

    const payment = await service.pay('DE', {
      purpose: 'order',
      reference: 'o1',
      amount: euro,
      description: 'Fabulka order o1',
    });
    expect(payment).toMatchObject({
      provider: 'stripe',
      id: 'pi_o1',
      status: 'pending',
      redirectUrl: 'https://pay.example/o1',
    });
    expect(fake.requests[0].amount).toEqual(euro);

    await expect(
      service.webhook('stripe', { 'x-signature': 'bad' }, {}),
    ).rejects.toThrow('bad signature');
    expect(
      await service.webhook(
        'stripe',
        { 'x-signature': 'ok' },
        { id: 'pi_o1', status: 'paid' },
      ),
    ).toEqual({ updated: true });
    expect(orders[0]).toMatchObject({
      paymentStatus: 'paid',
      events: [{ status: 'paid' }],
    });
    // A second "paid" does not add the stage twice.
    await service.webhook(
      'stripe',
      { 'x-signature': 'ok' },
      { id: 'pi_o1', status: 'paid' },
    );
    expect(orders[0].events).toHaveLength(1);

    expect(
      await service.webhook(
        'stripe',
        { 'x-signature': 'ok' },
        { id: 'pi_c1', status: 'failed' },
      ),
    ).toEqual({ updated: true });
    expect(credits[0].paymentStatus).toBe('failed');
    expect(
      await service.webhook(
        'stripe',
        { 'x-signature': 'ok' },
        { id: 'pi_none', status: 'paid' },
      ),
    ).toEqual({ updated: false });
  });

  it('says nothing for manual payments, 404 for an unknown provider and 503 for a placeholder', async () => {
    const { service } = setup();
    expect(await service.webhook('manual', {}, {})).toEqual({ updated: false });
    await expect(service.webhook('paypal', {}, {})).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.webhook('kaspi', {}, {})).rejects.toMatchObject({
      status: 503,
    });
  });
});
