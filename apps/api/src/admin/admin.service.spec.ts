import type { ConfigService } from '@nestjs/config';
import { DEFAULT_COUNTRIES } from '@fabulka/shared';
import type { BooksService } from '../books/books.service';
import type { MethodologiesService } from '../methodologies/methodologies.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuotaService } from '../quota/quota.service';
import type { ReferenceService } from '../reference/reference.service';
import type { SettingsService } from '../settings/settings.service';
import type { StorageService } from '../storage/storage.service';
import type { TemplatesService } from '../templates/templates.service';
import { curatedThemes } from '../themes/curated.testing';
import { AdminService } from './admin.service';

function makeService(prisma: unknown, storage: unknown = {}) {
  const books = { toDto: (row: { id: string }) => ({ id: row.id }) };
  return new AdminService(
    prisma as PrismaService,
    books as unknown as BooksService,
    {} as QuotaService,
    {} as SettingsService,
    storage as StorageService,
    {} as TemplatesService,
    {} as MethodologiesService,
    curatedThemes(),
    {
      countries: () => Promise.resolve(DEFAULT_COUNTRIES),
    } as unknown as ReferenceService,
    { get: () => 150 } as unknown as ConfigService,
  );
}

/** A book row with what AdminService.book reads besides the DTO. */
const row = (exampleOf: { exampleId: string; language: string } | null) => ({
  id: 'b1',
  status: 'done',
  child: { name: 'Арман' },
  theme: null,
  answers: null,
  country: null,
  demo: false,
  template: null,
  exampleOf,
  costUsd: 0,
  clientKey: 'k',
});

describe('AdminService.book', () => {
  it('says which example the book is a version of, and in which language', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(row({ exampleId: 'ex1', language: 'ru' }))
      .mockResolvedValueOnce(row(null));
    const service = makeService({ book: { findUnique } });
    expect((await service.book('b1')).example).toEqual({
      id: 'ex1',
      language: 'ru',
    });
    expect((await service.book('b1')).example).toBeNull();
  });

  it('says when the book does not exist', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    await expect(
      makeService({ book: { findUnique } }).book('nope'),
    ).rejects.toThrow('book nope not found');
  });
});

describe('AdminService.deleteBook', () => {
  it('deletes the book, its files and an example left with no version', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const examples = jest.fn().mockResolvedValue({ count: 1 });
    const removeDir = jest.fn().mockResolvedValue(undefined);
    const service = makeService(
      { book: { deleteMany }, example: { deleteMany: examples } },
      { removeDir },
    );
    await service.deleteBook('b1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(removeDir).toHaveBeenCalledWith('books/b1');
    expect(examples).toHaveBeenCalledWith({
      where: { versions: { none: {} } },
    });
  });
});

describe('AdminService.updateTemplate samples', () => {
  const templateRow = {
    id: 't1',
    slug: 'bath-time',
    title: 'Купание',
    summary: 'Вечер',
    ageMin: 2,
    ageMax: 4,
    methodology: 'toddler-routine',
    languages: ['ru', 'kk', 'en', 'es', 'de'],
    coverUrl: null,
    questions: [],
    published: true,
    sortOrder: 0,
    theme: 'bath',
    plot: [],
    stylePrompt: null,
    layoutTheme: null,
    blocks: null,
    countries: ['KZ', 'XK'],
    _count: { books: 2 },
    samples: [{ language: 'ru', bookId: 'ru-book' }],
  };

  function setup(book: Record<string, unknown> | null) {
    const tx = {
      bookTemplate: { update: jest.fn().mockResolvedValue({ id: 't1' }) },
      templateSample: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      bookTemplate: { findUnique: jest.fn().mockResolvedValue(templateRow) },
      book: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(book),
      },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    return { service: makeService(prisma), tx };
  }

  const book = (patch: Record<string, unknown> = {}) => ({
    status: 'done',
    language: 'en',
    template: { slug: 'bath-time' },
    sampleOf: null,
    ...patch,
  });

  it('shows the samples by language', async () => {
    const { service } = setup(null);
    expect((await service.template('bath-time')).samples).toEqual({
      ru: 'ru-book',
    });
  });

  it('sets a sample in its language and clears another', async () => {
    const { service, tx } = setup(book());
    await service.updateTemplate('bath-time', {
      samples: { en: 'en-book', kk: null },
    });
    expect(tx.templateSample.deleteMany).toHaveBeenCalledWith({
      where: { templateId: 't1', language: 'en' },
    });
    expect(tx.templateSample.create).toHaveBeenCalledWith({
      data: { templateId: 't1', language: 'en', bookId: 'en-book' },
    });
    expect(tx.templateSample.deleteMany).toHaveBeenCalledWith({
      where: { templateId: 't1', language: 'kk' },
    });
    expect(tx.templateSample.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a book in another language', book({ language: 'ru' })],
    ['an unfinished book', book({ status: 'pages' })],
    ['a book from another template', book({ template: { slug: 'not-yet' } })],
    [
      'the sample of another template',
      book({ sampleOf: { template: { slug: 'not-yet' } } }),
    ],
    ['a missing book', null],
  ])('refuses %s', async (_, found) => {
    const { service, tx } = setup(found);
    await expect(
      service.updateTemplate('bath-time', { samples: { en: 'en-book' } }),
    ).rejects.toThrow();
    expect(tx.templateSample.create).not.toHaveBeenCalled();
  });

  it('sets the countries the catalog lists it in', async () => {
    const { service, tx } = setup(null);
    await service.updateTemplate('bath-time', { countries: ['KZ', 'DE'] });
    expect(tx.bookTemplate.update).toHaveBeenCalledWith({
      where: { slug: 'bath-time' },
      data: { countries: ['KZ', 'DE'] },
    });
    expect((await service.template('bath-time')).countries).toEqual([
      'KZ',
      'XK',
    ]);
  });

  it('refuses a country the site does not offer, but keeps one it has', async () => {
    const { service, tx } = setup(null);
    // FR is a real code, but not in reference.countries.
    await expect(
      service.updateTemplate('bath-time', { countries: ['KZ', 'FR'] }),
    ).rejects.toThrow('FR');
    expect(tx.bookTemplate.update).not.toHaveBeenCalled();
    // XK is no longer offered, but the book already had it.
    await service.updateTemplate('bath-time', { countries: ['XK'] });
    expect(tx.bookTemplate.update).toHaveBeenCalled();
  });
});
