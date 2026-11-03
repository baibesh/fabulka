import {
  BUILTIN_ROLES,
  DEFAULT_COUNTRIES,
  SUPER_ROLE,
  accessOf,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReferenceService } from '../reference/reference.service';
import type { SeoWebService } from '../seo/seo-web.service';
import type { StorageService } from '../storage/storage.service';
import { ExamplesService, spendCountry } from './examples.service';
import { TRANSLATION_CLIENT_KEY } from './translation';
import type { StaffCapsService } from '../staff/caps.service';
import type { TranslatorService } from './translator.service';

/** The superadmin, and a country manager for Germany (examples in DE only). */
const SUPER = accessOf([SUPER_ROLE], BUILTIN_ROLES, []);
const DE = accessOf(['country_manager'], BUILTIN_ROLES, ['DE']);

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
    country: 'KZ',
    template: extra.template
      ? { countries: extra.template, countriesMode: 'include' }
      : null,
  },
});

const exampleRow = (
  id: string,
  versions: ReturnType<typeof version>[],
  countries: string[] = [],
  countriesMode: 'include' | 'exclude' = 'include',
) => ({
  id,
  countries,
  countriesMode,
  sortOrder: 0,
  createdAt: new Date('2026-10-01'),
  versions,
});

function makeService(prisma: Record<string, unknown>) {
  const translator = { start: jest.fn().mockResolvedValue('new') };
  const revalidate = jest.fn().mockResolvedValue(true);
  const removeDir = jest.fn().mockResolvedValue(undefined);
  const caps = { assert: jest.fn().mockResolvedValue(undefined) };
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
    caps as unknown as StaffCapsService,
  );
  return { service, translator, revalidate, removeDir, caps };
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
  });

  it('fills an empty block with catalog samples in that language, listed in that country', async () => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const template = (id: string, countries: string[] = []) => ({
      id,
      countries,
      countriesMode: 'include',
    });
    const sample = (
      id: string,
      language: string,
      country: string,
      t: ReturnType<typeof template>,
    ) => ({
      language,
      country,
      book: { id, title: `Sample ${id}`, heroImagePath: null },
      template: t,
    });
    const everywhere = template('t1');
    const deOnly = template('t2', ['DE']);
    const samples = jest
      .fn()
      .mockResolvedValue([
        sample('s1', 'es', '', everywhere),
        sample('s1-kz', 'es', 'KZ', everywhere),
        sample('s1-en', 'en', '', everywhere),
        sample('s2', 'es', '', deOnly),
      ]);
    const { service } = makeService({
      example: { findMany },
      templateSample: { findMany: samples },
    });
    // Kazakhstan's own sample before the global one; the DE-only book is not listed there.
    expect(await service.forSite('KZ', 'es')).toEqual([
      {
        id: 's1-kz',
        title: 'Sample s1-kz',
        language: 'es',
        heroImageUrl: null,
        kind: 'sample',
      },
    ]);
    expect((await service.forSite('DE', 'es')).map((b) => b.id)).toEqual([
      's1',
      's2',
    ]);
    expect((await service.forSite(null, 'es')).map((b) => b.id)).toEqual([
      's1',
    ]);
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
          country: 'KZ',
          exampleOf: null,
        }),
      },
      example: {
        aggregate: jest.fn().mockResolvedValue({ _min: { sortOrder: 0 } }),
        create,
        findUnique,
      },
    });
    const example = await service.create('ru-book', undefined, SUPER);
    expect(create).toHaveBeenCalledWith({
      data: {
        countries: [],
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
    expect(await code(service.addVersion('ex1', 'b', SUPER))).toBe(
      'example_book_not_done',
    );
    book.mockResolvedValueOnce({
      status: 'done',
      language: 'en',
      exampleOf: { exampleId: 'ex2' },
    });
    expect(await code(service.addVersion('ex1', 'b', SUPER))).toBe(
      'example_book_taken',
    );
    book.mockResolvedValueOnce({
      status: 'done',
      language: 'ru',
      exampleOf: null,
    });
    expect(await code(service.addVersion('ex1', 'b', SUPER))).toBe(
      'example_language_taken',
    );
    book.mockResolvedValueOnce(null);
    expect(await code(service.addVersion('ex1', 'b', SUPER))).toBe(
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
    await expect(service.translate('ex1', ['en'], SUPER)).rejects.toThrow(
      'en version already',
    );
    await service.translate('ex1', ['es', 'de'], SUPER);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'de-book' } });
    expect(removeDir).toHaveBeenCalledWith('books/de-book');
    // In the order languages are listed.
    expect(
      translator.start.mock.calls.map((call: unknown[]) => call[2]),
    ).toEqual(['es', 'de']);
    expect(translator.start).toHaveBeenCalledWith(
      'ex1',
      source,
      'es',
      undefined,
      {
        staffEmail: null,
        staffCountry: null,
      },
    );
  });

  it('refuses to translate an example with nothing finished', async () => {
    const { service } = makeService({
      example: {
        findUnique: jest
          .fn()
          .mockResolvedValue(exampleRow('ex1', [version('ru', 'failed')])),
      },
    });
    await expect(service.translate('ex1', ['en'], SUPER)).rejects.toThrow(
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
    await service.removeVersion('ex1', 'ru', SUPER);
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
          .mockResolvedValueOnce([exampleRow('a', []), exampleRow('b', [])])
          .mockResolvedValueOnce([exampleRow('a', []), exampleRow('b', [])])
          .mockResolvedValueOnce([]),
        update,
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    });
    await expect(service.reorder(['a'], SUPER)).rejects.toThrow(
      'every example you may move',
    );
    await service.reorder(['b', 'a'], SUPER);
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
    const [example] = await service.list(SUPER);
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

describe('ExamplesService: country scope', () => {
  const de = exampleRow('de', [version('ru')], ['DE']);
  const deKz = exampleRow('de-kz', [version('ru')], ['DE', 'KZ']);
  const global = exampleRow('global', [version('ru')]);
  const notKz = exampleRow('not-kz', [version('ru')], ['KZ'], 'exclude');
  const kz = exampleRow('kz', [version('ru')], ['KZ']);
  const deTemplate = exampleRow('de-template', [
    version('ru', 'done', { template: ['DE'] }),
  ]);
  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => 'ok',
      (error: { getResponse(): { code: string } }) => error.getResponse().code,
    );

  it("lists for a manager the examples shown in their countries, editable only when all of an example's countries are theirs", async () => {
    const { service } = makeService({
      example: {
        findMany: jest
          .fn()
          .mockResolvedValue([de, deKz, global, notKz, kz, deTemplate]),
      },
    });
    const list = await service.list(DE);
    expect(list.map((e) => [e.id, e.editable])).toEqual([
      ['de', true],
      ['de-kz', false],
      ['global', false],
      ['not-kz', false],
      ['de-template', true],
    ]);
    expect((await service.list(SUPER)).every((e) => e.editable)).toBe(true);
  });

  it('refuses a manager changes to a global, shared or "everywhere except" example with scope_forbidden', async () => {
    for (const row of [global, deKz, notKz]) {
      const { service } = makeService({
        example: { findUnique: jest.fn().mockResolvedValue(row) },
      });
      expect(await code(service.translate(row.id, ['en'], DE))).toBe(
        'scope_forbidden',
      );
      expect(await code(service.remove(row.id, DE))).toBe('scope_forbidden');
      expect(await code(service.removeVersion(row.id, 'ru', DE))).toBe(
        'scope_forbidden',
      );
      expect(await code(service.update(row.id, ['DE'], 'include', DE))).toBe(
        'scope_forbidden',
      );
    }
  });

  it("keeps a manager's example within their countries when created or moved", async () => {
    const create = jest.fn().mockResolvedValue({ id: 'new' });
    const update = jest.fn().mockResolvedValue({});
    const book = jest.fn();
    const { service } = makeService({
      book: { findUnique: book },
      example: {
        aggregate: jest.fn().mockResolvedValue({ _min: { sortOrder: 0 } }),
        create,
        update,
        findUnique: jest.fn().mockResolvedValue(de),
      },
    });
    book.mockResolvedValue({
      status: 'done',
      language: 'de',
      country: 'DE',
      exampleOf: null,
    });
    await service.create('b', undefined, DE);
    const [[created]] = create.mock.calls as [
      [{ data: { countries: string[] } }],
    ];
    expect(created.data.countries).toEqual(['DE']);
    expect(await code(service.create('b', ['DE', 'KZ'], DE))).toBe(
      'scope_forbidden',
    );
    // A book from another country is not theirs to publish.
    book.mockResolvedValue({
      status: 'done',
      language: 'de',
      country: 'KZ',
      exampleOf: null,
    });
    expect(await code(service.create('b', ['DE'], DE))).toBe(
      'example_book_not_found',
    );
    expect(await code(service.update('de', [], 'include', DE))).toBe(
      'scope_forbidden',
    );
    expect(await code(service.update('de', ['ES'], 'exclude', DE))).toBe(
      'scope_forbidden',
    );
    await service.update('de', ['DE'], 'include', DE);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'de' },
      data: { countries: ['DE'], countriesMode: 'include' },
    });
  });

  it('stores "everywhere except" for global staff, and an empty exclude list as everywhere', async () => {
    const update = jest.fn().mockResolvedValue({});
    const { service } = makeService({
      example: { update, findUnique: jest.fn().mockResolvedValue(global) },
    });
    await service.update('global', ['KZ'], 'exclude', SUPER);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'global' },
      data: { countries: ['KZ'], countriesMode: 'exclude' },
    });
    await service.update('global', [], 'exclude', SUPER);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'global' },
      data: { countries: [], countriesMode: 'include' },
    });
  });

  it('lets a manager reorder only theirs, among the places they hold', async () => {
    const update = jest.fn().mockResolvedValue({});
    const rows = [global, de, kz, deTemplate];
    const { service } = makeService({
      example: { findMany: jest.fn().mockResolvedValue(rows), update },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    });
    expect(
      await code(service.reorder(['de-template', 'de', 'global'], DE)),
    ).toBe('example_order_mismatch');
    await service.reorder(['de-template', 'de'], DE);
    const order = update.mock.calls.map(
      (call: [{ where: { id: string }; data: { sortOrder: number } }]) => [
        call[0].where.id,
        call[0].data.sortOrder,
      ],
    );
    expect(order).toEqual([
      ['global', 0],
      ['de-template', 1],
      ['kz', 2],
      ['de', 3],
    ]);
  });

  it("builds the visitor matrix from the site selection, for the manager's countries", async () => {
    const { service } = makeService({
      example: { findMany: jest.fn().mockResolvedValue([de, notKz]) },
      templateSample: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const matrix = await service.matrix(DE);
    expect(matrix.map((row) => row.country)).toEqual(['DE']);
    const ru = matrix[0].cells.find((c) => c.language === 'ru')!;
    expect(ru).toMatchObject({ kind: 'example', offered: false });
    expect(ru.items.map((i) => i.id)).toEqual(['ru-book', 'ru-book']);
    const full = await service.matrix(SUPER);
    expect(full.at(-1)!.country).toBe('other');
    const kzRow = full.find((row) => row.country === 'KZ')!;
    expect(kzRow.cells.find((c) => c.language === 'ru')!.kind).toBe('empty');
  });
});

describe('ExamplesService.translate: staff caps', () => {
  const manager = { ...DE, who: 'cm@e2e.test', staffId: 'cm' };

  it("checks the caps for the example's country and records who started it", async () => {
    const rows = exampleRow('ex1', [version('ru')], ['DE']);
    const source = { id: 'ru-book' };
    const { service, translator, caps } = makeService({
      example: { findUnique: jest.fn().mockResolvedValue(rows) },
      book: { findUniqueOrThrow: jest.fn().mockResolvedValue(source) },
    });
    await service.translate('ex1', ['de'], manager, 'DE');
    expect(caps.assert).toHaveBeenCalledWith(manager, 'DE');
    expect(translator.start).toHaveBeenCalledWith(
      'ex1',
      source,
      'de',
      undefined,
      { staffEmail: 'cm@e2e.test', staffCountry: 'DE' },
    );
  });

  it('starts nothing once a cap is reached', async () => {
    const rows = exampleRow('ex1', [version('ru')], ['DE']);
    const { service, translator, caps } = makeService({
      example: { findUnique: jest.fn().mockResolvedValue(rows) },
      book: { findUniqueOrThrow: jest.fn() },
    });
    caps.assert.mockRejectedValueOnce(new Error('staff_cap_reached'));
    await expect(service.translate('ex1', ['de'], manager)).rejects.toThrow(
      'staff_cap_reached',
    );
    expect(translator.start).not.toHaveBeenCalled();
  });

  it('counts the spend against the working country when the example shows there', () => {
    const de_at = { countries: ['DE', 'AT'], countriesMode: 'include' };
    expect(spendCountry(de_at, 'at')).toBe('AT');
    expect(spendCountry(de_at, 'KZ')).toBe('DE');
    expect(spendCountry(de_at, null)).toBe('DE');
    expect(
      spendCountry({ countries: [], countriesMode: 'include' }, null),
    ).toBe(null);
    expect(
      spendCountry({ countries: ['KZ'], countriesMode: 'exclude' }, 'DE'),
    ).toBe('DE');
  });
});
