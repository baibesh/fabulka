import type { ConfigService } from '@nestjs/config';
import type { BooksService } from '../books/books.service';
import type { MethodologiesService } from '../methodologies/methodologies.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuotaService } from '../quota/quota.service';
import type { SettingsService } from '../settings/settings.service';
import type { StorageService } from '../storage/storage.service';
import type { TemplatesService } from '../templates/templates.service';
import { curatedThemes } from '../themes/curated.testing';
import { AdminService } from './admin.service';

function makeService(prisma: unknown) {
  const books = { toDto: (row: { id: string }) => ({ id: row.id }) };
  return new AdminService(
    prisma as PrismaService,
    books as unknown as BooksService,
    {} as QuotaService,
    {} as SettingsService,
    {} as StorageService,
    {} as TemplatesService,
    {} as MethodologiesService,
    curatedThemes(),
    { get: () => 150 } as unknown as ConfigService,
  );
}

/** A book row with what AdminService.book reads besides the DTO. */
const row = (status: string, featured: boolean) => ({
  id: 'b1',
  status,
  featured,
  child: { name: 'Арман' },
  theme: null,
  answers: null,
  country: null,
  demo: false,
  costUsd: 0,
  clientKey: 'k',
});

describe('AdminService.setFeatured', () => {
  it('puts a finished book among the examples', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ status: 'done' })
      .mockResolvedValueOnce(row('done', true));
    const service = makeService({ book: { findUnique, update } });

    const book = await service.setFeatured('b1', true);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { featured: true },
    });
    expect(book.featured).toBe(true);
  });

  it('refuses a book that is not finished, but lets one be taken off', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce(row('failed', false));
    const service = makeService({ book: { findUnique, update } });

    await expect(service.setFeatured('b1', true)).rejects.toThrow(
      'только готовую книгу',
    );
    expect(update).not.toHaveBeenCalled();
    await service.setFeatured('b1', false);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { featured: false },
    });
  });

  it('says when the book does not exist', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    await expect(
      makeService({ book: { findUnique } }).setFeatured('nope', true),
    ).rejects.toThrow('book nope not found');
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
});
