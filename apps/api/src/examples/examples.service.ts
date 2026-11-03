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
  OTHER_COUNTRY,
  bookPricesFor,
  countryInfo,
  heroFor,
  landingImageFor,
  type CountryOverview,
  type OverviewLanguage,
  exampleVersionState,
  inLanguageOrder,
  normalizeRule,
  ownerCountries,
  ruleShows,
  sampleInLanguage,
  showcaseRule,
  type AdminAccess,
  type AdminExample,
  type ChildProfile,
  type CountriesMode,
  type CountryRule,
  type ExampleBook,
  type ExampleCandidate,
  type ExampleError,
  type Language,
  type VisitorMatrix,
} from '@fabulka/shared';
import { listScope, outOfScope } from '../admin/scope';
import { PrismaService } from '../prisma/prisma.service';
import { StaffCapsService } from '../staff/caps.service';
import { ReferenceService } from '../reference/reference.service';
import { EXAMPLES_TAG, SeoWebService } from '../seo/seo-web.service';
import { StorageService } from '../storage/storage.service';
import {
  orSamples,
  pickExamples,
  templateRuleOf,
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
    country: true,
    template: { select: { countries: true, countriesMode: true } },
  },
} satisfies Prisma.BookDefaultArgs;

const withVersions = {
  versions: {
    orderBy: { createdAt: 'asc' },
    include: { book: versionBook },
  },
} satisfies Prisma.ExampleInclude;
export type ExampleRow = Prisma.ExampleGetPayload<{
  include: typeof withVersions;
}>;

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
    private readonly caps: StaffCapsService,
  ) {}

  // ---- The site ---------------------------------------------------------------------------------

  /**
   * GET /books/examples: for each example shown in `country`, its finished version in exactly
   * `language` (pickExamples); with none, the catalog samples in that language for catalog books
   * listed in that country (the country's own sample, else the global one).
   */
  async forSite(
    country: string | null,
    language: Language,
  ): Promise<ExampleBook[]> {
    return this.siteExamples(await this.siteData(), country, language);
  }

  /**
   * What a visitor sees in each country × language (the admin's visitor matrix): the very same
   * selection as GET /books/examples, for the session's countries (every offered one and "other"
   * for global staff).
   */
  async matrix(session: AdminAccess): Promise<VisitorMatrix> {
    const scope = listScope(session, 'examples', 'books');
    const offered = await this.reference.countries();
    const codes = scope ?? [...offered.map((c) => c.code), OTHER_COUNTRY];
    const data = await this.siteData();
    return codes.map((code) => {
      const { languages } = countryInfo(code, offered);
      return {
        country: code,
        listed: code === OTHER_COUNTRY || offered.some((c) => c.code === code),
        cells: LANGUAGES.map((language) => {
          const items = this.siteExamples(
            data,
            code === OTHER_COUNTRY ? null : code,
            language,
          );
          return {
            language,
            offered: languages.includes(language),
            kind: items[0]?.kind ?? 'empty',
            items: items.map(({ id, title, heroImageUrl }) => ({
              id,
              title,
              heroImageUrl,
            })),
          };
        }),
      };
    });
  }

  /**
   * Everything a visitor from each country gets (the admin's country overview, next to the matrix):
   * its languages, currency and prices, the examples and catalog samples per language (the
   * country's own sample or the global fallback), the landing's hero per language, and what is
   * missing (OVERVIEW_GAPS). For the session's countries, like the matrix; a code the site no longer
   * offers is listed as not offered.
   */
  async overview(session: AdminAccess): Promise<CountryOverview[]> {
    const scope = listScope(
      session,
      'examples',
      'catalog',
      'reference.landing',
    );
    const [offered, reference, data, templates] = await Promise.all([
      this.reference.countries(),
      this.reference.admin(),
      this.siteData(),
      this.prisma.bookTemplate.findMany({
        where: { published: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          translations: true,
          languages: true,
          countries: true,
          countriesMode: true,
        },
      }),
    ]);
    const codes = scope ?? [...offered.map((c) => c.code), OTHER_COUNTRY];
    const pricing = { ...reference, countries: offered };
    return codes.map((code): CountryOverview => {
      const other = code === OTHER_COUNTRY;
      const listed = other || offered.some((c) => c.code === code);
      const info = countryInfo(code, offered);
      const country = other ? null : code;
      const prices = bookPricesFor(code, pricing);
      const listedHere = templates.filter((t) =>
        ruleShows({ mode: t.countriesMode, countries: t.countries }, country),
      );
      // Examples made for this country: its code in their own include list.
      const local = new Set(
        data.candidates
          .filter(
            (c) => c.rule.mode === 'include' && c.rule.countries.includes(code),
          )
          .map((c) => c.id),
      );
      const localExamples = local.size;
      const countrySamples = other
        ? 0
        : data.samples.filter((row) => row.country === code).length;
      const byLanguage = info.languages.map((language): OverviewLanguage => {
        const items = this.siteExamples(data, country, language);
        const picked = pickExamples(data.candidates, country, language);
        const hero = heroFor(reference.landing, code, language);
        const image = landingImageFor(
          reference.landing,
          code,
          language,
          'hero',
        );
        return {
          language,
          examples: {
            kind: items[0]?.kind ?? 'empty',
            items: items.map(({ id, title, heroImageUrl }) => ({
              id,
              title,
              heroImageUrl,
            })),
            local: picked.filter((p) => local.has(p.exampleId)).length,
          },
          samples: listedHere.map((t) => {
            const rows = data.samples
              .filter((row) => row.template.id === t.id)
              .map((row) => ({
                row,
                language: row.language as Language,
                country: row.country || null,
              }));
            const found = sampleInLanguage(rows, language, country);
            const translated = (
              t.translations as Record<string, { title?: string } | undefined>
            )?.[language]?.title;
            return {
              templateId: t.id,
              slug: t.slug,
              title: translated || t.title,
              offered: t.languages.includes(language),
              sample: found
                ? {
                    bookId: found.row.book.id,
                    title: found.row.book.title ?? '',
                    heroImageUrl: this.storage.url(
                      found.row.book.heroImagePath,
                    ),
                    scope: found.country ? 'country' : 'global',
                  }
                : null,
            };
          }),
          landing: {
            title: hero.title,
            lead: hero.lead,
            heroImage: image ? { src: image.src, scope: image.scope } : null,
          },
        };
      });
      const gaps: CountryOverview['gaps'] = [];
      if (!listed) gaps.push({ code: 'not_offered' });
      if (!other && listed) {
        if (!localExamples) gaps.push({ code: 'no_local_examples' });
        if (!countrySamples) gaps.push({ code: 'no_country_samples' });
        if (!byLanguage.some((l) => l.landing.heroImage))
          gaps.push({ code: 'no_landing_image' });
      }
      for (const l of byLanguage) {
        if (l.examples.kind !== 'example')
          gaps.push({ code: 'no_examples', language: l.language });
        if (l.samples.some((s) => s.offered && !s.sample))
          gaps.push({ code: 'missing_samples', language: l.language });
        if (!other && listed && !l.landing.title)
          gaps.push({ code: 'no_landing_title', language: l.language });
      }
      return {
        country: code,
        listed,
        languages: [...info.languages],
        currency: info.currency,
        print: info.print,
        prices: {
          template: prices?.template ?? null,
          custom: prices?.custom ?? null,
          own: prices?.own ?? false,
        },
        localExamples,
        countrySamples,
        byLanguage,
        gaps,
      };
    });
  }

  /** Everything the home page's examples are picked from: the examples and the catalog samples. */
  private async siteData(): Promise<SiteData> {
    const [rows, samples] = await Promise.all([
      this.prisma.example.findMany({ orderBy: ORDER, include: withVersions }),
      this.prisma.templateSample.findMany({
        where: {
          book: { status: 'done', title: { not: null } },
          template: { published: true },
        },
        orderBy: { template: { sortOrder: 'asc' } },
        include: {
          book: { select: { id: true, title: true, heroImagePath: true } },
          template: {
            select: { id: true, countries: true, countriesMode: true },
          },
        },
      }),
    ]);
    return { candidates: rows.map(candidate), samples };
  }

  /** The examples for one country and language (see forSite), from data read once. */
  private siteExamples(
    data: SiteData,
    country: string | null,
    language: Language,
  ): ExampleBook[] {
    const picked = pickExamples(data.candidates, country, language);
    const samples = picked.length
      ? []
      : siteSamples(data.samples, country, language).map((row) => ({
          id: row.book.id,
          title: row.book.title!,
          language,
          heroImageUrl: this.storage.url(row.book.heroImagePath),
        }));
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

  /** The examples the session may see (those shown in any of its countries), in the home page's order. */
  async list(session: AdminAccess): Promise<AdminExample[]> {
    const rows = await this.prisma.example.findMany({
      orderBy: ORDER,
      include: withVersions,
    });
    return rows
      .filter((row) => visibleTo(session, row))
      .map((row) => this.dto(row, session));
  }

  async get(id: string, session: AdminAccess): Promise<AdminExample> {
    const row = await this.row(id);
    if (!visibleTo(session, row))
      throw outOfScope('Not shown in your countries');
    return this.dto(row, session);
  }

  /**
   * Finished books staff may make a new example from: in the session's countries (by the book's
   * country), narrowed to the working country, not a version yet and not a translation; newest
   * first.
   */
  async candidates(
    session: AdminAccess,
    country: string | null,
  ): Promise<ExampleCandidate[]> {
    const scope = listScope(session, 'examples', 'books');
    const working = country?.trim().toUpperCase() || null;
    const countries =
      working && (!scope || scope.includes(working)) ? [working] : scope;
    if (countries && !countries.length) return [];
    const rows = await this.prisma.book.findMany({
      where: {
        status: 'done',
        title: { not: null },
        exampleOf: null,
        clientKey: { not: TRANSLATION_CLIENT_KEY },
        ...(countries && { country: { in: countries } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        child: true,
        language: true,
        country: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      childName: (row.child as unknown as ChildProfile).name,
      language: row.language as Language,
      country: row.country,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * A new example with this finished book as its version in the book's language, first on the home
   * page, shown in `countries`. A country manager's book must be from their countries, and the
   * example shows only in their countries (all of them when none are named).
   */
  async create(
    bookId: string,
    countries: string[] | undefined,
    session: AdminAccess,
  ): Promise<AdminExample> {
    const scope = listScope(session, 'examples', 'books');
    const book = await this.assertBook(bookId, scope);
    const list = scope && !countries?.length ? scope : (countries ?? []);
    if (scope && !list.every((code) => scope.includes(code)))
      throw outOfScope('An example of yours shows only in your countries');
    await this.assertOffered(list, []);
    const first = await this.prisma.example.aggregate({
      _min: { sortOrder: true },
    });
    const example = await this.prisma.example.create({
      data: {
        countries: list,
        sortOrder: (first._min.sortOrder ?? 1) - 1,
        versions: { create: { language: book.language, bookId } },
      },
    });
    this.changed();
    return this.get(example.id, session);
  }

  /** Adds a finished book as the example's version in its language (one not taken yet). */
  async addVersion(
    id: string,
    bookId: string,
    session: AdminAccess,
  ): Promise<AdminExample> {
    const example = await this.editable(id, session);
    const book = await this.assertBook(
      bookId,
      listScope(session, 'examples', 'books'),
    );
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
    return this.get(id, session);
  }

  /**
   * Takes a version off the example; its book stays (a translation that failed is deleted with its
   * files, as nobody else has it). An example left with no version goes too.
   */
  async removeVersion(
    id: string,
    language: string,
    session: AdminAccess,
  ): Promise<void> {
    const example = await this.editable(id, session);
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
  async remove(id: string, session: AdminAccess): Promise<void> {
    await this.editable(id, session);
    const { count } = await this.prisma.example.deleteMany({ where: { id } });
    if (!count)
      throw refuse(
        HttpStatus.NOT_FOUND,
        'example_not_found',
        `No example ${id}`,
      );
    this.changed();
  }

  /**
   * Where it is shown: only in `countries` (include) or everywhere but them (exclude), codes the
   * site offers (one it has already may stay). A country manager may only move an example of theirs
   * to other countries of theirs: never everywhere, nor "everywhere except…".
   */
  async update(
    id: string,
    countries: string[],
    mode: CountriesMode,
    session: AdminAccess,
  ): Promise<AdminExample> {
    const example = await this.editable(id, session);
    const rule = normalizeRule({ mode, countries });
    const scope = listScope(session, 'examples', 'books');
    const owner = ownerCountries(
      showcaseRule(rule, templateRuleOf(example.versions.map((v) => v.book))),
    );
    if (scope && !(owner && owner.every((code) => scope.includes(code))))
      throw outOfScope('An example of yours shows only in your countries');
    await this.assertOffered(rule.countries, example.countries);
    await this.prisma.example.update({
      where: { id },
      data: { countries: [...rule.countries], countriesMode: rule.mode },
    });
    this.changed();
    return this.get(id, session);
  }

  /**
   * The home page's order. Global staff send every example's id. A country manager sends exactly
   * the ids of the examples they may change, in their new order: those are moved among the places
   * they hold now, and every other example keeps its place (so a manager never moves anyone else's
   * example, nor theirs past it).
   */
  async reorder(ids: string[], session: AdminAccess): Promise<AdminExample[]> {
    const rows = await this.prisma.example.findMany({
      orderBy: ORDER,
      include: withVersions,
    });
    const mine = rows
      .filter((row) => editableBy(session, row))
      .map((r) => r.id);
    const known = new Set(mine);
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    ) {
      throw refuse(
        HttpStatus.BAD_REQUEST,
        'example_order_mismatch',
        'Send the id of every example you may move, once',
      );
    }
    const order = reordered(
      rows.map((r) => r.id),
      known,
      ids,
    );
    await this.prisma.$transaction(
      order.map((id, sortOrder) =>
        this.prisma.example.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    this.changed();
    return this.list(session);
  }

  /**
   * Starts translating the example into each of `languages` (background jobs) from its oldest
   * finished version, the one staff picked first. A language with a version is refused, unless that
   * version is a failed translation: it is replaced.
   */
  async translate(
    id: string,
    languages: Language[],
    session: StaffSession,
    working: string | null = null,
  ): Promise<AdminExample> {
    const example = await this.editable(id, session);
    // Paid models on staff's behalf: within the person's and the country's daily caps.
    const country = spendCountry(example, working);
    await this.caps.assert(session, country);
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
    const staff = StaffCapsService.context(session, country);
    for (const language of inLanguageOrder(languages))
      await this.translator.start(id, book, language, undefined, staff);
    return this.get(id, session);
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

  /** The example, if the session may change it: 403 scope_forbidden otherwise. */
  private async editable(
    id: string,
    session: AdminAccess,
  ): Promise<ExampleRow> {
    const row = await this.row(id);
    if (!editableBy(session, row))
      throw outOfScope(
        'The example shows outside your countries: only global staff change it',
      );
    return row;
  }

  /** Countries the site offers (reference.countries); one the example has already may stay. */
  private async assertOffered(
    codes: readonly string[],
    current: readonly string[],
  ): Promise<void> {
    if (!codes.length) return;
    const offered = new Set([
      ...(await this.reference.countries()).map((c) => c.code),
      ...current,
    ]);
    const unknown = codes.filter((code) => !offered.has(code));
    if (unknown.length) {
      throw refuse(
        HttpStatus.BAD_REQUEST,
        'example_country_unknown',
        `Countries ${unknown.join(', ')} are not in the reference`,
      );
    }
  }

  /**
   * A book that may become a version: there, finished, and no example's version yet; for a country
   * manager (`scope`), made in one of their countries.
   */
  private async assertBook(bookId: string, scope: string[] | null) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: {
        status: true,
        language: true,
        country: true,
        exampleOf: { select: { exampleId: true } },
      },
    });
    if (!book || (scope && !(book.country && scope.includes(book.country)))) {
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

  private dto(row: ExampleRow, session: AdminAccess): AdminExample {
    const byLanguage = new Map(row.versions.map((v) => [v.language, v]));
    const template = templateRuleOf(row.versions.map((v) => v.book));
    return {
      id: row.id,
      countries: row.countries,
      countriesMode: row.countriesMode,
      templateCountries: template ? [...template.countries] : null,
      templateCountriesMode: template?.mode ?? 'include',
      editable: editableBy(session, row),
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

/** What the home page's examples are picked from (see ExamplesService.siteData). */
interface SiteData {
  candidates: Candidate[];
  samples: SampleRow[];
}

/** A catalog sample as the home page's fill-in sees it. */
interface SampleRow {
  language: string;
  /** "" for the global sample, else a country's own. */
  country: string;
  book: { id: string; title: string | null; heroImagePath: string | null };
  template: { id: string; countries: string[]; countriesMode: CountriesMode };
}

/**
 * The catalog samples filling in for a visitor from `country` in `language`: for each published
 * catalog book listed there (in catalog order), its sample in exactly that language, the country's
 * own before the global one.
 */
export function siteSamples(
  rows: readonly SampleRow[],
  country: string | null,
  language: Language,
): SampleRow[] {
  const byTemplate = new Map<string, SampleRow[]>();
  for (const row of rows) {
    const rule = {
      mode: row.template.countriesMode,
      countries: row.template.countries,
    };
    if (!ruleShows(rule, country)) continue;
    byTemplate.set(row.template.id, [
      ...(byTemplate.get(row.template.id) ?? []),
      row,
    ]);
  }
  return [...byTemplate.values()].flatMap((list) => {
    const keyed = list.map((row) => ({
      row,
      language: row.language as Language,
      country: row.country || null,
    }));
    const found = sampleInLanguage(keyed, language, country);
    return found ? [found.row] : [];
  });
}

/** Where an example shows: its own rule, else its catalog book's, else everywhere. */
export function shownRule(row: ExampleRow): CountryRule {
  return showcaseRule(
    { mode: row.countriesMode, countries: row.countries },
    templateRuleOf(row.versions.map((v) => v.book)),
  );
}

/** A session as the caps need it: who, and their staff row when they have one. */
export type StaffSession = AdminAccess & {
  who?: string | null;
  staffId?: string | null;
};

/**
 * The country a translation's spend counts against: the working country when the example is shown
 * there, else the first country it is shown only in; none for a global or "everywhere except…" one
 * (then the working country, if any).
 */
export function spendCountry(
  example: { countries: string[]; countriesMode: string },
  working: string | null,
): string | null {
  const code = working?.trim().toUpperCase() || null;
  if (example.countriesMode === 'include' && example.countries.length) {
    return code && example.countries.includes(code)
      ? code
      : example.countries[0];
  }
  return code;
}

/** A country manager sees the examples shown in any of their countries; global staff all. */
export function visibleTo(session: AdminAccess, row: ExampleRow): boolean {
  const scope = listScope(session, 'examples', 'books');
  if (!scope) return true;
  const rule = shownRule(row);
  return scope.some((country) => ruleShows(rule, country));
}

/**
 * A country manager may change an example only when every country it shows in is theirs: never one
 * shown everywhere or "everywhere except…" (allowedFor with its owner countries).
 */
export function editableBy(session: AdminAccess, row: ExampleRow): boolean {
  const scope = listScope(session, 'examples', 'books');
  if (!scope) return true;
  const owner = ownerCountries(shownRule(row));
  return !!owner && owner.every((country) => scope.includes(country));
}

/**
 * The home page's order after a manager moved theirs (`movable`, now in the order `ids`): the
 * movable ones fill the places they held, in the new order; the rest stay where they are.
 */
export function reordered(
  current: readonly string[],
  movable: ReadonlySet<string>,
  ids: readonly string[],
): string[] {
  let next = 0;
  return current.map((id) => (movable.has(id) ? ids[next++] : id));
}

/** A row as the home page's selection sees it. */
function candidate(row: ExampleRow): Candidate {
  return {
    id: row.id,
    rule: { mode: row.countriesMode, countries: row.countries },
    template: templateRuleOf(row.versions.map((v) => v.book)),
    versions: row.versions.map((v) => ({
      language: v.language,
      bookId: v.bookId,
      title: v.book.title,
      status: v.book.status,
      heroImagePath: v.book.heroImagePath,
    })),
  };
}
