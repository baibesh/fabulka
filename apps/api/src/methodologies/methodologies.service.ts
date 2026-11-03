import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Methodology as MethodologyRow } from '@prisma/client';
import {
  DEFAULT_METHODOLOGIES,
  METHODOLOGY_AGE,
  METHODOLOGY_EXISTS,
  METHODOLOGY_IN_USE,
  METHODOLOGY_UNKNOWN,
  defaultMethodology,
  fitsAge,
  methodologyText,
  type AdminMethodology,
  type CreateMethodology,
  type Language,
  type Methodology,
  type MethodologyData,
  type MethodologyPreview,
  type MethodologyPreviewResult,
  type MethodologyTexts,
  type UpdateMethodology,
} from '@fabulka/shared';
import { seedTextUpdates } from '../common/seed-texts';
import { methodPrompt } from '../meta/prompts';
import { PrismaService } from '../prisma/prisma.service';
import { SEEDED_METHOD_TEXTS_V1 } from './seeded';

/** How long methods are kept in memory; an edit in the admin drops them at once. */
export const CACHE_MS = 60_000;

/** Catalog books and books that follow each method, by slug. */
interface Usage {
  templates: Map<string, number>;
  books: Map<string, number>;
}

/**
 * Story methods: the public list, the one a new book follows, and the admin's edits. Every book
 * reads them, so they are cached in memory (one process serves the API).
 */
@Injectable()
export class MethodologiesService implements OnModuleInit {
  private readonly logger = new Logger(MethodologiesService.name);
  private cache: { at: number; rows: Promise<MethodologyRow[]> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Adds the seed methods that are missing; never overwrites what the admin has changed. */
  async onModuleInit() {
    const { count } = await this.prisma.methodology.createMany({
      data: DEFAULT_METHODOLOGIES.map((m, i) => ({
        slug: m.slug,
        texts: m.texts,
        source: m.source,
        ageMin: m.ageMin,
        ageMax: m.ageMax,
        structure: m.structure,
        rules: m.rules,
        avoid: m.avoid,
        maxWordsPerPage: m.maxWordsPerPage ?? null,
        sortOrder: i * 10,
      })),
      skipDuplicates: true,
    });
    if (count) this.logger.log(`added ${count} story methods`);
    await this.addSeedTexts();
    this.invalidate();
  }

  /**
   * Gives the seed methods today's seed texts where a method has none in a language added after it
   * was seeded, or still has an older seed text (SEEDED_METHOD_TEXTS_*); a text the admin wrote is
   * never replaced.
   */
  private async addSeedTexts() {
    const seeds = new Map(DEFAULT_METHODOLOGIES.map((m) => [m.slug, m]));
    const rows = await this.prisma.methodology.findMany({
      where: { slug: { in: [...seeds.keys()] } },
      select: { slug: true, texts: true },
    });
    for (const row of rows) {
      const seed = seeds.get(row.slug);
      if (!seed) continue;
      const texts = { ...(row.texts as MethodologyTexts | null) };
      const langs = seedTextUpdates(
        texts,
        seed.texts,
        [SEEDED_METHOD_TEXTS_V1[row.slug]],
        (text) => {
          const t = text as MethodologyTexts[Language] | undefined;
          return !t?.name && !t?.summary;
        },
      );
      if (!langs.length) continue;
      for (const lang of langs) texts[lang] = seed.texts[lang];
      await this.prisma.methodology.updateMany({
        where: { slug: row.slug },
        data: { texts },
      });
      this.logger.log(`updated ${langs.join(', ')} texts of ${row.slug}`);
    }
  }

  /** Every method, published or not, in the admin's order. */
  all(): Promise<MethodologyRow[]> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const rows = this.prisma.methodology.findMany({
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      });
      // A failed read is not kept: the next request asks the database again.
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

  /** GET /methodologies: the published methods in `lang`, Russian where a text is missing. */
  async list(lang: Language = 'ru'): Promise<Methodology[]> {
    const rows = await this.all();
    return rows
      .filter((row) => row.published)
      .map((row) => toPublic(row, lang));
  }

  /**
   * The method a book of your own follows: the parent's pick, when it is published and fits the
   * child's age, else the default for the age.
   */
  async forBook(
    slug: string | undefined,
    age: number,
  ): Promise<MethodologyData> {
    const published = (await this.all()).filter((row) => row.published);
    if (!slug) {
      const picked = defaultMethodology(published, age);
      if (!picked) {
        throw new BadRequestException({
          code: METHODOLOGY_AGE,
          message: `Для возраста ${age} лет пока нет методики`,
        });
      }
      return toData(picked);
    }
    const method = published.find((row) => row.slug === slug);
    if (!method) {
      throw new BadRequestException({
        code: METHODOLOGY_UNKNOWN,
        message: `Методики «${slug}» нет`,
      });
    }
    if (!fitsAge(method, age)) {
      throw new BadRequestException({
        code: METHODOLOGY_AGE,
        message: `«${methodologyText(texts(method), 'ru').name}» подходит для возраста ${method.ageMin}–${method.ageMax} лет`,
      });
    }
    return toData(method);
  }

  /** A catalog book's method: it may be unpublished, since the parent picked the book, not it. */
  async forTemplate(slug: string): Promise<MethodologyData> {
    const method = await this.find(slug);
    if (!method) {
      throw new BadRequestException({
        code: METHODOLOGY_UNKNOWN,
        message: `Методики «${slug}» нет`,
      });
    }
    return toData(method);
  }

  async find(slug: string): Promise<MethodologyRow | undefined> {
    return (await this.all()).find((row) => row.slug === slug);
  }

  async adminList(): Promise<AdminMethodology[]> {
    const [rows, usage] = await Promise.all([this.all(), this.usage()]);
    return rows.map((row) => toAdmin(row, usage));
  }

  async adminGet(slug: string): Promise<AdminMethodology> {
    const row = await this.prisma.methodology.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`Методики «${slug}» нет`);
    return toAdmin(row, await this.usage(slug));
  }

  async create(input: CreateMethodology): Promise<AdminMethodology> {
    try {
      await this.prisma.methodology.create({ data: input });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: METHODOLOGY_EXISTS,
          message: `Методика с адресом «${input.slug}» уже есть`,
        });
      }
      throw error;
    }
    this.invalidate();
    return this.adminGet(input.slug);
  }

  async update(
    slug: string,
    input: UpdateMethodology,
  ): Promise<AdminMethodology> {
    const { count } = await this.prisma.methodology.updateMany({
      where: { slug },
      data: input,
    });
    if (!count) throw new NotFoundException(`Методики «${slug}» нет`);
    this.invalidate();
    return this.adminGet(slug);
  }

  /**
   * Deletes a method nothing follows. Books keep their method's slug and catalog books write new
   * books by it, so a method in use is refused: unpublishing takes it off the site instead.
   */
  async remove(slug: string): Promise<void> {
    const row = await this.prisma.methodology.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`Методики «${slug}» нет`);
    const usage = await this.usage(slug);
    const templates = usage.templates.get(slug) ?? 0;
    const books = usage.books.get(slug) ?? 0;
    if (templates || books) {
      const users = [
        templates && `книги каталога (${templates})`,
        books && `созданные книги (${books})`,
      ].filter(Boolean);
      throw new ConflictException({
        code: METHODOLOGY_IN_USE,
        message:
          `Методику нельзя удалить: её используют ${users.join(' и ')}. ` +
          'Снимите её с публикации — тогда её перестанут предлагать родителям.',
        templates,
        books,
      });
    }
    await this.prisma.methodology.delete({ where: { slug } });
    this.invalidate();
  }

  /** The method part of the story prompt, for a sample child in the middle of its age range. */
  preview(draft: MethodologyPreview): MethodologyPreviewResult {
    const age = Math.floor((draft.ageMin + draft.ageMax) / 2);
    return {
      age,
      prompt: methodPrompt(
        {
          slug: draft.slug || 'new-method',
          source: draft.source,
          structure: draft.structure,
          rules: draft.rules,
          avoid: draft.avoid,
          maxWordsPerPage: draft.maxWordsPerPage,
        },
        age,
      ),
    };
  }

  private async usage(slug?: string): Promise<Usage> {
    const where = slug ? { methodology: slug } : undefined;
    const [templates, books] = await Promise.all([
      this.prisma.bookTemplate.groupBy({
        by: ['methodology'],
        where,
        _count: true,
      }),
      this.prisma.book.groupBy({ by: ['methodology'], where, _count: true }),
    ]);
    return {
      templates: new Map(templates.map((t) => [t.methodology, t._count])),
      books: new Map(books.map((b) => [b.methodology, b._count])),
    };
  }
}

const texts = (row: MethodologyRow) => row.texts as unknown as MethodologyTexts;

export function toData(row: MethodologyRow): MethodologyData {
  return {
    slug: row.slug,
    texts: texts(row),
    source: row.source,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    structure: row.structure as string[],
    rules: row.rules as string[],
    avoid: row.avoid as string[],
    maxWordsPerPage: row.maxWordsPerPage,
  };
}

/** In `lang`, each text falling back to Russian, then English (methodologyText). */
function toPublic(row: MethodologyRow, lang: Language): Methodology {
  const { name, summary } = methodologyText(texts(row), lang);
  return {
    slug: row.slug,
    name,
    summary,
    source: row.source,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
  };
}

function toAdmin(row: MethodologyRow, usage: Usage): AdminMethodology {
  return {
    ...toData(row),
    maxWordsPerPage: row.maxWordsPerPage,
    published: row.published,
    sortOrder: row.sortOrder,
    templates: usage.templates.get(row.slug) ?? 0,
    books: usage.books.get(row.slug) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
