import { DEFAULT_COUNTRIES } from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReferenceService } from '../reference/reference.service';
import type { SeoWebService } from '../seo/seo-web.service';
import type { StorageService } from '../storage/storage.service';
import { ExamplesService } from './examples.service';
import { TRANSLATION_CLIENT_KEY } from './translation';
import type { TranslatorService } from './translator.service';

/** A version row as ExamplesService reads it. */
const version = (
  language: string,
  status = 'done',
  extra: { clientKey?: string; template?: string[] | null } = {},
) => ({
  language,
  bookId: `${language}-book`,
  createdAt: new Date('2026-10-01'),
  book: {
    id: `${language}-book`,
    title: `Book ${language}`,
    language,
    status,
    progress: status === 'done' ? 100 : 10,
    error: status === 'failed' ? 'no luck' : null,
    child: { name: 'Тимур' },
    heroImagePath: `books/${language}-book/hero.jpeg`,
    clientKey: extra.clientKey ?? 'parent',
    costUsd: 0.1,
    template: extra.template ? { countries: extra.template } : null,
  },
});

const exampleRow = (
  id: string,
  versions: ReturnType<typeof version>[],
  countries: string[] = [],
) => ({
  id,
  countries,
  sortOrder: 0,
  createdAt: new Date('2026-10-01'),
  versions,
});

function makeService(prisma: Record<string, unknown>) {
  const translator = { start: jest.fn().mockResolvedValue('new') };
  const revalidate = jest.fn().mockResolvedValue(true);
  const removeDir = jest.fn().mockResolvedValue(undefined);
  const service = new ExamplesService(
    prisma as unknown as PrismaService,
    {
      url: (p: string | null) => (p ? `/files/${p}` : null),
      removeDir,
    } as unknown as StorageService,
    {
      countries: () => Promise.resolve(DEFAULT_COUNTRIES),
    } as unknown as ReferenceService,
    translator as unknown as TranslatorService,
    { revalidate } as unknown as SeoWebService,
  );
  return { service, translator, revalidate, removeDir };
}

describe('ExamplesService.forSite', () => {
  const rows = [
    exampleRow('ex-kz', [version('ru'), version('en')], ['KZ']),
    exampleRow('ex-ru', [version('ru', 'done', { template: ['DE'] })]),
  ];

  it('gives each example shown in the country in exactly the page language', async () => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const samples = jest.fn().mockResolvedValue([]);
    const { service } = makeService({
      example: { findMany },
      templateSample: { findMany: samples },
    });
    expect(await service.forSite('KZ', 'en')).toEqual([
      {
        id: 'en-book',
        title: 'Book en',
        language: 'en',
        heroImageUrl: '/files/books/en-book/hero.jpeg',
        kind: 'example',
      },
    ]);
    expect((await service.forSite('DE', 'ru')).map((b) => b.id)).toEqual([
      'ru-book',
    ]);
    expect(samples).not.toHaveBeenCalled();
  });

  it('fills an empty block with catalog samples in that language, listed in that country', async () => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const samples = jest
      .fn()
      .mockResolvedValue([
        { book: { id: 's1', title: 'Muestra', heroImagePath: null } },
      ]);
    const { service } = makeService({
      example: { findMany },
      templateSample: { findMany: samples },
    });
    expect(await service.forSite('KZ', 'es')).toEqual([
      {
        id: 's1',
        title: 'Muestra',
        language: 'es',
        heroImageUrl: null,
        kind: 'sample',
      },
    ]);
    expect(samples).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          language: 'es',
          book: { status: 'done', title: { not: null } },
          template: {
            published: true,
            OR: [
              { countries: { isEmpty: true } },
              { countries: { has: 'KZ' } },
            ],
          },
        },
      }),
    );
  });
});

describe('ExamplesService in the admin', () => {
  it('makes an example from a finished book, first on the home page', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'ex1' });
    const findUnique = jest
      .fn()
      .mockResolvedValue(exampleRow('ex1', [version('ru')]));
    const { service, revalidate } = makeService({
      book: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'done',
          language: 'ru',
          exampleOf: null,
        }),
      },
      example: {
        aggregate: jest.fn().mockResolvedValue({ _min: { sortOrder: 0 } }),
        create,
        findUnique,
      },
    });
    const example = await service.create('ru-book');
    expect(create).toHaveBeenCalledWith({
      data: {
        sortOrder: -1,
        versions: { create: { language: 'ru', bookId: 'ru-book' } },
      },
    });
    expect(example.versions).toMatchObject([
      { language: 'ru', state: 'done', translated: false },
    ]);
    expect(revalidate).toHaveBeenCalledWith(['examples']);
  });

  it('refuses an unfinished book, a book already a version, and a language taken, by code', async () => {
    const book = jest.fn();
    const { service } = makeService({
      book: { findUnique: book },
      example: {
        findUnique: jest
          .fn()
          .mockResolvedValue(exampleRow('ex1', [version('ru')])),
      },
    });
    const code = (promise: Promise<unknown>) =>
      promise.then(
        () => 'ok',
        (error: { getResponse(): { code: string } }) =>
          error.getResponse().code,
      );
    book.mockResolvedValueOnce({
      status: 'story',
      language: 'en',
      exampleOf: null,
    });
    expect(await code(service.addVersion('ex1', 'b'))).toBe(
      'example_book_not_done',
    );
    book.mockResolvedValueOnce({
      status: 'done',
      language: 'en',
      exampleOf: { exampleId: 'ex2' },
    });
    expect(await code(service.addVersion('ex1', 'b'))).toBe(
      'example_book_taken',
    );
    book.mockResolvedValueOnce({
      status: 'done',
      language: 'ru',
      exampleOf: null,
    });
    expect(await code(service.addVersion('ex1', 'b'))).toBe(
      'example_language_taken',
    );
    book.mockResolvedValueOnce(null);
    expect(await code(service.addVersion('ex1', 'b'))).toBe(
      'example_book_not_found',
    );
  });

  it('translates from the first finished version, replacing a failed translation only', async () => {
    const rows = exampleRow('ex1', [
      version('ru'),
      version('de', 'failed', { clientKey: TRANSLATION_CLIENT_KEY }),
      version('en', 'story', { clientKey: TRANSLATION_CLIENT_KEY }),
    ]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const source = { id: 'ru-book' };
    const { service, translator, removeDir } = makeService({
      example: { findUnique: jest.fn().mockResolvedValue(rows) },
      book: {
        deleteMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue(source),
      },
    });
    await expect(service.translate('ex1', ['en'])).rejects.toThrow(
      'en version already',
    );
    await service.translate('ex1', ['es', 'de']);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'de-book' } });
    expect(removeDir).toHaveBeenCalledWith('books/de-book');
    // In the order languages are listed.
    expect(
      translator.start.mock.calls.map((call: unknown[]) => call[2]),
    ).toEqual(['es', 'de']);
    expect(translator.start).toHaveBeenCalledWith('ex1', source, 'es');
  });

  it('refuses to translate an example with nothing finished', async () => {
    const { service } = makeService({
      example: {
        findUnique: jest
          .fn()
          .mockResolvedValue(exampleRow('ex1', [version('ru', 'failed')])),
      },
    });
    await expect(service.translate('ex1', ['en'])).rejects.toThrow(
      'no finished version',
    );
  });

  it('removes a version but keeps its book, and the example once it has none', async () => {
    const versionDelete = jest.fn().mockResolvedValue({});
    const exampleDelete = jest.fn().mockResolvedValue({ count: 1 });
    const bookDelete = jest.fn();
    const { service } = makeService({
      example: {
        findUnique: jest
          .fn()
          .mockResolvedValue(exampleRow('ex1', [version('ru')])),
        deleteMany: exampleDelete,
      },
      exampleVersion: { delete: versionDelete },
      book: { deleteMany: bookDelete },
    });
    await service.removeVersion('ex1', 'ru');
    expect(versionDelete).toHaveBeenCalledWith({
      where: { exampleId_language: { exampleId: 'ex1', language: 'ru' } },
    });
    expect(bookDelete).not.toHaveBeenCalled();
    expect(exampleDelete).toHaveBeenCalledWith({
      where: { id: 'ex1', versions: { none: {} } },
    });
  });

  it('reorders only with every example once', async () => {
    const update = jest.fn().mockResolvedValue({});
    const { service } = makeService({
      example: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
          .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
          .mockResolvedValueOnce([]),
        update,
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    });
    await expect(service.reorder(['a'])).rejects.toThrow('every example id');
    await service.reorder(['b', 'a']);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { sortOrder: 0 },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { sortOrder: 1 },
    });
  });

  it('lists versions in language order with their state', async () => {
    const { service } = makeService({
      example: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            exampleRow('ex1', [
              version('ru', 'done', { template: ['KZ'] }),
              version('de', 'failed', { clientKey: TRANSLATION_CLIENT_KEY }),
              version('en', 'pdf', { clientKey: TRANSLATION_CLIENT_KEY }),
            ]),
          ]),
      },
    });
    const [example] = await service.list();
    expect(example.templateCountries).toEqual(['KZ']);
    expect(example.versions.map((v) => [v.language, v.state, v.error])).toEqual(
      [
        ['en', 'translating', null],
        ['de', 'failed', 'no luck'],
        ['ru', 'done', null],
      ],
    );
  });
});
