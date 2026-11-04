import type { ConfigService } from '@nestjs/config';
import type { Book as BookRow } from '@prisma/client';
import {
  BOOK_THEMES,
  DEFAULT_STORY_FORMATS,
  withTheme,
  type BookLayout,
} from '@fabulka/shared';
import type { BooksService, StoredPage } from '../books/books.service';
import type { FormatsService } from '../formats/formats.service';
import { JournalService } from '../journal/journal.service';
import { MockGateway } from '../meta/mock.gateway';
import type { PrismaService } from '../prisma/prisma.service';
import type { SeoWebService } from '../seo/seo-web.service';
import type { StorageService } from '../storage/storage.service';
import { curatedThemes } from '../themes/curated.testing';
import { sourceRow } from './examples.testing';
import { isTransient, TranslatorService } from './translator.service';

/** A tiny in-memory Book table holding the source and whatever the job writes. */
function fakePrisma(source: BookRow & { template?: unknown }) {
  const rows = new Map<string, Record<string, unknown>>([
    [source.id, { ...source }],
  ]);
  const calls: Record<string, unknown>[] = [];
  const prisma = {
    rows,
    calls,
    book: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: 'new' };
        rows.set('new', row);
        return Promise.resolve(row);
      }),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.get(where.id)),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = { ...rows.get(where.id), ...data };
          rows.set(where.id, row);
          return Promise.resolve(row);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          rows.set(where.id, { ...rows.get(where.id), ...data });
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    exampleVersion: { create: jest.fn().mockResolvedValue({}) },
    modelCall: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        calls.push(data);
        return Promise.resolve({});
      }),
    },
  };
  return prisma;
}

/** Render QA as the fake renderer reports it: the pages given overflow, the rest fit. */
function rendered(layout: BookLayout, pages: StoredPage[], overflow: number[]) {
  return {
    pdfPath: 'books/new/book.pdf',
    tones: {},
    pages,
    layout: {
      ...layout,
      qa: {
        status: overflow.length ? ('blocked' as const) : ('ok' as const),
        checkedAt: 'now',
        issues: overflow.map((page) => ({
          page: `story-${page}`,
          kind: 'overflow' as const,
          detail: 'too long',
        })),
        notes: [],
      },
    },
  };
}

function makeTranslator(
  source: BookRow & { template?: unknown },
  options: {
    /** Changes the mock models before the job runs (spies). */
    setup?: (models: MockGateway) => void;
    /** Pages that overflow on each render, in order; then none. */
    overflow?: number[][];
  } = {},
) {
  const prisma = fakePrisma(source);
  const journal = new JournalService(prisma as unknown as PrismaService);
  const models = new MockGateway(0, journal);
  options.setup?.(models);
  const copy = jest.fn().mockResolvedValue('');
  const overflow = [...(options.overflow ?? [])];
  const renderPdf = jest.fn(
    (row: { pages: StoredPage[] }, layout: BookLayout) =>
      Promise.resolve(rendered(layout, row.pages, overflow.shift() ?? [])),
  );
  const revalidate = jest.fn().mockResolvedValue(true);
  const translator = new TranslatorService(
    prisma as unknown as PrismaService,
    { copy } as unknown as StorageService,
    {
      renderPdf,
      shortenOverflow: () => Promise.resolve(null),
    } as unknown as BooksService,
    curatedThemes(),
    journal,
    { revalidate } as unknown as SeoWebService,
    models,
    {
      forBook: () => Promise.resolve(DEFAULT_STORY_FORMATS[0]),
    } as unknown as FormatsService,
    { get: () => 2 } as unknown as ConfigService,
  );
  /** The models' translateBook as the spy a test's setup put on it. */
  const translateSpy = () =>
    jest.mocked<MockGateway['translateBook']>(
      Reflect.get(models, 'translateBook'),
    );
  return {
    translator,
    prisma,
    copy,
    renderPdf,
    revalidate,
    models,
    journal,
    translateSpy,
  };
}

/** Waits until the book reaches done or failed. */
async function settled(prisma: ReturnType<typeof fakePrisma>) {
  for (let i = 0; i < 100; i++) {
    const status = prisma.rows.get('new')?.status;
    if (status === 'done' || status === 'failed') return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('the translation never finished');
}

describe('TranslatorService', () => {
  it('makes a new done book in the target language from copied pictures, journaled and costed', async () => {
    const { translator, prisma, copy, renderPdf, revalidate, journal } =
      makeTranslator(sourceRow(), {
        setup: (models) => {
          const translate = models.translateBook.bind(models);
          jest
            .spyOn(models, 'translateBook')
            .mockImplementation(async (brief) => ({
              ...(await translate(brief)),
              costUsd: 0.02,
            }));
        },
      });

    const id = await translator.start('ex1', sourceRow(), 'en', 0);
    expect(id).toBe('new');
    expect(prisma.exampleVersion.create).toHaveBeenCalledWith({
      data: { exampleId: 'ex1', language: 'en', bookId: 'new' },
    });
    expect(await settled(prisma)).toBe('done');
    await journal.idle();

    expect(copy).toHaveBeenCalledWith(
      'books/src/page-1.jpeg',
      'books/new/page-1.jpeg',
    );
    expect(copy).toHaveBeenCalledTimes(7);
    expect(renderPdf).toHaveBeenCalledTimes(1);
    const book = prisma.rows.get('new')!;
    expect(book).toMatchObject({
      status: 'done',
      language: 'en',
      title: 'Timur and the Starry Journey',
      child: { name: 'Timur', language: 'en' },
      pdfPath: 'books/new/book.pdf',
      progress: 100,
      costUsd: 0.02,
      error: null,
    });
    expect(
      (book.pages as StoredPage[]).map((p) => p.frames[0].imagePath),
    ).toEqual(['books/new/page-1.jpeg', 'books/new/page-2.jpeg']);
    // The source is untouched.
    expect(prisma.rows.get('src')).toMatchObject({
      title: 'Тайна снежного барса',
      language: 'ru',
    });
    expect(prisma.calls.map((c) => [c.kind, c.bookId])).toEqual([
      ['translate', 'new'],
    ]);
    expect(revalidate).toHaveBeenCalledWith(['examples']);
  });

  it('shortens a page that overflows and prints the book again', async () => {
    let shorten!: jest.SpyInstance<
      ReturnType<MockGateway['shortenText']>,
      Parameters<MockGateway['shortenText']>
    >;
    const { translator, prisma, renderPdf } = makeTranslator(sourceRow(), {
      setup: (models) => {
        shorten = jest.spyOn(models, 'shortenText');
      },
      overflow: [[2]],
    });
    await translator.start('ex1', sourceRow(), 'de', 0);
    expect(await settled(prisma)).toBe('done');
    expect(shorten).toHaveBeenCalledTimes(1);
    expect(shorten.mock.calls[0][0]).toMatchObject({ language: 'de' });
    // Page 2 of the German mock has 10 words: asked for 8.
    expect(shorten.mock.calls[0][0].maxWords).toBe(8);
    expect(renderPdf).toHaveBeenCalledTimes(2);
    const pages = prisma.rows.get('new')!.pages as StoredPage[];
    expect(pages[1].texts[0].text.split(' ')).toHaveLength(8);
    expect(pages[0].texts[0].text).toBe(
      'Seite 1. Timur bricht in Almaty zu einem neuen Abenteuer auf.',
    );
  });

  it('tries once more after a transient failure', async () => {
    const { translator, prisma, translateSpy } = makeTranslator(sourceRow(), {
      setup: (models) => {
        const translate = models.translateBook.bind(models);
        jest
          .spyOn(models, 'translateBook')
          .mockRejectedValueOnce(
            Object.assign(new Error('Bad gateway'), { status: 502 }),
          )
          .mockImplementation(translate);
      },
    });
    await translator.start('ex1', sourceRow(), 'es', 0);
    expect(await settled(prisma)).toBe('done');
    expect(translateSpy()).toHaveBeenCalledTimes(2);
  });

  it('fails the book with the reason and what was spent when it cannot be done', async () => {
    const { translator, prisma, revalidate, translateSpy } = makeTranslator(
      sourceRow(),
      {
        setup: (models) =>
          void jest
            .spyOn(models, 'translateBook')
            .mockRejectedValue(
              new Error('Muse Spark returned an invalid translation 3 times'),
            ),
      },
    );
    await translator.start('ex1', sourceRow(), 'kk', 0);
    expect(await settled(prisma)).toBe('failed');
    expect(translateSpy()).toHaveBeenCalledTimes(1);
    expect(prisma.rows.get('new')).toMatchObject({
      status: 'failed',
      error: 'Muse Spark returned an invalid translation 3 times',
      costUsd: 0,
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("keeps the book's theme when it covers the language, else the catalog book's, else by age", async () => {
    const { translator } = makeTranslator(sourceRow());
    const fairy = await translator.layoutFor(sourceRow(), 'de', null);
    expect(fairy.theme.id).toBe('fairy');
    // Books from before themes have the classic look, which no new book may use.
    const legacy = sourceRow({ layout: null });
    expect(
      (await translator.layoutFor(legacy, 'de', 'adventure')).theme.id,
    ).toBe('adventure');
    expect((await translator.layoutFor(legacy, 'de', null)).theme.id).toBe(
      'fairy',
    );
    expect(
      (await translator.layoutFor(legacy, 'de', 'no-such-theme')).theme.id,
    ).toBe('fairy');
    // A comic keeps the comic theme its format picked, though parents cannot pick it.
    const comic = sourceRow({
      layout: withTheme(
        sourceRow().layout as unknown as BookLayout,
        BOOK_THEMES.comic,
      ) as never,
    });
    expect((await translator.layoutFor(comic, 'kk', null)).theme.id).toBe(
      'comic',
    );
  });
});

describe('isTransient', () => {
  it('retries the network, timeouts, rate limits and 5xx only', () => {
    expect(isTransient(Object.assign(new Error('x'), { status: 503 }))).toBe(
      true,
    );
    expect(isTransient(Object.assign(new Error('x'), { status: 429 }))).toBe(
      true,
    );
    expect(isTransient(Object.assign(new Error('x'), { status: 400 }))).toBe(
      false,
    );
    expect(
      isTransient(
        Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' }),
      ),
    ).toBe(true);
    expect(
      isTransient(Object.assign(new Error('x'), { code: 'ECONNRESET' })),
    ).toBe(true);
    expect(isTransient(new Error('Request timed out.'))).toBe(true);
    expect(
      isTransient(
        new Error('Muse Spark returned an invalid translation 3 times'),
      ),
    ).toBe(false);
  });
});
