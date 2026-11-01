import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Book as BookRow, Order as OrderRow } from '@prisma/client';
import {
  LanguageSchema,
  PRINT_UNAVAILABLE,
  orderStatusAt,
  type AdminOrder,
  type Country,
  type CreateOrderInput,
  type Language,
  type Order,
  type OrderStatus,
} from '@fabulka/shared';
import { ownsBook } from '../books/books.service';
import { MailService } from '../mail/mail.service';
import { orderConfirmation, orderStatusChanged } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';

/**
 * Printed-book orders. Payment is a demo (nothing is charged) and the print and
 * delivery stages advance on a timer, ORDER_STAGE_MS per stage.
 */
@Injectable()
export class OrdersService {
  private readonly stageMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
    private readonly reference: ReferenceService,
  ) {
    this.stageMs = Number(config.get('ORDER_STAGE_MS', 20_000));
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
    // Priced here from the owner's prices; the body carries no amounts (the schema drops them).
    const price = await this.reference.orderPrice(
      input.cover,
      input.quantity,
      input.city,
    );
    const row = await this.prisma.order.create({
      data: {
        bookId: input.bookId,
        recipientName: input.recipientName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        address: input.address,
        cover: input.cover,
        quantity: input.quantity,
        locale: input.locale,
        booksKzt: price.books,
        deliveryKzt: price.delivery,
        totalKzt: price.total,
      },
    });
    void this.mail.send(
      row.email,
      orderConfirmation(
        this.mailData(row, book),
        this.locale(row, book),
        this.mail.publicUrl,
      ),
    );
    return this.toDto(row, book);
  }

  /** An order carries a name and address: only whoever may order the book can see it. */
  async get(
    id: string,
    clientKey: string,
    userId?: string | null,
  ): Promise<Order> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { book: true },
    });
    if (!row || !ownsBook(row.book, clientKey, userId)) {
      throw new NotFoundException(`order ${id} not found`);
    }
    return this.toDto(row, row.book);
  }

  /** All orders, newest first, with what the admin needs to ship them. */
  async list(): Promise<AdminOrder[]> {
    const rows = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { book: true },
      take: 200,
    });
    return rows.map((row) => this.adminDto(row, row.book));
  }

  /**
   * Sets the stage by hand; from then on the demo timer no longer moves it. The parent gets an
   * email when the stage they see changes.
   */
  async setStatus(id: string, status: OrderStatus): Promise<AdminOrder> {
    const before = await this.prisma.order.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`order ${id} not found`);
    const row = await this.prisma.order
      .update({ where: { id }, data: { status }, include: { book: true } })
      .catch(() => {
        throw new NotFoundException(`order ${id} not found`);
      });
    if (this.statusOf(before) !== status) {
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
    return this.adminDto(row, row.book);
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
      'ru'
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
      totalKzt: row.totalKzt,
    };
  }

  private adminDto(row: OrderRow, book: BookRow): AdminOrder {
    return {
      ...this.toDto(row, book),
      phone: row.phone,
      manual: row.status !== null,
    };
  }

  private toDto(row: OrderRow, book: BookRow): Order {
    return {
      id: row.id,
      bookId: row.bookId,
      bookTitle: book.title,
      status: this.statusOf(row),
      recipientName: row.recipientName,
      email: row.email,
      city: row.city,
      address: row.address,
      cover: row.cover,
      quantity: row.quantity,
      booksKzt: row.booksKzt,
      deliveryKzt: row.deliveryKzt,
      totalKzt: row.totalKzt,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
