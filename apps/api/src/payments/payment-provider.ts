import type { Money, PaymentProviderKey, PaymentStatus } from '@fabulka/shared';

/** What a payment is for: an order of printed copies, or more books (a Credit). */
export type PaymentPurpose = 'order' | 'credit';

/** A payment to create: exactly this Money, for this order or purchase (never converted). */
export interface PaymentRequest {
  purpose: PaymentPurpose;
  /** The order's (or credit's) id: the provider's reference, so a webhook finds it again. */
  reference: string;
  amount: Money;
  /** One line the provider may show the payer. */
  description: string;
}

/** A payment as the provider has it. */
export interface Payment {
  provider: PaymentProviderKey;
  /** The provider's payment id. */
  id: string;
  status: PaymentStatus;
  /** Where to send the payer to pay, for a provider with a hosted page; null when nothing is left to do. */
  redirectUrl: string | null;
}

/** A webhook's news about a payment: its id with the provider and where it stands now. */
export interface PaymentUpdate {
  id: string;
  status: PaymentStatus;
}

/**
 * The seam every payment goes through: orders and purchases only ever talk to this, so wiring in a
 * real provider (Kaspi in Kazakhstan, Stripe in Europe) never touches them.
 */
export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  /** False for a placeholder: it cannot take payments yet. */
  readonly live: boolean;
  create(request: PaymentRequest): Promise<Payment>;
  /** Reads a webhook call (checking its signature); null when it says nothing about a payment. */
  webhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<PaymentUpdate | null>;
  status(id: string): Promise<PaymentStatus>;
}

/** Thrown by a placeholder provider: the country's payments are not wired in yet. */
export class PaymentProviderUnavailable extends Error {
  constructor(readonly provider: PaymentProviderKey) {
    super(`Payments through ${provider} are not available yet`);
  }
}

/**
 * Payment by hand, the demo: nothing is charged and the payment is paid at once. Its id is derived
 * from the order's, so it never needs storing anywhere else.
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly key = 'manual' as const;
  readonly live = true;

  create(request: PaymentRequest): Promise<Payment> {
    return Promise.resolve({
      provider: this.key,
      id: `manual_${request.reference}`,
      status: 'paid',
      redirectUrl: null,
    });
  }

  /** Nobody calls back for a manual payment. */
  webhook(): Promise<PaymentUpdate | null> {
    return Promise.resolve(null);
  }

  status(): Promise<PaymentStatus> {
    return Promise.resolve('paid');
  }
}

/** A provider that is named in the admin but not wired in yet (Kaspi, Stripe): every call refuses. */
export class PlaceholderPaymentProvider implements PaymentProvider {
  readonly live = false;

  constructor(readonly key: Exclude<PaymentProviderKey, 'manual'>) {}

  create(): Promise<Payment> {
    return Promise.reject(new PaymentProviderUnavailable(this.key));
  }

  webhook(): Promise<PaymentUpdate | null> {
    return Promise.reject(new PaymentProviderUnavailable(this.key));
  }

  status(): Promise<PaymentStatus> {
    return Promise.reject(new PaymentProviderUnavailable(this.key));
  }
}
