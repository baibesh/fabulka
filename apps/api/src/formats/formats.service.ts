import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma, StoryFormat as StoryFormatRow } from '@prisma/client';
import {
  DEFAULT_STORY_FORMATS,
  PICTURE_BOOK,
  STORY_FORMAT_EXISTS,
  STORY_FORMAT_IN_USE,
  formatEstimate,
  storyFormatText,
  type AdminStoryFormat,
  type CreateStoryFormat,
  type FormatTextRule,
  type FrameGrid,
  type Language,
  type StoryFormatData,
  type StoryFormatSummary,
  type StoryFormatTexts,
  type UpdateStoryFormat,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';

/** How long formats are kept in memory; an edit in the admin drops them at once. */
const CACHE_MS = 60_000;

/**
 * Story formats: what a page is made of (a grid of frames and the texts tied to them), as data the
 * superadmin edits like methods. Every book reads its format, so they are cached in memory.
 */
@Injectable()
export class FormatsService implements OnModuleInit {
  private readonly logger = new Logger(FormatsService.name);
  private cache: { at: number; rows: Promise<StoryFormatRow[]> } | null = null;
  /** The page count of a format that sets none (PAGE_COUNT), for the estimates. */
  pageCount = 10;

  constructor(private readonly prisma: PrismaService) {}

  /** Adds the seed formats that are missing; never overwrites what the admin changed. */
  async onModuleInit() {
    const { count } = await this.prisma.storyFormat.createMany({
      data: DEFAULT_STORY_FORMATS.map((f) => toRow(f, true, f.sortOrder)),
      skipDuplicates: true,
    });
    if (count) this.logger.log(`added ${count} story formats`);
    this.invalidate();
  }

  all(): Promise<StoryFormatRow[]> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const rows = this.prisma.storyFormat.findMany({
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      });
      rows.catch(() => {
        if (this.cache?.rows === rows) this.cache = null;
      });
      this.cache = { at: Date.now(), rows };
    }
    return this.cache.rows;
  }

  invalidate() {
    this.cache = null;
  }

  /**
   * The format a book is made in: its method's, published or not (the method was picked, not the
   * format). A format that is gone falls back to the picture book, which the API always seeds.
   */
  async forBook(slug: string | undefined): Promise<StoryFormatData> {
    const rows = await this.all();
    const row =
      rows.find((r) => r.slug === (slug ?? PICTURE_BOOK)) ??
      rows.find((r) => r.slug === PICTURE_BOOK);
    if (row) return toData(row);
    const seed = DEFAULT_STORY_FORMATS.find((f) => f.slug === PICTURE_BOOK)!;
    return seed;
  }

  async exists(slug: string): Promise<boolean> {
    return (await this.all()).some((row) => row.slug === slug);
  }

  /** Every format by name in `lang`, for pickers. */
  async summaries(lang: Language): Promise<StoryFormatSummary[]> {
    return (await this.all()).map((row) => ({
      slug: row.slug,
      ...storyFormatText(row.texts as StoryFormatTexts, lang),
    }));
  }

  async adminList(): Promise<AdminStoryFormat[]> {
    const [rows, usage] = await Promise.all([this.all(), this.usage()]);
    return rows.map((row) => this.toAdmin(row, usage));
  }

  async adminGet(slug: string): Promise<AdminStoryFormat> {
    const row = await this.prisma.storyFormat.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`No story format «${slug}»`);
    return this.toAdmin(row, await this.usage(slug));
  }

  async create(input: CreateStoryFormat): Promise<AdminStoryFormat> {
    try {
      await this.prisma.storyFormat.create({
        data: toRow(input, input.published, input.sortOrder),
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: STORY_FORMAT_EXISTS,
          message: `A story format «${input.slug}» exists`,
        });
      }
      throw error;
    }
    this.invalidate();
    return this.adminGet(input.slug);
  }

  async update(
    slug: string,
    input: UpdateStoryFormat,
  ): Promise<AdminStoryFormat> {
    const { slug: _slug, ...data } = toRow(
      { ...input, slug },
      input.published,
      input.sortOrder,
    );
    void _slug;
    const { count } = await this.prisma.storyFormat.updateMany({
      where: { slug },
      data,
    });
    if (!count) throw new NotFoundException(`No story format «${slug}»`);
    this.invalidate();
    return this.adminGet(slug);
  }

  /** Deletes a format nothing uses; the picture book, every method's fallback, never goes. */
  async remove(slug: string): Promise<void> {
    const row = await this.prisma.storyFormat.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`No story format «${slug}»`);
    const usage = await this.usage(slug);
    const methods = usage.methods.get(slug) ?? [];
    const books = usage.books.get(slug) ?? 0;
    if (slug === PICTURE_BOOK || methods.length || books) {
      throw new ConflictException({
        code: STORY_FORMAT_IN_USE,
        message:
          slug === PICTURE_BOOK
            ? 'The picture book is every method’s fallback: it cannot be deleted.'
            : `The format is in use (methods: ${methods.join(', ') || 'none'}; books: ${books}). Unpublish it instead.`,
        methodologies: methods,
        books,
      });
    }
    await this.prisma.storyFormat.delete({ where: { slug } });
    this.invalidate();
  }

  private async usage(slug?: string) {
    const where = slug ? { format: slug } : undefined;
    const [methods, books] = await Promise.all([
      this.prisma.methodology.findMany({
        where,
        select: { slug: true, format: true },
      }),
      this.prisma.book.groupBy({
        by: ['storyFormat'],
        where: slug ? { storyFormat: slug } : undefined,
        _count: true,
      }),
    ]);
    const byFormat = new Map<string, string[]>();
    for (const m of methods)
      byFormat.set(m.format, [...(byFormat.get(m.format) ?? []), m.slug]);
    return {
      methods: byFormat,
      books: new Map(books.map((b) => [b.storyFormat, b._count])),
    };
  }

  private toAdmin(
    row: StoryFormatRow,
    usage: Awaited<ReturnType<FormatsService['usage']>>,
  ): AdminStoryFormat {
    const data = toData(row);
    return {
      ...data,
      published: row.published,
      sortOrder: row.sortOrder,
      methodologies: usage.methods.get(row.slug) ?? [],
      books: usage.books.get(row.slug) ?? 0,
      estimate: formatEstimate(data, { pages: this.pageCount }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export function toData(row: StoryFormatRow): StoryFormatData {
  return {
    slug: row.slug,
    texts: row.texts as StoryFormatTexts,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    pageCount: row.pageCount,
    grids: row.grids as unknown as FrameGrid[],
    textRules: row.textRules as unknown as FormatTextRule[],
    rules: row.rules as string[],
    artStyle: row.artStyle,
    frameDirection: row.frameDirection,
    castSheets: row.castSheets,
    theme: row.theme,
    gutterMm: row.gutterMm,
    borderMm: row.borderMm,
  };
}

function toRow(
  f: StoryFormatData,
  published: boolean,
  sortOrder: number,
): Prisma.StoryFormatCreateInput {
  const json = (value: unknown) => value as Prisma.InputJsonValue;
  return {
    slug: f.slug,
    texts: json(f.texts),
    ageMin: f.ageMin,
    ageMax: f.ageMax,
    pageCount: f.pageCount,
    grids: json(f.grids),
    textRules: json(f.textRules),
    rules: json(f.rules),
    artStyle: f.artStyle,
    frameDirection: f.frameDirection,
    castSheets: f.castSheets,
    theme: f.theme,
    gutterMm: f.gutterMm,
    borderMm: f.borderMm,
    published,
    sortOrder,
  };
}
