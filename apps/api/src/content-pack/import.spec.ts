import type { PrismaClient } from '@prisma/client';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exportPack } from './export';
import { importPack, type FileStore } from './import';
import { CONTENT_CLIENT_KEY, FILES_DIR, MANIFEST } from './pack';

const BOOK = 'book0000000001';
const TRANSLATED = 'book0000000002';
const LANDING = { path: 'landing/DE/hero-abcdef0123456789', widths: [384] };

function bookRow(id: string, language: string, clientKey: string) {
  return {
    id,
    status: 'done',
    progress: 100,
    child: {
      name: 'Emil',
      age: 5,
      gender: 'boy',
      interests: ['Schiffe'],
      city: 'Hamburg',
      language,
    },
    language,
    methodology: 'growth-mindset',
    theme: null,
    templateId: 'local-template',
    answers: { skill: 'Fahrrad fahren' },
    title: `Emil ${language}`,
    heroImagePath: `books/${id}/hero.jpeg`,
    pages: [{ page: 1, text: 'Hallo', imagePath: `books/${id}/page-1.jpeg` }],
    talkQuestions: [],
    layout: null,
    generation: null,
    costUsd: 0.25,
    clientKey,
    userId: null,
    demo: true,
    country: 'DE',
    createdAt: new Date('2026-11-04T00:00:00Z'),
    updatedAt: new Date('2026-11-04T00:00:00Z'),
    template: { slug: 'not-yet' },
  };
}

/** The local database a pack is exported from: one German book, its English translation. */
function source(): PrismaClient {
  return {
    templateSample: {
      findMany: jest.fn().mockResolvedValue([
        {
          templateId: 'local-template',
          language: 'de',
          country: 'DE',
          bookId: BOOK,
          template: { slug: 'not-yet' },
        },
      ]),
    },
    example: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'example0000001',
          countries: ['DE'],
          countriesMode: 'include',
          sortOrder: 0,
          versions: [
            { language: 'de', bookId: BOOK },
            { language: 'en', bookId: TRANSLATED },
          ],
        },
        // A global example: not the country's, never in its pack.
        {
          id: 'global00000001',
          countries: [],
          countriesMode: 'include',
          sortOrder: 1,
          versions: [{ language: 'de', bookId: 'x' }],
        },
      ]),
    },
    setting: {
      findUnique: jest.fn().mockResolvedValue({
        value: {
          DE: {
            hero: { de: { title: 'Dein Kind im eigenen Bilderbuch' } },
            faqHidden: [],
            faq: [],
            hiddenSections: [],
            images: {
              hero: {
                all: { ...LANDING, book: { id: BOOK, picture: 'cover' } },
              },
            },
          },
        },
      }),
    },
    book: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          bookRow(BOOK, 'de', 'content-de'),
          bookRow(TRANSLATED, 'en', 'staff:example-translation'),
        ]),
    },
  } as unknown as PrismaClient;
}

/** The database a pack goes into: the catalog, the lineup, one global example, nothing else yet. */
function target() {
  const tx = {
    book: { upsert: jest.fn() },
    templateSample: { deleteMany: jest.fn(), create: jest.fn() },
    example: { create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    exampleVersion: { deleteMany: jest.fn(), create: jest.fn() },
    setting: { upsert: jest.fn() },
  };
  const prisma = {
    bookTemplate: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'prod-template', slug: 'not-yet' }]),
    },
    setting: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === 'reference.landing' ? { value: {} } : null,
        ),
      ),
    },
    book: { findMany: jest.fn().mockResolvedValue([]) },
    templateSample: { findMany: jest.fn().mockResolvedValue([]) },
    example: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'global00000001',
          countries: [],
          countriesMode: 'include',
          sortOrder: 4,
          versions: [
            { language: 'de', bookId: 'prod-book', book: { template: null } },
          ],
        },
      ]),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
  return { prisma: prisma as unknown as PrismaClient, tx };
}

/** The first argument of a mock's first call. */
function firstArg<T>(fn: jest.Mock): T {
  return (fn.mock.calls as unknown[][])[0][0] as T;
}

class MemoryStore implements FileStore {
  files = new Map<string, Buffer>();
  read(path: string) {
    const data = this.files.get(path);
    return data ? Promise.resolve(data) : Promise.reject(new Error('missing'));
  }
  save(path: string, data: Buffer) {
    this.files.set(path, data);
    return Promise.resolve(path);
  }
}

describe('a content pack from one database into another', () => {
  let dir: string;
  let storage: string;
  let out: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pack-'));
    storage = join(dir, 'storage');
    out = join(dir, 'pack');
    const put = async (path: string, text: string) => {
      await mkdir(dirname(join(storage, path)), { recursive: true });
      await writeFile(join(storage, path), text);
    };
    for (const id of [BOOK, TRANSLATED]) {
      await put(`books/${id}/hero.jpeg`, `hero ${id}`);
      await put(`books/${id}/page-1.jpeg`, `page ${id}`);
    }
    await put('landing/DE/hero-abcdef0123456789-384.webp', 'landing');
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('exports the country’s books, files, sample, example and landing', async () => {
    const pack = await exportPack(source(), storage, out, {
      countries: ['DE'],
      hideGlobalIn: ['DE'],
    });
    expect(pack.books.map((b) => [b.id, b.template, b.row.clientKey])).toEqual([
      [BOOK, 'not-yet', CONTENT_CLIENT_KEY],
      [TRANSLATED, 'not-yet', 'staff:example-translation'],
    ]);
    expect(pack.examples.map((e) => e.id)).toEqual(['example0000001']);
    expect(pack.files.map((f) => f.path)).toEqual([
      `books/${BOOK}/hero.jpeg`,
      `books/${BOOK}/page-1.jpeg`,
      `books/${TRANSLATED}/hero.jpeg`,
      `books/${TRANSLATED}/page-1.jpeg`,
      'landing/DE/hero-abcdef0123456789-384.webp',
    ]);
    expect(
      await readFile(
        join(out, FILES_DIR, 'landing/DE/hero-abcdef0123456789-384.webp'),
        'utf8',
      ),
    ).toBe('landing');
  });

  it('reports without writing on a dry run, then writes it all, and a second run finds it there', async () => {
    await exportPack(source(), storage, out, {
      countries: ['DE'],
      hideGlobalIn: ['DE'],
    });
    const { prisma, tx } = target();
    const store = new MemoryStore();

    const dry = await importPack(prisma, store, out, { dryRun: true });
    expect(dry.books.created).toEqual([BOOK, TRANSLATED]);
    expect(dry.files.written).toBe(5);
    expect(dry.samples.set).toEqual(['not-yet/de/DE']);
    expect(dry.examples.created).toEqual(['example0000001']);
    expect(dry.hidden).toEqual([
      {
        id: 'global00000001',
        from: { mode: 'include', countries: [] },
        to: { mode: 'exclude', countries: ['DE'] },
      },
    ]);
    expect(dry.landing).toEqual(['DE hero de', 'DE hero all']);
    expect(store.files.size).toBe(0);
    expect(tx.book.upsert).not.toHaveBeenCalled();

    await importPack(prisma, store, out, { dryRun: false });
    expect(store.files.size).toBe(5);
    expect(tx.book.upsert).toHaveBeenCalledTimes(2);
    expect(firstArg<{ create: unknown }>(tx.book.upsert).create).toMatchObject({
      id: BOOK,
      templateId: 'prod-template',
      userId: null,
      clientKey: CONTENT_CLIENT_KEY,
      country: 'DE',
    });
    expect(tx.templateSample.create).toHaveBeenCalledWith({
      data: {
        templateId: 'prod-template',
        language: 'de',
        country: 'DE',
        bookId: BOOK,
      },
    });
    expect(tx.example.create).toHaveBeenCalledWith({
      data: {
        id: 'example0000001',
        countries: ['DE'],
        countriesMode: 'include',
        sortOrder: 3,
      },
    });
    expect(tx.exampleVersion.create).toHaveBeenCalledTimes(2);
    expect(tx.example.update).toHaveBeenCalledWith({
      where: { id: 'global00000001' },
      data: { countries: ['DE'], countriesMode: 'exclude' },
    });
    expect(
      firstArg<{
        update: { value: { DE: { hero: { de: { title: string } } } } };
      }>(tx.setting.upsert).update.value.DE.hero.de.title,
    ).toBe('Dein Kind im eigenen Bilderbuch');

    const again = await importPack(prisma, store, out, { dryRun: true });
    expect(again.files).toEqual({ written: 0, bytes: 0, same: 5 });
  });

  it('refuses a pack whose file was changed, before writing anything', async () => {
    await exportPack(source(), storage, out, { countries: ['DE'] });
    await writeFile(
      join(out, FILES_DIR, `books/${BOOK}/hero.jpeg`),
      'tampered',
    );
    const { prisma, tx } = target();
    await expect(
      importPack(prisma, new MemoryStore(), out, { dryRun: false }),
    ).rejects.toThrow(
      `books/${BOOK}/hero.jpeg is not the file the manifest lists`,
    );
    expect(tx.book.upsert).not.toHaveBeenCalled();
  });

  it('refuses a pack for a country the site does not offer', async () => {
    await exportPack(source(), storage, out, { countries: ['DE'] });
    const manifest = JSON.parse(
      await readFile(join(out, MANIFEST), 'utf8'),
    ) as { hideGlobalExamplesIn: string[] };
    manifest.hideGlobalExamplesIn = ['FR'];
    await writeFile(join(out, MANIFEST), JSON.stringify(manifest));
    const { prisma } = target();
    await expect(
      importPack(prisma, new MemoryStore(), out, { dryRun: true }),
    ).rejects.toThrow('the site does not offer FR');
  });
});
