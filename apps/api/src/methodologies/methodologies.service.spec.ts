import { DEFAULT_METHODOLOGIES, type CreateMethodology } from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { CACHE_MS, MethodologiesService } from './methodologies.service';
import { SEEDED_METHOD_TEXTS_V1 } from './seeded';

type Row = Record<string, unknown> & { slug: string };

const withDates = (row: Row): Row => ({
  createdAt: new Date(),
  updatedAt: new Date(),
  ...row,
});

/**
 * Methods in memory behind the few Prisma calls the service makes, and how many catalog books and
 * books follow each slug.
 */
function makeService(
  used: {
    templates?: Record<string, number>;
    books?: Record<string, number>;
  } = {},
) {
  const rows = new Map<string, Row>();
  const counts = (by: Record<string, number> = {}) =>
    jest.fn(({ where }: { where?: { methodology: string } }) =>
      Promise.resolve(
        Object.entries(by)
          .filter(([slug]) => !where || where.methodology === slug)
          .map(([methodology, n]) => ({ methodology, _count: n })),
      ),
    );
  const methodology = {
    createMany: jest.fn(({ data }: { data: Row[] }) => {
      const added = data.filter((row) => !rows.has(row.slug));
      for (const row of added)
        rows.set(row.slug, withDates({ published: true, ...row }));
      return Promise.resolve({ count: added.length });
    }),
    create: jest.fn(({ data }: { data: Row }) => {
      if (rows.has(data.slug))
        return Promise.reject(
          Object.assign(new Error('unique'), { code: 'P2002' }),
        );
      rows.set(data.slug, withDates(data));
      return Promise.resolve(data);
    }),
    findMany: jest.fn(() =>
      Promise.resolve(
        [...rows.values()].sort(
          (a, b) =>
            (a.sortOrder as number) - (b.sortOrder as number) ||
            a.slug.localeCompare(b.slug),
        ),
      ),
    ),
    findUnique: jest.fn(({ where }: { where: { slug: string } }) =>
      Promise.resolve(rows.get(where.slug) ?? null),
    ),
    updateMany: jest.fn(
      ({ where, data }: { where: { slug: string }; data: Partial<Row> }) => {
        const row = rows.get(where.slug);
        if (row) Object.assign(row, data);
        return Promise.resolve({ count: row ? 1 : 0 });
      },
    ),
    delete: jest.fn(({ where }: { where: { slug: string } }) => {
      rows.delete(where.slug);
      return Promise.resolve({});
    }),
  };
  const prisma = {
    methodology,
    bookTemplate: { groupBy: counts(used.templates) },
    book: { groupBy: counts(used.books) },
  };
  const service = new MethodologiesService(prisma as unknown as PrismaService);
  return { service, rows, methodology };
}

const calm: CreateMethodology = {
  slug: 'calm-down',
  texts: {
    ru: { name: 'Спокойствие', summary: 'Учимся успокаиваться.' },
    kk: { name: 'Тыныштық', summary: 'Тынышталуды үйренеміз.' },
    en: { name: 'Calm', summary: 'Learning to calm down.' },
  },
  source: 'Mindfulness for children',
  ageMin: 5,
  ageMax: 7,
  structure: ['The hero is upset.'],
  rules: [],
  avoid: [],
  maxWordsPerPage: null,
  format: 'picture-book',
  published: true,
  sortOrder: 100,
};

describe('MethodologiesService', () => {
  describe('seeding', () => {
    it('adds every seed method to an empty table', async () => {
      const { service, rows } = makeService();
      await service.onModuleInit();
      expect([...rows.keys()]).toEqual(
        DEFAULT_METHODOLOGIES.map((m) => m.slug),
      );
      expect(rows.get('social-story')).toMatchObject({
        source: 'Social Stories by Carol Gray',
        texts: { kk: { name: 'Әлеуметтік әңгіме' } },
      });
    });

    it('adds only the missing ones and keeps what the admin changed', async () => {
      const { service, rows, methodology } = makeService();
      rows.set(
        'social-story',
        withDates({
          slug: 'social-story',
          source: 'edited in the admin',
          published: false,
          sortOrder: 0,
        }),
      );
      await service.onModuleInit();
      expect(rows.size).toBe(DEFAULT_METHODOLOGIES.length);
      expect(rows.get('social-story')).toMatchObject({
        source: 'edited in the admin',
        published: false,
      });
      expect(methodology.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });

    it('fills in the Spanish and German seed texts only where a method has none', async () => {
      const { service, rows, methodology } = makeService();
      const seed = DEFAULT_METHODOLOGIES.find(
        (m) => m.slug === 'social-story',
      )!;
      const owned = {
        name: 'Historia social propia',
        summary: 'Escrita en la administración.',
      };
      rows.set(
        'social-story',
        withDates({
          slug: 'social-story',
          texts: {
            ru: { name: 'Своё название', summary: 'Своё описание' },
            en: seed.texts.en,
            es: owned,
          },
          source: 'edited in the admin',
          published: true,
          sortOrder: 0,
        }),
      );
      await service.onModuleInit();

      expect(rows.get('social-story')).toMatchObject({
        source: 'edited in the admin',
        texts: { ru: { name: 'Своё название' }, es: owned, de: seed.texts.de },
      });
      expect(rows.get('social-story')?.texts).not.toHaveProperty('kk');
      expect(rows.get('growth-mindset')?.texts).toMatchObject({
        es: DEFAULT_METHODOLOGIES[3].texts.es,
      });

      methodology.updateMany.mockClear();
      await service.onModuleInit();
      expect(methodology.updateMany).not.toHaveBeenCalled();
      expect(
        (await service.list('de')).find((m) => m.slug === 'social-story')?.name,
      ).toBe(seed.texts.de!.name);
    });
    it('updates seed texts stored before the proofreading, unless the admin edited them', async () => {
      const { service, rows } = makeService();
      const old = SEEDED_METHOD_TEXTS_V1;
      const seed = (slug: string) =>
        DEFAULT_METHODOLOGIES.find((m) => m.slug === slug)!;
      const edited = { name: 'Өз атауы', summary: 'Әкімші жазған.' };
      for (const [slug, texts, i] of [
        [
          'toddler-routine',
          { ...seed('toddler-routine').texts, ...old['toddler-routine'] },
          0,
        ],
        [
          'sel-emotions',
          { ...seed('sel-emotions').texts, ...old['sel-emotions'], kk: edited },
          1,
        ],
      ] as const) {
        rows.set(
          slug,
          withDates({
            slug,
            texts,
            source: 'seed',
            published: true,
            sortOrder: i,
          }),
        );
      }
      await service.onModuleInit();

      expect(rows.get('toddler-routine')?.texts).toEqual(
        seed('toddler-routine').texts,
      );
      expect(rows.get('sel-emotions')?.texts).toEqual({
        ...seed('sel-emotions').texts,
        kk: edited,
      });
    });
  });

  describe('the public list', () => {
    it('shows published methods in their order, in the language asked, Russian where a text is missing', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      await service.create({
        ...calm,
        published: false,
        texts: { ...calm.texts, kk: { name: '', summary: '' } },
      });
      await service.update('growth-mindset', {
        ...DEFAULT_METHODOLOGIES.find((m) => m.slug === 'growth-mindset')!,
        format: 'picture-book',
        maxWordsPerPage: null,
        texts: {
          ...DEFAULT_METHODOLOGIES[3].texts,
          en: { name: '', summary: '' },
        },
        published: true,
        sortOrder: 0,
      });

      const en = await service.list('en');
      expect(en.map((m) => m.slug)[0]).toBe('growth-mindset');
      expect(en.find((m) => m.slug === 'calm-down')).toBeUndefined();
      expect(en[0].name).toBe('Мышление роста');
      expect(
        (await service.list('kk')).find((m) => m.slug === 'social-story')?.name,
      ).toBe('Әлеуметтік әңгіме');
    });
  });

  describe('the cache', () => {
    afterEach(() => jest.useRealTimers());

    it('reads the database once, and again after an edit', async () => {
      const { service, methodology } = makeService();
      await service.onModuleInit();
      methodology.findMany.mockClear(); // start-up reads the seed methods to fill in their texts
      await service.list();
      await service.list('kk');
      await service.forBook(undefined, 5);
      expect(methodology.findMany).toHaveBeenCalledTimes(1);

      await service.create(calm);
      expect((await service.list()).map((m) => m.slug)).toContain('calm-down');
      expect(methodology.findMany).toHaveBeenCalledTimes(2);

      await service.update('calm-down', { ...calm, published: false });
      expect((await service.list()).map((m) => m.slug)).not.toContain(
        'calm-down',
      );
      await service.remove('calm-down');
      await service.list();
      expect(methodology.findMany).toHaveBeenCalledTimes(4);
    });

    it('expires on its own, for changes made outside the admin', async () => {
      jest.useFakeTimers({ now: 0 });
      const { service, methodology } = makeService();
      await service.list();
      jest.setSystemTime(CACHE_MS + 1);
      await service.list();
      expect(methodology.findMany).toHaveBeenCalledTimes(2);
    });

    it('does not keep a failed read', async () => {
      const { service, methodology } = makeService();
      methodology.findMany.mockRejectedValueOnce(new Error('db down'));
      await expect(service.list()).rejects.toThrow('db down');
      await expect(service.list()).resolves.toEqual([]);
    });
  });

  describe('the admin', () => {
    it('says how many catalog books and books follow each method', async () => {
      const { service } = makeService({
        templates: { 'social-story': 2 },
        books: { 'social-story': 5 },
      });
      await service.onModuleInit();
      const list = await service.adminList();
      expect(list.find((m) => m.slug === 'social-story')).toMatchObject({
        templates: 2,
        books: 5,
        published: true,
      });
      expect(list.find((m) => m.slug === 'adventure-quest')).toMatchObject({
        templates: 0,
        books: 0,
      });
    });

    it('refuses a slug that is taken', async () => {
      const { service } = makeService();
      await service.create(calm);
      await expect(service.create(calm)).rejects.toMatchObject({
        status: 409,
        response: { code: 'methodology_exists' },
      });
    });

    it('refuses to delete a method in use and offers to unpublish it instead', async () => {
      const { service, rows } = makeService({
        templates: { 'calm-down': 1 },
        books: { 'calm-down': 3 },
      });
      await service.create(calm);
      const refusal = service.remove('calm-down');
      await expect(refusal).rejects.toMatchObject({
        status: 409,
        response: { code: 'methodology_in_use', templates: 1, books: 3 },
      });
      await expect(refusal).rejects.toThrow('Снимите её с публикации');
      expect(rows.has('calm-down')).toBe(true);
    });

    it('deletes a method nothing follows', async () => {
      const { service, rows } = makeService({ books: { 'social-story': 1 } });
      await service.create(calm);
      await service.remove('calm-down');
      expect(rows.has('calm-down')).toBe(false);
      await expect(service.remove('calm-down')).rejects.toThrow('нет');
    });

    it('previews the method part of the prompt for a child in the middle of its ages', () => {
      const { service } = makeService();
      const { age, prompt } = service.preview({ ...calm, slug: '' });
      expect(age).toBe(6);
      expect(prompt).toContain(
        'Story method: new-method (Mindfulness for children)',
      );
      expect(prompt).toContain('- The hero is upset.');
      expect(prompt).toContain('at most 60 words');
    });
  });

  describe('a book', () => {
    it('follows a catalog book method even when it is unpublished', async () => {
      const { service } = makeService();
      await service.create({ ...calm, published: false });
      await expect(service.forTemplate('calm-down')).resolves.toMatchObject({
        slug: 'calm-down',
      });
      await expect(service.forBook('calm-down', 6)).rejects.toMatchObject({
        response: { code: 'methodology_unknown' },
      });
      await expect(service.forTemplate('gone')).rejects.toMatchObject({
        response: { code: 'methodology_unknown' },
      });
    });

    it('picks a method by age from the published ones', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      expect((await service.forBook(undefined, 2)).slug).toBe(
        'toddler-routine',
      );
      expect((await service.forBook(undefined, 10)).slug).toBe(
        'adventure-quest',
      );
      await service.update('adventure-quest', {
        ...DEFAULT_METHODOLOGIES[5],
        format: 'picture-book',
        maxWordsPerPage: null,
        published: false,
        sortOrder: 50,
      });
      expect((await service.forBook(undefined, 10)).slug).toBe('sel-emotions');
    });
  });
});
