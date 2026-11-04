import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  BUILTIN_ROLES,
  SUPER_ROLE,
  accessOf,
  type RoleDef,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import {
  STATS_RIGHTS,
  TRACE_RIGHTS,
  assertGlobal,
} from './pipeline.controller';
import { PipelineService } from './pipeline.service';

const storage = {
  url: (path: string | null) => (path ? `/files/${path}` : null),
} as unknown as StorageService;

function setup(
  over: {
    statsRows?: unknown[];
    book?: Record<string, unknown> | null;
    calls?: unknown[];
  } = {},
) {
  const prisma = {
    $queryRaw: jest.fn(() => Promise.resolve(over.statsRows ?? [])),
    book: {
      aggregate: jest.fn(() =>
        Promise.resolve({ _count: 3, _sum: { costUsd: 0.6 } }),
      ),
      findUnique: jest.fn(() => Promise.resolve(over.book ?? null)),
    },
    illustratorReference: {
      groupBy: jest.fn(() =>
        Promise.resolve([
          { kind: 'style', enabled: true, _count: 2 },
          { kind: 'style', enabled: false, _count: 1 },
          { kind: 'character_guide', enabled: true, _count: 1 },
        ]),
      ),
    },
    modelCall: { findMany: jest.fn(() => Promise.resolve(over.calls ?? [])) },
  };
  const service = new PipelineService(
    prisma as unknown as PrismaService,
    storage,
  );
  return { service, prisma };
}

/** The SQL text of a Prisma.sql call, with its values. */
const sqlOf = (call: unknown[]) => {
  const query = call[0] as { strings: string[]; values: unknown[] };
  return { text: query.strings.join('?'), values: query.values };
};

describe('PipelineService.stats', () => {
  it('sums the journal onto the graph for books of the format in the period', async () => {
    const { service, prisma } = setup({
      statsRows: [
        {
          step: 'frame.draw',
          kind: 'page',
          calls: 40,
          books: 2,
          errors: 4,
          refusals: 3,
          cost: 0.36,
          latency: 40 * 30000,
        },
        {
          step: null,
          kind: 'voice-transcribe',
          calls: 5,
          books: 0,
          errors: 0,
          refusals: 0,
          cost: 0.005,
          latency: 5 * 1200,
        },
        {
          step: null,
          kind: 'theme',
          calls: 9,
          books: 0,
          errors: 0,
          refusals: 0,
          cost: 1,
          latency: 1,
        },
      ],
    });
    const now = Date.parse('2026-11-04T12:00:00Z');
    const stats = await service.stats('comic', '7d', now);

    const { text, values } = sqlOf(prisma.$queryRaw.mock.calls[0]);
    expect(text).toContain('b."storyFormat" =');
    expect(text).toContain('group by mc.step, mc.kind');
    expect(values).toContain('comic');
    expect(values).toContainEqual(new Date(now - 7 * 24 * 3600 * 1000));
    expect(values).toEqual(
      expect.arrayContaining(['voice-transcribe', 'voice-extract']),
    );

    expect(stats.books).toBe(3);
    expect(stats.costUsd).toBe(0.6);
    expect(stats.nodes['frame.draw']).toMatchObject({
      calls: 40,
      errors: 4,
      refusals: 3,
      avgLatencyMs: 30000,
      errorRate: 0.1,
    });
    expect(stats.nodes['frame.draw']?.avgCostUsd).toBeCloseTo(0.009, 6);
    expect(stats.nodes['voice.transcribe']?.calls).toBe(5);
    // Theme proposals are not a pipeline step.
    expect(Object.keys(stats.nodes).sort()).toEqual([
      'frame.draw',
      'voice.transcribe',
    ]);
    expect(stats.references).toEqual([
      { kind: 'style', enabled: 2, total: 3 },
      { kind: 'character_guide', enabled: 1, total: 1 },
    ]);
  });

  it('looks back 30 days for 30d', async () => {
    const { service, prisma } = setup();
    const now = Date.parse('2026-11-04T12:00:00Z');
    await service.stats('picture-book', '30d', now);
    expect(sqlOf(prisma.$queryRaw.mock.calls[0]).values).toContainEqual(
      new Date(now - 30 * 24 * 3600 * 1000),
    );
    expect(prisma.book.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storyFormat: 'picture-book',
          createdAt: { gte: new Date(now - 30 * 24 * 3600 * 1000) },
        },
      }),
    );
  });
});

describe('PipelineService.trace', () => {
  const at = (s: number) => new Date(Date.parse('2026-11-04T10:00:00Z') + s);
  const call = (over: Record<string, unknown>) => ({
    bookId: 'b1',
    step: null,
    kind: 'page',
    model: 'muse-image-1.0',
    status: 'ok',
    errorCode: null,
    attempt: 1,
    page: null,
    frame: null,
    latencyMs: 1000,
    costUsd: 0.01,
    prompt: null,
    output: null,
    createdAt: at(0),
    ...over,
    id: `c${String(over.id)}`,
  });
  const book = {
    id: 'b1',
    title: 'The Kite',
    child: { name: 'Mia' },
    storyFormat: 'comic',
    status: 'done',
    language: 'en',
    heroSource: 'description',
    costUsd: 0.3,
    createdAt: at(0),
    heroImagePath: 'books/b1/hero.png',
    petImagePath: null,
    toyImagePath: null,
    toyCutoutPath: null,
    coverImagePath: 'books/b1/cover.png',
    pdfPath: 'books/b1/book.pdf',
    cast: [{ id: 'c1', name: 'Ali', imagePath: 'books/b1/cast-c1.png' }],
    pages: [
      {
        page: 1,
        beat: 1,
        grid: 'two-rows',
        frames: [
          {
            frame: 1,
            rect: { x: 0, y: 0, w: 1, h: 0.5 },
            scenePrompt: 'Mia runs with a kite',
            cast: [],
            imagePath: 'books/b1/page-1.png',
            art: 'softened',
          },
          {
            frame: 2,
            rect: { x: 0, y: 0.5, w: 1, h: 0.5 },
            scenePrompt: 'The kite flies',
            cast: [],
            imagePath: 'books/b1/page-1-2.png',
            art: 'drawn',
          },
        ],
        texts: [],
      },
    ],
  };

  it('is 404 for a book that does not exist', async () => {
    const { service } = setup();
    await expect(service.trace('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('puts the run on the graph: calls in order, nodes, frames with their ladder, pictures', async () => {
    const { service, prisma } = setup({
      book,
      calls: [
        call({
          id: 1,
          step: 'story.write',
          kind: 'story',
          createdAt: at(30000),
          latencyMs: 29000,
        }),
        call({
          id: 2,
          step: 'frame.draw',
          page: 1,
          frame: 1,
          status: 'error',
          errorCode: 'content_policy',
          costUsd: 0,
          prompt: 'Mia falls off the cliff',
          createdAt: at(40000),
        }),
        call({
          id: 3,
          step: 'frame.draw',
          page: 1,
          frame: 1,
          createdAt: at(45000),
        }),
        call({
          id: 4,
          step: 'frame.draw',
          page: 1,
          frame: 2,
          createdAt: at(41000),
        }),
        call({ id: 5, step: null, kind: 'theme', createdAt: at(50000) }),
      ],
    });
    const trace = await service.trace('b1');
    expect(prisma.modelCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookId: 'b1' } }),
    );
    expect(trace.book).toMatchObject({
      id: 'b1',
      childName: 'Mia',
      format: 'comic',
    });
    expect(trace.calls.map((c) => c.id)).toEqual(['c1', 'c2', 'c4', 'c3']);
    expect(trace.calls[1].prompt).toBe('Mia falls off the cliff');
    expect(trace.nodes['frame.draw']).toMatchObject({
      calls: 3,
      errors: 1,
      refusals: 1,
    });
    expect(trace.frames).toEqual([
      expect.objectContaining({
        page: 1,
        frame: 1,
        art: 'softened',
        calls: 2,
        refusals: 1,
        imageUrl: '/files/books/b1/page-1.png',
        scene: 'Mia runs with a kite',
      }),
      expect.objectContaining({ page: 1, frame: 2, art: 'drawn', calls: 1 }),
    ]);
    expect(trace.images['sheet.hero']).toEqual([
      { label: 'hero', url: '/files/books/b1/hero.png' },
    ]);
    expect(trace.images['sheet.cast']).toEqual([
      { label: 'Ali', url: '/files/books/b1/cast-c1.png' },
    ]);
    expect(trace.images['frame.draw']).toHaveLength(2);
    expect(trace.images['sheet.pet']).toBeUndefined();
  });
});

describe('PipelineService.books', () => {
  it('searches by id, title or the child, optionally in one format', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 'b1',
        title: 'The Kite',
        childName: 'Mia',
        format: 'comic',
        status: 'done',
        calls: 40,
        createdAt: new Date('2026-11-04T10:00:00Z'),
      },
    ]);
    const books = await service.books('mi_a', 'comic');
    const { text, values } = sqlOf(prisma.$queryRaw.mock.calls[0]);
    expect(text).toContain("child->>'name' ilike");
    // The query is matched literally: LIKE's wildcards are escaped.
    expect(values).toContain('%mi\\_a%');
    expect(values).toContain('comic');
    expect(books).toEqual([
      {
        id: 'b1',
        title: 'The Kite',
        childName: 'Mia',
        format: 'comic',
        status: 'done',
        calls: 40,
        createdAt: '2026-11-04T10:00:00.000Z',
      },
    ]);
  });
});

describe('pipeline rights', () => {
  const defs: RoleDef[] = [
    ...BUILTIN_ROLES,
    { key: 'journal_de', rights: ['journal'], scoped: true },
    { key: 'formats_reader', rights: ['story_formats.read'], scoped: false },
  ];
  const SUPER = accessOf([SUPER_ROLE], defs, []);
  const DE = accessOf(['country_manager'], defs, ['DE']);
  const JOURNAL_DE = accessOf(['journal_de'], defs, ['DE']);
  const READER = accessOf(['formats_reader'], defs, []);
  const ILLUSTRATOR = accessOf(['illustrator'], defs, []);

  it('opens stats to global journal or format staff only', () => {
    expect(() => assertGlobal(SUPER, STATS_RIGHTS)).not.toThrow();
    expect(() => assertGlobal(READER, STATS_RIGHTS)).not.toThrow();
    expect(() => assertGlobal(JOURNAL_DE, STATS_RIGHTS)).toThrow(
      ForbiddenException,
    );
    expect(() => assertGlobal(DE, STATS_RIGHTS)).toThrow(ForbiddenException);
  });

  it('opens a trace to global journal or books staff only', () => {
    expect(() => assertGlobal(SUPER, TRACE_RIGHTS)).not.toThrow();
    expect(() => assertGlobal(READER, TRACE_RIGHTS)).toThrow(
      ForbiddenException,
    );
    // books.review is not books: an illustrator reviews pictures, the journal is not theirs.
    expect(() => assertGlobal(ILLUSTRATOR, TRACE_RIGHTS)).toThrow(
      ForbiddenException,
    );
    expect(() => assertGlobal(JOURNAL_DE, TRACE_RIGHTS)).toThrow(
      ForbiddenException,
    );
  });
});
