import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Book as BookRow,
  Order as OrderRow,
  OrderLine as LineRow,
  OrderStatusEvent as EventRow,
  Prisma,
} from '@prisma/client';
import {
  DEFAULT_LANGUAGE,
  LanguageSchema,
  CITY_UNKNOWN,
  CurrencySchema,
  PaymentProviderSchema,
  PaymentStatusSchema,
  PRICE_UNSET,
  PRINT_BLOCKED,
  PRINT_UNAVAILABLE,
  ORDER_STATUSES,
  cityName,
  maskPhone,
  money,
  orderStatusAt,
  OTHER_COUNTRY,
  type AdminAccess,
  type AdminOrder,
  type Country,
  type CountryEntry,
  type CreateOrderInput,
  type Language,
  type Order,
  type OrderLine,
  type OrderStatus,
  type OrderStatusEvent,
} from '@fabulka/shared';
import { BooksService, ownsBook, storedBook } from '../books/books.service';
import { decimalString, FxService } from '../fx/fx.service';
import { PaymentsService } from '../payments/payments.service';
import { PdfService } from '../pdf/pdf.service';
import { layoutOf } from '../layout/layout';
import { MailService } from '../mail/mail.service';
import { orderConfirmation, orderStatusChanged } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import { StorageService } from '../storage/storage.service';
import { assertScope, listCountries, listScope } from '../admin/scope';

type OrderWith = OrderRow & {
  book: BookRow;
  events: EventRow[];
  lines: LineRow[];
};

/** The printed size from an order's frozen layout; null for orders made before layouts. */
function formatOf(stored: unknown): Order['format'] {
  if (!stored) return null;
  const { id, widthMm, heightMm, bleedMm } = layoutOf(stored).format;
  return { id, widthMm, heightMm, bleedMm };
}

const withBookAndEvents = {
  book: true,
  events: { orderBy: { createdAt: 'asc' } },
  lines: { orderBy: { position: 'asc' } },
} as const satisfies Prisma.OrderInclude;

/** The currency an order row is in (stored as its ISO code). */
function currencyOf(row: { currency: string }) {
  return CurrencySchema.parse(row.currency);
}

/** An order's lines as Money, as they were priced when ordered. */
export function linesOf(row: {
  currency: string;
  lines: LineRow[];
}): OrderLine[] {
  const currency = currencyOf(row);
  return row.lines.map((l) => ({
    bookId: l.bookId,
    format: l.format,
    cover: l.cover,
    quantity: l.quantity,
    unit: money(l.unitAmount, currency),
    total: money(l.lineAmount, currency),
  }));
}

/**
 * Orders placed in this browser before anyone signed in to it: they move to whoever signs in
 * (like books, see anonymousBooksOf).
 */
export function anonymousOrdersOf(clientKey: string): Prisma.OrderWhereInput {
  return { clientKey, userId: null };
}

/** "My orders": the signed-in parent's plus this browser's anonymous ones. */
export function myOrdersWhere(
  clientKey: string,
  userId?: string | null,
): Prisma.OrderWhereInput {
  const anonymous = anonymousOrdersOf(clientKey);
  return userId ? { OR: [{ userId }, anonymous] } : anonymous;
}

/**
 * An order carries a name, phone and address: only its account sees it once it has one, else only
 * the browser it was placed in.
 */
export function ownsOrder(
  order: { clientKey: string; userId: string | null },
  clientKey: string,
  userId?: string | null,
): boolean {
  if (order.userId === null) return order.clientKey === clientKey;
  return !!userId && order.userId === userId;
}

/**
 * The country an order made before orders kept one was placed from, for the backfill: the book's
 * country when it is one with print (an order can only be placed from such a country), else the
 * only country with print when there is exactly one (Kazakhstan so far: every delivery city is
 * there), else null (only global staff see the order).
 */
export function backfilledCountry(
  bookCountry: string | null,
  countries: readonly CountryEntry[],
): string | null {
  const print = countries.filter((c) => c.print).map((c) => c.code);
  const code = bookCountry?.trim().toUpperCase();
  if (code && print.includes(code)) return code;
  return print.length === 1 ? print[0] : null;
}

/**
 * Printed-book orders. Payment is a demo (nothing is charged) and the print and
 * delivery stages advance on a timer, ORDER_STAGE_MS per stage.
 */
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  private readonly stageMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
    private readonly reference: ReferenceService,
    private readonly storage: StorageService,
    private readonly books: BooksService,
    private readonly pdf: PdfService,
    private readonly fx: FxService,
    private readonly payments: PaymentsService,
  ) {
    this.stageMs = Number(config.get('ORDER_STAGE_MS', 20_000));
  }

  /** Gives orders placed before orders kept a country one (backfilledCountry). */
  async onModuleInit() {
    const rows = await this.prisma.order.findMany({
      where: { country: null },
      select: { id: true, book: { select: { country: true } } },
    });
    if (!rows.length) return;
    const countries = await this.reference.countries();
    let filled = 0;
    for (const row of rows) {
      const country = backfilledCountry(row.book.country, countries);
      if (!country) continue;
      await this.prisma.order.update({
        where: { id: row.id },
        data: { country },
      });
      filled++;
    }
    if (filled) this.logger.log(`gave ${filled} orders their country`);
  }

  /**
   * Only the browser that made the book, or the account it belongs to, can order it, and only
   * from a country with print (Kazakhstan when no country is known).
   */
  async create(
    input: CreateOrderInput,
    clientKey: string,
    userId?: string | null,
    country: Country = 'KZ',
  ): Promise<Order> {
    if (!(await this.reference.infoFor(country)).print) {
      throw new BadRequestException({
        code: PRINT_UNAVAILABLE,
        message: 'Printed books are not available in your country yet',
      });
    }
    const book = await this.prisma.book.findUnique({
      where: { id: input.bookId },
    });
    if (!book || !ownsBook(book, clientKey, userId)) {
      throw new NotFoundException(`book ${input.bookId} not found`);
    }
    if (book.status !== 'done') {
      throw new ConflictException('The book is still being made');
    }
    // Paid through the country's provider: refused up front when it is not wired in yet.
    await this.payments.assertAvailable(country);
    // The format the parent picked (offered and priced in the country); the book is laid out at it
    // before it is frozen.
    const format = await this.reference.offeredFormat(
      input.format ?? layoutOf(book.layout).format.id,
      country,
    );
    const layout = await this.books.ensureFormat(book.id, format.id);
    // Render QA found text that does not fit or a letter without its font: not sent to print.
    if (layout.qa.status === 'blocked') {
      throw new ConflictException({
        code: PRINT_BLOCKED,
        message: 'This book cannot be printed yet: its layout needs a fix',
      });
    }
    // Only to a city of the order's country; the order keeps its Russian name as it is today.
    const city = (await this.reference.citiesFor(country)).find(
      (c) => c.id === input.cityId,
    );
    if (!city) {
      throw new BadRequestException({
        code: CITY_UNKNOWN,
        message: `We do not deliver to ${input.cityId}`,
      });
    }
    // Priced here from the owner's prices in the country's currency; the body carries no amounts
    // (the schema drops them). Everything is snapshotted: later price or rate changes never touch it.
    const quote = await this.reference.quote(
      book.id,
      format,
      input.cover,
      input.quantity,
      city.id,
      country,
    );
    if (!quote) {
      throw new ConflictException({
        code: PRICE_UNSET,
        message: 'Delivery is not priced in your country yet',
      });
    }
    const rate = (currency: string | undefined) =>
      currency ? this.fx.decimalToUsd(CurrencySchema.parse(currency)) : null;
    const lines = await Promise.all(
      quote.lines.map(async (line, position) => ({
        position,
        bookId: line.bookId,
        format: line.format,
        cover: line.cover,
        quantity: line.quantity,
        unitAmount: line.unit.amount,
        lineAmount: line.total.amount,
        unitCost: line.unitCost?.amount ?? null,
        costCurrency: line.unitCost?.currency ?? null,
        costFxToUsd: await rate(line.unitCost?.currency),
      })),
    );
    const created = await this.prisma.order.create({
      data: {
        bookId: input.bookId,
        recipientName: input.recipientName,
        phone: input.phone,
        email: input.email,
        city: cityName(city, 'ru'),
        cityId: city.id,
        address: input.address,
        cover: input.cover,
        // Frozen here: what this order prints, whatever happens to the book later.
        layout: layout,
        quantity: input.quantity,
        locale: input.locale,
        currency: quote.currency,
        itemsAmount: quote.subtotal.amount,
        deliveryAmount: quote.delivery.amount,
        totalAmount: quote.total.amount,
        fxToUsd: await rate(quote.currency),
        deliveryCost: quote.deliveryCost?.amount ?? null,
        deliveryCostCurrency: quote.deliveryCost?.currency ?? null,
        deliveryCostFxToUsd: await rate(quote.deliveryCost?.currency),
        paymentStatus: 'pending',
        lines: { create: lines },
        clientKey,
        userId: userId ?? null,
        country: country === OTHER_COUNTRY ? null : country,
      },
    });
    // Exactly the total, in the order's currency, through the country's provider.
    const payment = await this.payments
      .pay(country, {
        purpose: 'order',
        reference: created.id,
        amount: quote.total,
        description: `Fabulka order ${created.id}`,
      })
      .catch(async (error: unknown) => {
        await this.prisma.order.delete({ where: { id: created.id } });
        throw error;
      });
    const row = await this.prisma.order.update({
      where: { id: created.id },
      data: {
        paymentProvider: payment.provider,
        paymentId: payment.id,
        paymentStatus: payment.status,
        // The first stage once paid (a manual payment is paid at once; a provider's webhook later).
        ...(payment.status === 'paid' && {
          events: { create: { status: ORDER_STATUSES[0] } },
        }),
      },
      include: withBookAndEvents,
    });
    void this.mail.send(
      row.email,
      orderConfirmation(
        this.mailData(row, book),
        this.locale(row, book),
        this.mail.publicUrl,
      ),
    );
    return this.toDto(row);
  }

  /** Only the order's owner (account, else browser) sees it; anyone else gets a 404. */
  async get(
    id: string,
    clientKey: string,
    userId?: string | null,
  ): Promise<Order> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: withBookAndEvents,
    });
    if (!row || !ownsOrder(row, clientKey, userId)) {
      throw new NotFoundException(`order ${id} not found`);
    }
    return this.toDto(row);
  }

  /** The parent's orders (the account's and this browser's anonymous ones), newest first. */
  async mine(clientKey: string, userId?: string | null): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: myOrdersWhere(clientKey, userId),
      orderBy: { createdAt: 'desc' },
      include: withBookAndEvents,
      take: 100,
    });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * The orders the session may see, newest first, with what the admin needs to ship them: a country
   * manager's countries only (an order with no country is global staff's), narrowed to the working
   * country (?country=) when the admin picked one.
   */
  async list(
    session: AdminAccess,
    working?: string | null,
  ): Promise<AdminOrder[]> {
    const countries = listCountries(listScope(session, 'orders'), working);
    if (countries && !countries.length) return [];
    const rows = await this.prisma.order.findMany({
      where: countries ? { country: { in: countries } } : undefined,
      orderBy: { createdAt: 'desc' },
      include: withBookAndEvents,
      take: 200,
    });
    return rows.map((row) => this.adminDto(row));
  }

  /** The stage an order is at now and its country (for the audit's before), or null. */
  async currentStatus(
    id: string,
  ): Promise<{ status: OrderStatus; country: string | null } | null> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: withBookAndEvents,
    });
    return row ? { status: this.statusOf(row), country: row.country } : null;
  }

  /** 404 for no order; 403 scope_forbidden for one outside the session's countries. */
  private async assertOrderScope(id: string, session: AdminAccess) {
    const row = await this.prisma.order.findUnique({
      where: { id },
      select: { country: true },
    });
    if (!row) throw new NotFoundException(`order ${id} not found`);
    assertScope(
      session,
      'orders',
      row.country ? [row.country] : null,
      'The order is not from your countries',
    );
  }

  /**
   * Sets the stage by hand; from then on the demo timer no longer moves it. The change goes into
   * the order's history (with the timer's stages it had passed before it, so their dates stay), and
   * the parent gets an email when the stage they see changes.
   */
  async setStatus(
    id: string,
    status: OrderStatus,
    note: string | undefined,
    session: AdminAccess,
  ): Promise<AdminOrder> {
    await this.assertOrderScope(id, session);
    const before = await this.prisma.order.findUnique({
      where: { id },
      include: withBookAndEvents,
    });
    if (!before) throw new NotFoundException(`order ${id} not found`);
    const changed = this.statusOf(before) !== status;
    const events: Prisma.OrderStatusEventCreateManyOrderInput[] = [];
    if (before.status === null) {
      // The timer's stages before the new one happened: keep them with the times they were reached.
      const target = ORDER_STATUSES.indexOf(status);
      for (const event of this.timerEvents(before)) {
        if (ORDER_STATUSES.indexOf(event.status) < target) {
          events.push({ status: event.status, createdAt: new Date(event.at) });
        }
      }
    }
    if (changed || note) events.push({ status, note: note || null });
    const row = await this.prisma.order
      .update({
        where: { id },
        data: {
          status,
          ...(events.length && { events: { createMany: { data: events } } }),
        },
        include: withBookAndEvents,
      })
      .catch(() => {
        throw new NotFoundException(`order ${id} not found`);
      });
    if (changed) {
      void this.mail.send(
        row.email,
        orderStatusChanged(
          this.mailData(row, row.book),
          status,
          this.locale(row, row.book),
          this.mail.publicUrl,
        ),
      );
    }
    return this.adminDto(row);
  }

  /**
   * The print file of an order (admin): its frozen layout rendered with bleed and crop marks, made
   * on first request and kept. Returns the file's storage path.
   */
  async printFile(
    id: string,
    session: AdminAccess,
  ): Promise<{ path: string; name: string }> {
    await this.assertOrderScope(id, session);
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { book: true },
    });
    if (!row) throw new NotFoundException(`order ${id} not found`);
    const name = `fabulka-${row.id}-print.pdf`;
    const path = `orders/${row.id}/print.pdf`;
    if (await this.storage.exists(path)) return { path, name };
    const layout = layoutOf(row.layout ?? row.book.layout);
    await this.pdf.renderPrint(
      row.bookId,
      storedBook(row.book),
      layout,
      path,
      `Fabulka · ${row.id} · ${layout.format.id} ${layout.format.widthMm}×${layout.format.heightMm} mm + ${layout.format.bleedMm} mm bleed · ${row.cover} ×${row.quantity}`,
    );
    return { path, name };
  }

  /** The stage the parent sees: set by hand, else where the demo timer is. */
  private statusOf(row: OrderRow): OrderStatus {
    return (
      (row.status as OrderStatus | null) ??
      orderStatusAt(Date.now() - row.createdAt.getTime(), this.stageMs)
    );
  }

  /** Emails go in the language the parent ordered in, else the book's. */
  private locale(row: OrderRow, book: BookRow): Language {
    return (
      LanguageSchema.safeParse(row.locale).data ??
      LanguageSchema.safeParse(book.language).data ??
      DEFAULT_LANGUAGE
    );
  }

  private mailData(row: OrderRow, book: BookRow) {
    return {
      id: row.id,
      bookId: row.bookId,
      bookTitle: book.title,
      recipientName: row.recipientName,
      city: row.city,
      address: row.address,
      cover: row.cover,
      quantity: row.quantity,
      total: money(row.totalAmount, currencyOf(row)),
    };
  }

  /**
   * Stages the demo timer has moved an order through (it runs orders nobody set by hand), at the
   * times it reached them; the first stage is the stored one written when the order was placed.
   */
  private timerEvents(row: OrderRow): OrderStatusEvent[] {
    if (row.status !== null) return [];
    const reached = ORDER_STATUSES.indexOf(this.statusOf(row));
    return ORDER_STATUSES.slice(1, reached + 1).map((status, i) => ({
      status,
      at: new Date(
        row.createdAt.getTime() + (i + 1) * this.stageMs,
      ).toISOString(),
      note: null,
    }));
  }

  /** The order's history, oldest first: stored stages, plus the timer's while it runs the order. */
  private history(row: OrderWith): OrderStatusEvent[] {
    const stored = row.events.flatMap((e): OrderStatusEvent[] => {
      const status = ORDER_STATUSES.find((s) => s === e.status);
      return status
        ? [{ status, at: e.createdAt.toISOString(), note: e.note }]
        : [];
    });
    return [...stored, ...this.timerEvents(row)].sort((a, b) =>
      a.at.localeCompare(b.at),
    );
  }

  private adminDto(row: OrderWith): AdminOrder {
    return {
      ...this.toDto(row),
      phone: row.phone,
      country: row.country,
      manual: row.status !== null,
      fxToUsd: row.fxToUsd ? decimalString(row.fxToUsd) : null,
    };
  }

  private toDto(row: OrderWith): Order {
    return {
      id: row.id,
      bookId: row.bookId,
      bookTitle: row.book.title,
      bookImageUrl: this.storage.url(row.book.heroImagePath),
      status: this.statusOf(row),
      history: this.history(row),
      recipientName: row.recipientName,
      phoneMasked: maskPhone(row.phone),
      email: row.email,
      city: row.city,
      cityId: row.cityId,
      address: row.address,
      cover: row.cover,
      format: formatOf(row.layout),
      quantity: row.quantity,
      currency: currencyOf(row),
      lines: linesOf(row),
      subtotal: money(row.itemsAmount, currencyOf(row)),
      delivery: money(row.deliveryAmount, currencyOf(row)),
      total: money(row.totalAmount, currencyOf(row)),
      payment: {
        provider: PaymentProviderSchema.catch('manual').parse(
          row.paymentProvider,
        ),
        status: PaymentStatusSchema.catch('paid').parse(row.paymentStatus),
      },
      createdAt: row.createdAt.toISOString(),
    };
  }
}
