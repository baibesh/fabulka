import {
  COMIC,
  DEFAULT_STORY_FORMATS,
  PICTURE_BOOK,
  PRESET_GRIDS,
  STORY_FORMAT_EXISTS,
  STORY_FORMAT_IN_USE,
  type CreateStoryFormat,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { FormatsService } from './formats.service';

/** An in-memory StoryFormat table, with the methods and books that use the formats. */
function makeService(
  used: {
    methods?: { slug: string; format: string }[];
    books?: Record<string, number>;
  } = {},
) {
  const rows = new Map<string, Record<string, unknown>>();
  const now = new Date();
  const storyFormat = {
    createMany: jest.fn(({ data }: { data: Record<string, unknown>[] }) => {
      let count = 0;
      for (const row of data)
        if (!rows.has(row.slug as string)) {
          rows.set(row.slug as string, {
            ...row,
            createdAt: now,
            updatedAt: now,
          });
          count++;
        }
      return Promise.resolve({ count });
    }),
    findMany: jest.fn(() => Promise.resolve([...rows.values()])),
    findUnique: jest.fn(({ where }: { where: { slug: string } }) =>
      Promise.resolve(rows.get(where.slug) ?? null),
    ),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      if (rows.has(data.slug as string))
        return Promise.reject(
          Object.assign(new Error('exists'), { code: 'P2002' }),
        );
      rows.set(data.slug as string, {
        ...data,
        createdAt: now,
        updatedAt: now,
      });
      return Promise.resolve(data);
    }),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { slug: string };
        data: Record<string, unknown>;
      }) => {
        const row = rows.get(where.slug);
        if (!row) return Promise.resolve({ count: 0 });
        rows.set(where.slug, { ...row, ...data });
        return Promise.resolve({ count: 1 });
      },
    ),
    delete: jest.fn(({ where }: { where: { slug: string } }) => {
      rows.delete(where.slug);
      return Promise.resolve({});
    }),
  };
  const prisma = {
    storyFormat,
    methodology: {
      findMany: jest.fn(({ where }: { where?: { format: string } }) =>
        Promise.resolve(
          (used.methods ?? []).filter(
            (m) => !where || m.format === where.format,
          ),
        ),
      ),
    },
    book: {
      groupBy: jest.fn(({ where }: { where?: { storyFormat: string } }) =>
        Promise.resolve(
          Object.entries(used.books ?? {})
            .filter(([format]) => !where || where.storyFormat === format)
            .map(([format, n]) => ({ storyFormat: format, _count: n })),
        ),
      ),
    },
  };
  const service = new FormatsService(prisma as unknown as PrismaService);
  return { service, rows };
}

const strips: CreateStoryFormat = {
  slug: 'strips',
  texts: {
    ru: { name: 'Полоски', summary: '' },
    en: { name: 'Strips', summary: '' },
  },
  ageMin: 6,
  ageMax: 12,
  pageCount: 4,
  grids: [PRESET_GRIDS.find((g) => g.id === 'strips-3')!],
  textRules: [{ kind: 'speech', maxWords: 10, perFrame: 1 }],
  rules: ['Three moments a page.'],
  artStyle: null,
  frameDirection: null,
  castSheets: 1,
  theme: null,
  gutterMm: 2,
  borderMm: 0.5,
  published: true,
  sortOrder: 50,
};

describe('FormatsService', () => {
  it('seeds the picture book and the comic once, never over what the admin changed', async () => {
    const { service, rows } = makeService();
    await service.onModuleInit();
    expect([...rows.keys()]).toEqual(DEFAULT_STORY_FORMATS.map((f) => f.slug));
    await service.update(COMIC, { ...strips, gutterMm: 5 });
    await service.onModuleInit();
    expect(rows.get(COMIC)?.gutterMm).toBe(5);
  });

  it("gives a book its method's format, and the picture book for one that is gone", async () => {
    const { service } = makeService();
    await service.onModuleInit();
    expect((await service.forBook(COMIC)).grids.length).toBeGreaterThan(1);
    expect((await service.forBook('gone')).slug).toBe(PICTURE_BOOK);
    expect((await service.forBook(undefined)).slug).toBe(PICTURE_BOOK);
  });

  it('creates a format the admin made, with its cost per book from its frames', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const made = await service.create(strips);
    expect(made).toMatchObject({
      slug: 'strips',
      castSheets: 1,
      methodologies: [],
      books: 0,
    });
    // 4 pages of 3 strips, the hero, one cast sheet and the cover.
    expect(made.estimate.images).toBe(12 + 3);
    await expect(service.create(strips)).rejects.toMatchObject({
      response: { code: STORY_FORMAT_EXISTS },
    });
  });

  it('keeps a format methods or books use, and the picture book always', async () => {
    const { service } = makeService({
      methods: [{ slug: 'comic-quest', format: COMIC }],
      books: { [COMIC]: 2 },
    });
    await service.onModuleInit();
    await service.create(strips);
    await expect(service.remove(COMIC)).rejects.toMatchObject({
      response: {
        code: STORY_FORMAT_IN_USE,
        methodologies: ['comic-quest'],
        books: 2,
      },
    });
    await expect(service.remove(PICTURE_BOOK)).rejects.toMatchObject({
      response: { code: STORY_FORMAT_IN_USE },
    });
    await service.remove('strips');
    expect(await service.exists('strips')).toBe(false);
  });
});
