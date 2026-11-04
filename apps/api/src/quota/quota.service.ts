import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BUDGET_REACHED,
  DAILY_CAP_REACHED,
  LIMIT_REACHED,
  PRICE_UNSET,
  type BookKind,
  type Country,
  type Money,
  type Quota,
} from '@fabulka/shared';
import { FxService } from '../fx/fx.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';

/**
 * Who may start a book: each visitor gets FREE_BOOKS, then buys more; a demo code
 * (for judges) skips the per-visitor limit. A service-wide daily cap keeps a viral
 * link from spending the whole model budget.
 */
@Injectable()
export class QuotaService {
  private readonly freeBooks: number;
  private readonly dailyCap: number;
  private readonly demoDailyCap: number;
  private readonly demoCodes: Set<string>;
  private readonly budgetUsd: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly reference: ReferenceService,
    private readonly fx: FxService,
    private readonly payments: PaymentsService,
  ) {
    this.freeBooks = Number(config.get('FREE_BOOKS', 3));
    this.dailyCap = Number(config.get('DAILY_BOOK_CAP', 100));
    this.demoDailyCap = Number(config.get('DEMO_DAILY_CAP', 50));
    this.budgetUsd = Number(config.get('MODEL_BUDGET_USD', 150));
    this.demoCodes = new Set(
      config
        .get<string>('DEMO_CODES', '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  isDemo(code: string | undefined): boolean {
    return !!code && this.demoCodes.has(code.trim().toUpperCase());
  }

  async quota(clientKey: string, demoCode?: string): Promise<Quota> {
    const [used, credits] = await Promise.all([
      this.prisma.book.count({
        where: { clientKey, demo: false, status: { not: 'failed' } },
      }),
      // Only paid purchases add books (a manual one is paid at once).
      this.prisma.credit.aggregate({
        where: { clientKey, paymentStatus: 'paid' },
        _sum: { books: true },
      }),
    ]);
    const limit = this.freeBooks + (credits._sum.books ?? 0);
    return {
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      demo: this.isDemo(demoCode),
    };
  }

  /**
   * Throws 402 when the visitor is out of books, 503 when today's cap is reached or the whole model
   * budget is spent - or would be by this book: `estimateUsd` is what a book of its format costs
   * (formatEstimate: every frame, not one picture a page).
   */
  async assertCanCreate(
    clientKey: string,
    demoCode?: string,
    estimateUsd = 0,
  ): Promise<void> {
    const spent = await this.prisma.book.aggregate({ _sum: { costUsd: true } });
    if ((spent._sum.costUsd ?? 0) + estimateUsd > this.budgetUsd) {
      throw new HttpException(
        {
          code: BUDGET_REACHED,
          message:
            'Создание книг временно приостановлено, загляните чуть позже',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const demo = this.isDemo(demoCode);
    const today = await this.prisma.book.count({
      where: { demo, createdAt: { gte: startOfDay() } },
    });
    if (today >= (demo ? this.demoDailyCap : this.dailyCap)) {
      throw new HttpException(
        {
          code: DAILY_CAP_REACHED,
          message: 'Сегодня книг больше не создать, приходите завтра',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (demo) return;
    const quota = await this.quota(clientKey);
    if (quota.remaining <= 0) {
      throw new HttpException(
        {
          code: LIMIT_REACHED,
          message: 'Бесплатные книги закончились',
          quota,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /** Books started today against each daily cap. */
  async caps() {
    const since = startOfDay();
    const [regular, demo] = await Promise.all([
      this.prisma.book.count({
        where: { demo: false, createdAt: { gte: since } },
      }),
      this.prisma.book.count({
        where: { demo: true, createdAt: { gte: since } },
      }),
    ]);
    return {
      regular: { used: regular, limit: this.dailyCap },
      demo: { used: demo, limit: this.demoDailyCap },
    };
  }

  /**
   * One more book for the visitor at the price of its kind the owner set in the admin (never one the
   * client sends), in the currency of the visitor's country, paid through the country's provider (by
   * hand: nothing is charged and it is paid at once). The purchase snapshots its currency, price and
   * the rate to USD. A credit is good for either kind, like the free books. 409 price_unset when the
   * currency has no price; 503 payment_unavailable when the provider is not wired in yet.
   */
  async buyBook(
    clientKey: string,
    kind: BookKind,
    country: Country,
  ): Promise<{ quota: Quota; price: Money }> {
    await this.payments.assertAvailable(country);
    const price = await this.reference.bookPrice(kind, country);
    if (!price) {
      throw new ConflictException({
        code: PRICE_UNSET,
        message: 'Books are not priced in your country yet',
      });
    }
    const credit = await this.prisma.credit.create({
      data: {
        clientKey,
        books: 1,
        kind,
        currency: price.currency,
        unitAmount: price.amount,
        amount: price.amount,
        fxToUsd: await this.fx.decimalToUsd(price.currency),
        paymentStatus: 'pending',
      },
    });
    const payment = await this.payments
      .pay(country, {
        purpose: 'credit',
        reference: credit.id,
        amount: price,
        description: `Fabulka: one more ${kind} book`,
      })
      .catch(async (error: unknown) => {
        await this.prisma.credit.delete({ where: { id: credit.id } });
        throw error;
      });
    await this.prisma.credit.update({
      where: { id: credit.id },
      data: {
        paymentProvider: payment.provider,
        paymentId: payment.id,
        paymentStatus: payment.status,
      },
    });
    return { quota: await this.quota(clientKey), price };
  }
}

export function startOfDay(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
