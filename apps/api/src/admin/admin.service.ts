import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AdminBook,
  type AdminBookRow,
  type AdminStats,
  type AdminTemplate,
  type Answers,
  type ChildProfile,
  type Language,
  type SampleOption,
  type UpdateTemplate,
  TemplateBlocksSchema,
} from '@fabulka/shared';
import { Prisma } from '@prisma/client';
import { BooksService, withTemplate } from '../books/books.service';
import { MethodologiesService } from '../methodologies/methodologies.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService, startOfDay } from '../quota/quota.service';
import { ReferenceService } from '../reference/reference.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { questions, TemplatesService } from '../templates/templates.service';
import { ThemesService } from '../themes/themes.service';

/** A catalog book with its samples and how many books were made from it. */
const withSamples = {
  _count: { select: { books: true } },
  samples: { select: { language: true, bookId: true } },
} satisfies Prisma.BookTemplateInclude;
type TemplateWithSamples = Prisma.BookTemplateGetPayload<{
  include: typeof withSamples;
}>;

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
    private readonly themes: ThemesService,
    private readonly reference: ReferenceService,
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
      include: {
        ...withTemplate,
        _count: { select: { orders: true } },
        exampleOf: { select: { exampleId: true } },
      },
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
      example: row.exampleOf !== null,
      costUsd: row.costUsd,
      orders: row._count.orders,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async book(id: string): Promise<AdminBook> {
    const row = await this.prisma.book.findUnique({
      where: { id },
      include: {
        template: { select: { slug: true } },
        exampleOf: { select: { exampleId: true, language: true } },
      },
    });
    if (!row) throw new NotFoundException(`book ${id} not found`);
    return {
      ...this.books.toDto(row),
      child: row.child as unknown as ChildProfile,
      theme: row.theme,
      answers: row.answers as Answers | null,
      country: row.country,
      demo: row.demo,
      example: row.exampleOf
        ? {
            id: row.exampleOf.exampleId,
            language: row.exampleOf.language as Language,
          }
        : null,
      costUsd: row.costUsd,
      clientKey: row.clientKey,
    };
  }

  /**
   * Deletes a book, its orders and its files, e.g. when a parent asks to. An example it was the
   * only version of goes too.
   */
  async deleteBook(id: string): Promise<void> {
    const { count } = await this.prisma.book.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException(`book ${id} not found`);
    await this.storage.removeDir(`books/${id}`);
    await this.prisma.example.deleteMany({ where: { versions: { none: {} } } });
  }

  /** The catalog books; sampleOptions is filled for one book only (template()). */
  async listTemplates(): Promise<AdminTemplate[]> {
    const rows = await this.prisma.bookTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
      include: withSamples,
    });
    return rows.map((row) => this.templateDto(row, []));
  }

  async template(slug: string): Promise<AdminTemplate> {
    const row = await this.prisma.bookTemplate.findUnique({
      where: { slug },
      include: withSamples,
    });
    if (!row) throw new NotFoundException(`template ${slug} not found`);
    const options = await this.prisma.book.findMany({
      where: { templateId: row.id, status: 'done' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        child: true,
        language: true,
        createdAt: true,
      },
    });
    return this.templateDto(
      row,
      options.map((book) => ({
        id: book.id,
        title: book.title,
        childName: (book.child as unknown as ChildProfile).name,
        language: book.language as Language,
        createdAt: book.createdAt.toISOString(),
      })),
    );
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
    for (const [language, bookId] of Object.entries(patch.samples ?? {})) {
      if (bookId) await this.assertSample(slug, language, bookId);
    }
    // Only a theme whose fonts cover every language the template is written in.
    if (
      patch.layoutTheme &&
      !(await this.themes.selectable(current.languages)).some(
        (t) => t.id === patch.layoutTheme,
      )
    ) {
      throw new BadRequestException(
        `Тема «${patch.layoutTheme}» не подходит для языков ${current.languages.join(', ')}`,
      );
    }
    if (patch.countries)
      await this.assertCountries(patch.countries, current.countries);
    const { blocks, samples, ...rest } = patch;
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.bookTemplate.update({
        where: { slug },
        data: {
          ...rest,
          ...(blocks !== undefined && {
            blocks:
              blocks === null
                ? Prisma.DbNull
                : (blocks as Prisma.InputJsonValue),
          }),
        },
      });
      for (const [language, bookId] of Object.entries(samples ?? {})) {
        await tx.templateSample.deleteMany({
          where: { templateId: row.id, language },
        });
        if (bookId)
          await tx.templateSample.create({
            data: { templateId: row.id, language, bookId },
          });
      }
    });
    return this.template(slug);
  }

  /**
   * A template's sample in a language must be a finished book made from it in that language, and
   * not already another template's sample.
   */
  private async assertSample(
    slug: string,
    language: string,
    bookId: string,
  ): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: {
        status: true,
        language: true,
        template: { select: { slug: true } },
        sampleOf: { select: { template: { select: { slug: true } } } },
      },
    });
    if (!book) throw new BadRequestException(`Книги ${bookId} нет`);
    if (book.status !== 'done')
      throw new BadRequestException('Образцом может быть только готовая книга');
    if (book.template?.slug !== slug)
      throw new BadRequestException(
        'Образцом может быть только книга по этому шаблону',
      );
    if (book.language !== language)
      throw new BadRequestException(
        `Эта книга на языке «${book.language}», а не «${language}»`,
      );
    const other = book.sampleOf?.template.slug;
    if (other && other !== slug)
      throw new BadRequestException(`Эта книга уже образец для «${other}»`);
  }

  /**
   * A catalog book or an example is listed only in countries the site offers (reference.countries);
   * one it has already (`current`) may stay after the owner takes it off the list.
   */
  private async assertCountries(
    codes: string[],
    current: readonly string[],
  ): Promise<void> {
    const offered = new Set([
      ...(await this.reference.countries()).map((c) => c.code),
      ...current,
    ]);
    const unknown = codes.filter((code) => !offered.has(code));
    if (unknown.length)
      throw new BadRequestException(
        `Страны ${unknown.join(', ')} нет в справочнике стран`,
      );
  }

  setPaused(paused: boolean) {
    return this.settings.setPaused(paused);
  }

  private templateDto(
    row: TemplateWithSamples,
    sampleOptions: SampleOption[],
  ): AdminTemplate {
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
      layoutTheme: row.layoutTheme,
      blocks: TemplateBlocksSchema.safeParse(row.blocks).data ?? null,
      countries: row.countries,
      samples: Object.fromEntries(
        row.samples.map((s) => [s.language, s.bookId]),
      ),
      sampleOptions,
      books: row._count.books,
    };
  }
}
