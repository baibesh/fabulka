import { Injectable, NotFoundException } from '@nestjs/common';
import type { PageFlag as FlagRow } from '@prisma/client';
import type { CreatePageFlag, PageFlag } from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';

type FlagWithBook = FlagRow & { book: { title: string | null } };

/**
 * Illustrators' review of books: a page flagged with a note, listed for whoever fixes the art or
 * the references. Nothing is redrawn automatically.
 */
@Injectable()
export class FlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Open flags first, newest first; `resolved` narrows to one kind. */
  async list(resolved?: boolean): Promise<PageFlag[]> {
    const rows = await this.prisma.pageFlag.findMany({
      where: resolved === undefined ? undefined : { resolved },
      orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include: { book: { select: { title: true } } },
    });
    return rows.map(dto);
  }

  async forBook(bookId: string): Promise<PageFlag[]> {
    const rows = await this.prisma.pageFlag.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
      include: { book: { select: { title: true } } },
    });
    return rows.map(dto);
  }

  async create(
    bookId: string,
    input: CreatePageFlag,
    who: string | null,
  ): Promise<PageFlag> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true },
    });
    if (!book) throw new NotFoundException(`book ${bookId} not found`);
    const row = await this.prisma.pageFlag.create({
      data: { bookId, page: input.page, note: input.note, createdBy: who },
      include: { book: { select: { title: true } } },
    });
    return dto(row);
  }

  async setResolved(id: string, resolved: boolean): Promise<PageFlag> {
    const found = await this.prisma.pageFlag.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`flag ${id} not found`);
    const row = await this.prisma.pageFlag.update({
      where: { id },
      data: { resolved, resolvedAt: resolved ? new Date() : null },
      include: { book: { select: { title: true } } },
    });
    return dto(row);
  }
}

function dto(row: FlagWithBook): PageFlag {
  return {
    id: row.id,
    bookId: row.bookId,
    bookTitle: row.book.title,
    page: row.page,
    note: row.note,
    resolved: row.resolved,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
