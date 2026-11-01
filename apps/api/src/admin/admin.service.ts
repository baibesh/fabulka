import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BookTemplate } from '@prisma/client';
import {
  type AdminBook,
  type AdminBookRow,
  type AdminStats,
  type AdminTemplate,
  type Answers,
  type ChildProfile,
  type Language,
  type UpdateTemplate,
} from '@fabulka/shared';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BooksService, withTemplate } from '../books/books.service';
import { MethodologiesService } from '../methodologies/methodologies.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService, startOfDay } from '../quota/quota.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { questions, TemplatesService } from '../templates/templates.service';

/** What the admin reads and changes; every route behind AdminGuard. */
@Injectable()
export class AdminService {
  private readonly budgetUsd: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly books: BooksService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly templates: TemplatesService,
    private readonly methodologies: MethodologiesService,
    config: ConfigService,
  ) {
    this.budgetUsd = Number(config.get('MODEL_BUDGET_USD', 150));
  }

  async stats(): Promise<AdminStats> {
    const today = { createdAt: { gte: startOfDay() } };
    const [
      paused,
      total,
      todayCount,
      byStatus,
      spend,
      spendToday,
      duration,
      caps,
      orders,
      purchases,
      countries,
      templateCounts,
      templateRows,
      printInterest,
    ] = await Promise.all([
      this.settings.paused(),
      this.prisma.book.count(),
      this.prisma.book.count({ where: today }),
      this.prisma.book.groupBy({ by: ['status'], _count: true }),
      this.prisma.book.aggregate({ _sum: { costUsd: true } }),
      this.prisma.book.aggregate({ where: today, _sum: { costUsd: true } }),
      this.prisma.$queryRaw<{ seconds: number | null }[]>`
        select avg(extract(epoch from ("updatedAt" - "createdAt")))::float as seconds
        from "Book" where status = 'done'`,
      this.quota.caps(),
      this.prisma.order.aggregate({ _count: true, _sum: { totalKzt: true } }),
      this.prisma.credit.aggregate({
        _sum: { books: true, priceKzt: true, priceUsd: true },
      }),
      this.prisma.book.groupBy({
        by: ['country'],
        where: { country: { not: null } },
        _count: true,
        orderBy: { _count: { country: 'desc' } },
        take: 10,
      }),
      this.prisma.book.groupBy({ by: ['templateId'], _count: true }),
      this.prisma.bookTemplate.findMany({
        select: { id: true, slug: true, title: true },
      }),
      this.prisma.printInterest.groupBy({
        by: ['country'],
        _count: true,
        orderBy: { _count: { country: 'desc' } },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      byStatus.map((s) => [s.status, s._count]),
    );
    const done = statusCounts.done ?? 0;
    const failed = statusCounts.failed ?? 0;
    const titles = new Map(templateRows.map((t) => [t.id, t]));
    return {
      paused,
      books: {
        total,
        today: todayCount,
        byStatus: statusCounts,
        successRate: done + failed ? done / (done + failed) : null,
        avgSeconds: duration[0]?.seconds ?? null,
      },
      spend: {
        totalUsd: spend._sum.costUsd ?? 0,
        todayUsd: spendToday._sum.costUsd ?? 0,
        budgetUsd: this.budgetUsd,
      },
      caps,
      sales: {
        orders: orders._count,
        ordersKzt: orders._sum.totalKzt ?? 0,
        purchases: purchases._sum.books ?? 0,
        purchasesKzt: purchases._sum.priceKzt ?? 0,
        purchasesUsd: Math.round((purchases._sum.priceUsd ?? 0) * 100) / 100,
      },
      printInterest: printInterest.map((p) => ({
        country: p.country,
        requests: p._count,
      })),
      countries: countries.map((c) => ({
        country: c.country!,
        books: c._count,
      })),
      templates: templateCounts
        .map((t) => {
          const template = t.templateId ? titles.get(t.templateId) : undefined;
          return {
            slug: template?.slug ?? null,
            title: template?.title ?? 'Своя история',
            books: t._count,
          };
        })
        .sort((a, b) => b.books - a.books),
    };
  }

  async listBooks(status?: string): Promise<AdminBookRow[]> {
    const rows = await this.prisma.book.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { ...withTemplate, _count: { select: { orders: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      childName: (row.child as unknown as ChildProfile).name,
      language: row.language as Language,
      methodology: row.methodology,
      template: row.template?.slug ?? null,
      country: row.country,
      demo: row.demo,
      featured: row.featured,
      costUsd: row.costUsd,
      orders: row._count.orders,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async book(id: string): Promise<AdminBook> {
    const row = await this.prisma.book.findUnique({
      where: { id },
      include: withTemplate,
    });
    if (!row) throw new NotFoundException(`book ${id} not found`);
    return {
      ...this.books.toDto(row),
      child: row.child as unknown as ChildProfile,
      theme: row.theme,
      answers: row.answers as Answers | null,
      country: row.country,
      demo: row.demo,
      featured: row.featured,
      costUsd: row.costUsd,
      clientKey: row.clientKey,
    };
  }

  /** Shows a book on the home page as an example, or takes it off; only a finished one goes on. */
  async setFeatured(id: string, featured: boolean): Promise<AdminBook> {
    const row = await this.prisma.book.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!row) throw new NotFoundException(`book ${id} not found`);
    if (featured && row.status !== 'done') {
      throw new BadRequestException(
        'В примеры можно поставить только готовую книгу',
      );
    }
    await this.prisma.book.update({ where: { id }, data: { featured } });
    return this.book(id);
  }

  /** Deletes a book, its orders and its files, e.g. when a parent asks to. */
  async deleteBook(id: string): Promise<void> {
    const { count } = await this.prisma.book.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException(`book ${id} not found`);
    await rm(join(this.storage.root, 'books', id), {
      recursive: true,
      force: true,
    });
  }

  async listTemplates(): Promise<AdminTemplate[]> {
    const rows = await this.prisma.bookTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { books: true } } },
    });
    return rows.map((row) => this.templateDto(row, row._count.books));
  }

  async template(slug: string): Promise<AdminTemplate> {
    const row = await this.prisma.bookTemplate.findUnique({
      where: { slug },
      include: { _count: { select: { books: true } } },
    });
    if (!row) throw new NotFoundException(`template ${slug} not found`);
    return this.templateDto(row, row._count.books);
  }

  async updateTemplate(
    slug: string,
    patch: UpdateTemplate,
  ): Promise<AdminTemplate> {
    const current = await this.template(slug);
    const ageMin = patch.ageMin ?? current.ageMin;
    const ageMax = patch.ageMax ?? current.ageMax;
    if (ageMin > ageMax)
      throw new BadRequestException('Минимальный возраст больше максимального');
    for (const q of patch.questions ?? []) {
      if (q.kind === 'choice' && !q.options?.length) {
        throw new BadRequestException(
          `У вопроса «${q.label}» нет вариантов ответа`,
        );
      }
    }
    if (
      patch.methodology &&
      !(await this.methodologies.find(patch.methodology))
    )
      throw new BadRequestException(`Методики «${patch.methodology}» нет`);
    if (patch.sampleBookId) await this.assertSample(slug, patch.sampleBookId);
    await this.prisma.bookTemplate.update({
      where: { slug },
      data: {
        ...patch,
      },
    });
    return this.template(slug);
  }

  /** A template's sample must be a finished book that is not already another template's sample. */
  private async assertSample(slug: string, bookId: string): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { status: true, sampleOf: { select: { slug: true } } },
    });
    if (!book) throw new BadRequestException(`Книги ${bookId} нет`);
    if (book.status !== 'done')
      throw new BadRequestException('Образцом может быть только готовая книга');
    if (book.sampleOf && book.sampleOf.slug !== slug) {
      throw new BadRequestException(
        `Эта книга уже образец для «${book.sampleOf.slug}»`,
      );
    }
  }

  setPaused(paused: boolean) {
    return this.settings.setPaused(paused);
  }

  private templateDto(row: BookTemplate, books: number): AdminTemplate {
    return {
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      methodology: row.methodology,
      languages: row.languages as AdminTemplate['languages'],
      coverUrl: row.coverUrl,
      questions: questions(row),
      published: row.published,
      sortOrder: row.sortOrder,
      theme: row.theme,
      plot: row.plot as string[],
      stylePrompt: row.stylePrompt,
      sampleBookId: row.sampleBookId,
      books,
    };
  }
}
