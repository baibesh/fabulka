import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ORDER_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_UNAVAILABLE,
  paymentProviderOf,
  type Country,
  type PaymentProviderKey,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import {
  ManualPaymentProvider,
  PaymentProviderUnavailable,
  PlaceholderPaymentProvider,
  type Payment,
  type PaymentProvider,
  type PaymentRequest,
} from './payment-provider';

/** Every provider by key: manual works; Kaspi and Stripe are placeholders until wired in. */
export function defaultProviders(): Record<
  PaymentProviderKey,
  PaymentProvider
> {
  return {
    manual: new ManualPaymentProvider(),
    kaspi: new PlaceholderPaymentProvider('kaspi'),
    stripe: new PlaceholderPaymentProvider('stripe'),
  };
}

function unavailable(provider: PaymentProviderKey) {
  return new ServiceUnavailableException({
    code: PAYMENT_UNAVAILABLE,
    provider,
    message: 'Payment is not available in your country yet',
  });
}

/**
 * Payments through the country's provider (reference.countries `payment`; by hand when none).
 * Orders and purchases create a payment here for exactly their Money and keep its id and status;
 * a provider's webhook moves that status later.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private providers: Record<PaymentProviderKey, PaymentProvider> =
    defaultProviders();

  constructor(
    private readonly prisma: PrismaService,
    private readonly reference: ReferenceService,
  ) {}

  /** Replaces the providers (tests). */
  useProviders(providers: Record<PaymentProviderKey, PaymentProvider>) {
    this.providers = providers;
  }

  async providerFor(country: Country): Promise<PaymentProvider> {
    return this.providers[
      paymentProviderOf(await this.reference.infoFor(country))
    ];
  }

  /** 503 payment_unavailable when the country's provider cannot take payments yet. */
  async assertAvailable(country: Country): Promise<PaymentProvider> {
    const provider = await this.providerFor(country);
    if (!provider.live) throw unavailable(provider.key);
    return provider;
  }

  /** A payment for exactly `request.amount` through the country's provider. */
  async pay(country: Country, request: PaymentRequest): Promise<Payment> {
    const provider = await this.assertAvailable(country);
    try {
      return await provider.create(request);
    } catch (error) {
      if (error instanceof PaymentProviderUnavailable)
        throw unavailable(provider.key);
      throw error;
    }
  }

  /**
   * A provider's webhook: the payment it names moves to the status it reports, on the order or the
   * purchase that holds it (an order that became paid gets its "paid" stage). 404 for an unknown
   * provider; 503 for a placeholder.
   */
  async webhook(
    key: string,
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<{ updated: boolean }> {
    if (!(PAYMENT_PROVIDERS as readonly string[]).includes(key)) {
      throw new NotFoundException(`No payment provider ${key}`);
    }
    const provider = this.providers[key as PaymentProviderKey];
    let update;
    try {
      update = await provider.webhook(headers, body);
    } catch (error) {
      if (error instanceof PaymentProviderUnavailable)
        throw unavailable(provider.key);
      throw error;
    }
    if (!update) return { updated: false };
    const where = { paymentProvider: provider.key, paymentId: update.id };
    const order = await this.prisma.order.findFirst({
      where,
      include: { events: true },
    });
    if (order) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: update.status,
          ...(update.status === 'paid' &&
            !order.events.some((e) => e.status === ORDER_STATUSES[0]) && {
              events: { create: { status: ORDER_STATUSES[0] } },
            }),
        },
      });
      return { updated: true };
    }
    const { count } = await this.prisma.credit.updateMany({
      where,
      data: { paymentStatus: update.status },
    });
    if (!count)
      this.logger.warn(
        `${provider.key} webhook for unknown payment ${update.id}`,
      );
    return { updated: count > 0 };
  }
}
