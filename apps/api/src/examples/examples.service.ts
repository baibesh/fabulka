import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  LANGUAGES,
  exampleVersionState,
  inLanguageOrder,
  type AdminExample,
  type ChildProfile,
  type ExampleBook,
  type ExampleError,
  type Language,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import { EXAMPLES_TAG, SeoWebService } from '../seo/seo-web.service';
import { StorageService } from '../storage/storage.service';
import { listedWhere } from '../templates/templates.service';
import {
  orSamples,
  pickExamples,
  templateCountriesOf,
  type Candidate,
} from './selection';
import { TRANSLATION_CLIENT_KEY } from './translation';
import { TranslatorService } from './translator.service';

/** What a version's book brings to the admin list and the home page. */
const versionBook = {
  select: {
    id: true,
    title: true,
    language: true,
    status: true,
    progress: true,
    error: true,
    child: true,
    heroImagePath: true,
    clientKey: true,
    costUsd: true,
    template: { select: { countries: true } },
  },
} satisfies Prisma.BookDefaultArgs;

const withVersions = {
  versions: {
    orderBy: { createdAt: 'asc' },
    include: { book: versionBook },
  },
} satisfies Prisma.ExampleInclude;
type ExampleRow = Prisma.ExampleGetPayload<{ include: typeof withVersions }>;

/** The home page's order: by sortOrder, the newest first among equals. */
const ORDER: Prisma.ExampleOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'desc' },
];

/** A refusal the admin shows in its own words, by code (admin.examples.error.<code>). */
function refuse(
  status: HttpStatus,
  code: ExampleError,
  message: string,
): HttpException {
  const body = { code, message };
  if (status === HttpStatus.NOT_FOUND) return new NotFoundException(body);
  if (status === HttpStatus.CONFLICT) return new ConflictException(body);
  return new BadRequestException(body);
}

/**
 * The home page's examples (admin «Examples»): stories with a version per language, shown in the
 * page's language only, in the countries staff pick. Every change tells the site to drop its cached
 * list of example books (EXAMPLES_TAG); the home page itself reads the list on each request.
 */
@Injectable()
export class ExamplesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reference: ReferenceService,
    private readonly translator: TranslatorService,
    private readonly web: SeoWebService,
  ) {}

  // ---- The site ---------------------------------------------------------------------------------

  /**
   * GET /books/examples: for each example shown in `country`, its finished version in exactly
   * `language` (pickExamples); with none, the catalog samples in that language for catalog books
   * listed in that country.
   */
  async forSite(
    country: string | null,
    language: Language,
  ): Promise<ExampleBook[]> {
    const rows = await this.prisma.example.findMany({
      orderBy: ORDER,
      include: withVersions,
    });
    const picked = pickExamples(rows.map(candidate), country, language);
    const samples = picked.length ? [] : await this.samples(country, language);
    return orSamples(picked, samples).map((entry) =>
      entry.kind === 'example'
        ? {
            id: entry.item.version.bookId,
            title: entry.item.version.title!,
            language,
            heroImageUrl: this.storage.url(entry.item.version.heroImagePath),
            kind: 'example' as const,
          }
        : { ...entry.item, kind: 'sample' as const },
    );
  }

  /** Finished catalog samples in `language`, for published catalog books listed in `country`. */
  private async samples(
    country: string | null,
    language: Language,
  ): Promise<Omit<ExampleBook, 'kind'>[]> {
    const rows = await this.prisma.templateSample.findMany({
      where: {
        language,
        book: { status: 'done', title: { not: null } },
        template: { published: true, ...listedWhere(country) },
      },
      orderBy: { template: { sortOrder: 'asc' } },
      include: {
        book: { select: { id: true, title: true, heroImagePath: true } },
      },
    });
    return rows.map((row) => ({
      id: row.book.id,
      title: row.book.title!,
      language,
      heroImageUrl: this.storage.url(row.book.heroImagePath),
    }));
  }

  /**
   * Every finished version of every example, wherever it is shown: the sitemap and the SEO admin
   * list each in its own language, with the story's other versions as its alternates.
   */
  async publicVersions() {
    const rows = await this.prisma.example.findMany({
      orderBy: ORDER,
      include: {
        versions: {
          where: { book: { status: 'done', title: { not: null } } },
          include: {
            book: {
              select: {
                id: true,
                title: true,
                heroImagePath: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
    return rows.flatMap((row) => {
      const versions = Object.fromEntries(
        row.versions.map((v) => [v.language, v.bookId]),
      ) as Partial<Record<Language, string>>;
      return row.versions.map((v) => ({
        id: v.bookId,
        language: v.language as Language,
        title: v.book.title,
        heroImagePath: v.book.heroImagePath,
        updatedAt: v.book.updatedAt,
        versions,
      }));
    });
  }

  // ---- The admin --------------------------------------------------------------------------------

  async list(): Promise<AdminExample[]> {
    const rows = await this.prisma.example.findMany({
      orderBy: ORDER,
      include: withVersions,
    });
    return rows.map((row) => this.dto(row));
  }

  async get(id: string): Promise<AdminExample> {
    return this.dto(await this.row(id));
  }

  /** A new example with this finished book as its version in the book's language, first on the home page. */
  async create(bookId: string): Promise<AdminExample> {
    const book = await this.assertBook(bookId);
    const first = await this.prisma.example.aggregate({
      _min: { sortOrder: true },
    });
    const example = await this.prisma.example.create({
      data: {
        sortOrder: (first._min.sortOrder ?? 1) - 1,
        versions: { create: { language: book.language, bookId } },
      },
    });
    this.changed();
    return this.get(example.id);
  }

  /** Adds a finished book as the example's version in its language (one not taken yet). */
  async addVersion(id: string, bookId: string): Promise<AdminExample> {
    const example = await this.row(id);
    const book = await this.assertBook(bookId);
    if (example.versions.some((v) => v.language === book.language)) {
      throw refuse(
        HttpStatus.CONFLICT,
        'example_language_taken',
        `The example has a ${book.language} version already`,
      );
    }
    await this.prisma.exampleVersion.create({
      data: { exampleId: id, language: book.language, bookId },
    });
    this.changed();
    return this.get(id);
  }

  /**
   * Takes a version off the example; its book stays (a translation that failed is deleted with its
   * files, as nobody else has it). An example left with no version goes too.
   */
  async removeVersion(id: string, language: string): Promise<void> {
    const example = await this.row(id);
    const version = example.versions.find((v) => v.language === language);
    if (!version) {
      throw refuse(
        HttpStatus.NOT_FOUND,
        'example_version_not_found',
        `The example has no ${language} version`,
      );
    }
    await this.prisma.exampleVersion.delete({
      where: { exampleId_language: { exampleId: id, language } },
    });
    if (
      version.book.status === 'failed' &&
      version.book.clientKey === TRANSLATION_CLIENT_KEY
    )
      await this.deleteBook(version.bookId);
    await this.prisma.example.deleteMany({
      where: { id, versions: { none: {} } },
    });
    this.changed();
  }

  /** Takes the example off the home page; its books stay. */
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.example.deleteMany({ where: { id } });
    if (!count)
      throw refuse(
        HttpStatus.NOT_FOUND,
        'example_not_found',
        `No example ${id}`,
      );
    this.changed();
  }

  /** The countries it is shown in: those the site offers (one it has already may stay). */
  async update(id: string, countries: string[]): Promise<AdminExample> {
    const example = await this.row(id);
    const offered = new Set([
      ...(await this.reference.countries()).map((c) => c.code),
      ...example.countries,
    ]);
    const unknown = countries.filter((code) => !offered.has(code));
    if (unknown.length) {
      throw refuse(
        HttpStatus.BAD_REQUEST,
        'example_country_unknown',
        `Countries ${unknown.join(', ')} are not in the reference`,
      );
    }
    await this.prisma.example.update({ where: { id }, data: { countries } });
    this.changed();
    return this.get(id);
  }

  /** The home page's order: every example's id, each once. */
  async reorder(ids: string[]): Promise<AdminExample[]> {
    const rows = await this.prisma.example.findMany({ select: { id: true } });
    const known = new Set(rows.map((r) => r.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    ) {
      throw refuse(
        HttpStatus.BAD_REQUEST,
        'example_order_mismatch',
        'Send every example id once',
      );
    }
    await this.prisma.$transaction(
      ids.map((id, sortOrder) =>
        this.prisma.example.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    this.changed();
    return this.list();
  }

  /**
   * Starts translating the example into each of `languages` (background jobs) from its oldest
   * finished version, the one staff picked first. A language with a version is refused, unless that
   * version is a failed translation: it is replaced.
   */
  async translate(id: string, languages: Language[]): Promise<AdminExample> {
    const example = await this.row(id);
    const source = example.versions.find((v) => v.book.status === 'done');
    if (!source) {
      throw refuse(
        HttpStatus.CONFLICT,
        'example_no_source',
        'The example has no finished version to translate from',
      );
    }
    const replaced: string[] = [];
    for (const language of languages) {
      const version = example.versions.find((v) => v.language === language);
      if (!version) continue;
      if (
        version.book.status !== 'failed' ||
        version.book.clientKey !== TRANSLATION_CLIENT_KEY
      ) {
        throw refuse(
          HttpStatus.CONFLICT,
          'example_language_taken',
          `The example has a ${language} version already`,
        );
      }
      replaced.push(version.bookId);
    }
    for (const bookId of replaced) await this.deleteBook(bookId);
    const book = await this.prisma.book.findUniqueOrThrow({
      where: { id: source.bookId },
    });
    for (const language of inLanguageOrder(languages))
      await this.translator.start(id, book, language);
    return this.get(id);
  }

  // ---- Helpers ----------------------------------------------------------------------------------

  private async row(id: string): Promise<ExampleRow> {
    const row = await this.prisma.example.findUnique({
      where: { id },
      include: withVersions,
    });
    if (!row)
      throw refuse(
        HttpStatus.NOT_FOUND,
        'example_not_found',
        `No example ${id}`,
      );
    return row;
  }

  /** A book that may become a version: there, finished, and no example's version yet. */
  private async assertBook(bookId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: {
        status: true,
        language: true,
        exampleOf: { select: { exampleId: true } },
      },
    });
    if (!book) {
      throw refuse(
        HttpStatus.NOT_FOUND,
        'example_book_not_found',
        `No book ${bookId}`,
      );
    }
    if (book.status !== 'done') {
      throw refuse(
        HttpStatus.BAD_REQUEST,
        'example_book_not_done',
        'Only a finished book can be an example',
      );
    }
    if (book.exampleOf) {
      throw refuse(
        HttpStatus.CONFLICT,
        'example_book_taken',
        `The book is a version of example ${book.exampleOf.exampleId} already`,
      );
    }
    return book;
  }

  private async deleteBook(id: string) {
    await this.prisma.book.deleteMany({ where: { id } });
    await this.storage.removeDir(`books/${id}`);
  }

  /** The site drops its cached list of example books; never fails the change. */
  private changed() {
    void this.web.revalidate([EXAMPLES_TAG]);
  }

  private dto(row: ExampleRow): AdminExample {
    const byLanguage = new Map(row.versions.map((v) => [v.language, v]));
    return {
      id: row.id,
      countries: row.countries,
      templateCountries: templateCountriesOf(row.versions.map((v) => v.book)),
      sortOrder: row.sortOrder,
      versions: LANGUAGES.flatMap((language) => {
        const v = byLanguage.get(language);
        if (!v) return [];
        return [
          {
            language,
            bookId: v.bookId,
            title: v.book.title,
            childName: (v.book.child as unknown as ChildProfile).name,
            heroImageUrl: this.storage.url(v.book.heroImagePath),
            state: exampleVersionState(v.book.status),
            progress: v.book.progress,
            error: v.book.status === 'failed' ? v.book.error : null,
            translated: v.book.clientKey === TRANSLATION_CLIENT_KEY,
            costUsd: v.book.costUsd,
            createdAt: v.createdAt.toISOString(),
          },
        ];
      }),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** A row as the home page's selection sees it. */
function candidate(row: ExampleRow): Candidate {
  return {
    id: row.id,
    countries: row.countries,
    templateCountries: templateCountriesOf(row.versions.map((v) => v.book)),
    versions: row.versions.map((v) => ({
      language: v.language,
      bookId: v.bookId,
      title: v.book.title,
      status: v.book.status,
      heroImagePath: v.book.heroImagePath,
    })),
  };
}
