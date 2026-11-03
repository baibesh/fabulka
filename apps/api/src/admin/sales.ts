import {
  CurrencySchema,
  money,
  revenueOf,
  toUsd,
  type Margin,
  type Revenue,
  type RevenueGroup,
} from '@fabulka/shared';
import type { Prisma } from '@prisma/client';
import { decimalString } from '../fx/fx.service';
import type { PrismaService } from '../prisma/prisma.service';

const rate = (value: Prisma.Decimal | null) =>
  value ? decimalString(value) : null;

/** Rows grouped by currency and rate as revenueOf takes them; a row in an unknown currency is left out. */
function groups(
  rows: {
    currency: string;
    fxToUsd: Prisma.Decimal | null;
    count: number;
    amount: number;
  }[],
): RevenueGroup[] {
  return rows.flatMap((row) => {
    const currency = CurrencySchema.safeParse(row.currency).data;
    return currency
      ? [
          {
            currency,
            fxToUsd: rate(row.fxToUsd),
            count: row.count,
            amount: row.amount,
          },
        ]
      : [];
  });
}

/** Paid orders' revenue by currency, and roughly in dollars at each order's own rate. */
export async function orderRevenue(
  prisma: PrismaService,
  where: Prisma.OrderWhereInput = {},
): Promise<Revenue> {
  const rows = await prisma.order.groupBy({
    by: ['currency', 'fxToUsd'],
    where: { ...where, paymentStatus: 'paid' },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  return revenueOf(
    groups(
      rows.map((r) => ({
        currency: r.currency,
        fxToUsd: r.fxToUsd,
        count: r._count._all,
        amount: r._sum.totalAmount ?? 0,
      })),
    ),
  );
}

/** Paid purchases of books: revenue by currency, roughly in dollars, and how many books they bought. */
export async function purchaseRevenue(
  prisma: PrismaService,
): Promise<Revenue & { books: number }> {
  const rows = await prisma.credit.groupBy({
    by: ['currency', 'fxToUsd'],
    where: { paymentStatus: 'paid' },
    _count: { _all: true },
    _sum: { amount: true, books: true },
  });
  return {
    ...revenueOf(
      groups(
        rows.map((r) => ({
          currency: r.currency,
          fxToUsd: r.fxToUsd,
          count: r._count._all,
          amount: r._sum.amount ?? 0,
        })),
      ),
    ),
    books: rows.reduce((sum, r) => sum + (r._sum.books ?? 0), 0),
  };
}

/** What marginOf reads of an order: its total and rate, its lines' costs, its delivery cost. */
export interface MarginOrder {
  currency: string;
  totalAmount: number;
  fxToUsd: Prisma.Decimal | null;
  deliveryCost: number | null;
  deliveryCostCurrency: string | null;
  deliveryCostFxToUsd: Prisma.Decimal | null;
  lines: {
    quantity: number;
    unitCost: number | null;
    costCurrency: string | null;
    costFxToUsd: Prisma.Decimal | null;
  }[];
}

/** An amount roughly in US cents at a rate; null when it cannot be converted. */
function usdCents(
  amount: number,
  currency: string | null,
  fx: Prisma.Decimal | null,
): number | null {
  const parsed = CurrencySchema.safeParse(currency).data;
  if (!parsed) return null;
  const r = parsed === 'USD' ? '1' : rate(fx);
  return r ? toUsd(money(amount, parsed), r).amount : null;
}

/**
 * Print margin roughly in dollars, over the orders whose every line had the print partner's cost
 * when ordered (and every needed rate was known): their revenue, their print and delivery costs,
 * and the difference. Null when no order qualifies.
 */
export function marginOf(orders: readonly MarginOrder[]): Margin | null {
  let count = 0;
  let revenue = 0;
  let cost = 0;
  for (const order of orders) {
    if (!order.lines.length) continue;
    const sold = usdCents(order.totalAmount, order.currency, order.fxToUsd);
    const lineCosts = order.lines.map((l) =>
      l.unitCost === null
        ? null
        : usdCents(l.unitCost * l.quantity, l.costCurrency, l.costFxToUsd),
    );
    const delivery =
      order.deliveryCost === null
        ? 0
        : usdCents(
            order.deliveryCost,
            order.deliveryCostCurrency,
            order.deliveryCostFxToUsd,
          );
    if (sold === null || delivery === null || lineCosts.some((c) => c === null))
      continue;
    count++;
    revenue += sold;
    cost += delivery + lineCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  }
  if (!count) return null;
  return {
    orders: count,
    revenue: money(revenue, 'USD'),
    cost: money(cost, 'USD'),
    margin: money(revenue - cost, 'USD'),
  };
}

/** The margin of the paid orders `where` picks (see marginOf). */
export async function orderMargin(
  prisma: PrismaService,
  where: Prisma.OrderWhereInput = {},
): Promise<Margin | null> {
  const orders = await prisma.order.findMany({
    where: {
      ...where,
      paymentStatus: 'paid',
      lines: { some: { unitCost: { not: null } } },
    },
    select: {
      currency: true,
      totalAmount: true,
      fxToUsd: true,
      deliveryCost: true,
      deliveryCostCurrency: true,
      deliveryCostFxToUsd: true,
      lines: {
        select: {
          quantity: true,
          unitCost: true,
          costCurrency: true,
          costFxToUsd: true,
        },
      },
    },
  });
  return marginOf(orders);
}
