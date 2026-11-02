import type { ConfigService } from '@nestjs/config';
import { EMPTY_SEO_FIELDS, type SeoFields } from '@fabulka/shared';
import type { ExamplesService } from '../examples/examples.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { SeoWebService } from './seo-web.service';
import {
  SeoService,
  revertedFields,
  splitTarget,
  storedFields,
} from './seo.service';

const fields = (patch: Partial<SeoFields>): SeoFields => ({
  ...EMPTY_SEO_FIELDS,
  ...patch,
});

interface Row {
  page: string;
  language: string;
  draft: unknown;
  published: unknown;
  publishedAt: Date | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A Prisma stand-in with the PageSeo and SeoHistory tables in memory. */
function setup() {
  const rows: Row[] = [];
  const history: {
    id: string;
    kind: string;
    target: string;
    action: string;
    before: unknown;
    after: unknown;
    who: string | null;
    createdAt: Date;
  }[] = [];
  const find = (where: { page_language: { page: string; language: string } }) =>
    rows.find(
      (r) =>
        r.page === where.page_language.page &&
        r.language === where.page_language.language,
    );
  // Prisma.DbNull reads back as null.
  const value = (v: unknown) =>
    v && typeof v === 'object' && !('title' in v) && !Array.isArray(v)
      ? null
      : v;
  const prisma = {
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    bookTemplate: {
      findMany: jest.fn().mockResolvedValue([
        {
          slug: 'bath-time',
          title: 'Купание',
          summary: 'О ванне',
          translations: { de: { title: 'Baden', summary: 'Über das Bad' } },
          coverUrl: '/catalog/bath-time.jpg',
        },
      ]),
    },
    book: { findMany: jest.fn().mockResolvedValue([]) },
    pageSeo: {
      findMany: jest.fn(({ where }: { where: Partial<Row> }) =>
        Promise.resolve(
          rows.filter(
            (r) =>
              (!where.language || r.language === where.language) &&
              (!where.page || r.page === where.page),
          ),
        ),
      ),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { page_language: { page: string; language: string } };
          create: Pick<Row, 'page' | 'language' | 'draft' | 'updatedBy'>;
          update: Partial<Row>;
        }) => {
          const row = find(where);
          if (row) Object.assign(row, update, { updatedAt: new Date() });
          else
            rows.push({
              published: null,
              publishedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...create,
            });
          return Promise.resolve();
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { page_language: { page: string; language: string } };
          data: Partial<Row>;
        }) => {
          Object.assign(find(where)!, {
            ...data,
            published: value(data.published),
          });
          return Promise.resolve();
        },
      ),
    },
    seoHistory: {
      create: jest.fn(({ data }: { data: (typeof history)[number] }) => {
        history.unshift({
          ...data,
          before: value(data.before),
          after: value(data.after),
          id: `h${history.length + 1}`,
          createdAt: new Date(),
        });
        return Promise.resolve();
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(history.find((h) => h.id === where.id) ?? null),
      ),
    },
  };
  const web = {
    revalidate: jest.fn().mockResolvedValue(true),
    pingIndexNow: jest.fn().mockResolvedValue('sent'),
    urls: (paths: string[]) => paths.map((p) => `https://fabulka.com${p}`),
    urlsIn: (pages: { path: string }[]) =>
      pages.map((p) => `https://fabulka.com${p.path}`),
  };
  const examples = { publicVersions: jest.fn().mockResolvedValue([]) };
  const storage = { url: (p: string | null) => (p ? `/files/${p}` : null) };
  const service = new SeoService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    web as unknown as SeoWebService,
    examples as unknown as ExamplesService,
    {
      get: (_: string, fallback: string) => fallback,
    } as unknown as ConfigService,
  );
  return { service, history, web };
}

describe('revertedFields', () => {
  it('puts back the values from before the change, or the defaults', () => {
    expect(revertedFields({ before: fields({ title: 'Old' }) })).toEqual(
      fields({ title: 'Old' }),
    );
    expect(revertedFields({ before: null })).toEqual(EMPTY_SEO_FIELDS);
    expect(storedFields({ broken: true })).toEqual(EMPTY_SEO_FIELDS);
  });

  it('splits a history target into the page and its language', () => {
    expect(splitTarget('template:bath-time@de')).toEqual({
      key: 'template:bath-time',
      language: 'de',
    });
    expect(splitTarget('catalog@xx')).toBeNull();
    expect(splitTarget('settings')).toBeNull();
  });
});

describe('SeoService', () => {
  it('lists catalog books with their title in the language', async () => {
    const { service } = setup();
    const pages = await service.pages('de');
    const template = pages.find((p) => p.key === 'template:bath-time');
    expect(template).toMatchObject({
      label: 'Baden',
      summary: 'Über das Bad',
      path: '/catalog/bath-time',
      pending: false,
      published: null,
    });
    expect(pages.map((p) => p.key).slice(0, 5)).toEqual([
      'home',
      'catalog',
      'create',
      'privacy',
      'terms',
    ]);
  });

  it('keeps a save as a draft until it is published', async () => {
    const { service, web } = setup();
    await service.save('catalog', 'de', fields({ title: 'Neu' }), 'seo@x.kz');
    expect(await service.publicPages('de')).toEqual({});
    const page = await service.page('catalog', 'de');
    expect(page).toMatchObject({ pending: true, updatedBy: 'seo@x.kz' });

    const result = await service.publish(
      { key: 'catalog', language: 'de' },
      'seo@x.kz',
    );
    expect(result).toMatchObject({
      published: 1,
      revalidated: true,
      indexNow: 'sent',
    });
    expect(web.revalidate).toHaveBeenCalledWith(['seo']);
    expect(web.pingIndexNow).toHaveBeenCalledWith([
      'https://fabulka.com/catalog',
    ]);
    expect((await service.publicPages('de')).catalog).toEqual({
      title: 'Neu',
      description: null,
      ogImageUrl: null,
      noindex: false,
    });
    expect((await service.page('catalog', 'de')).pending).toBe(false);
  });

  it('reverts a change into the draft and records the revert', async () => {
    const { service, history } = setup();
    await service.save('catalog', 'de', fields({ title: 'Eins' }), 'a');
    await service.save('catalog', 'de', fields({ title: 'Zwei' }), 'a');
    const second = history[0];
    expect(second).toMatchObject({ action: 'save', target: 'catalog@de' });

    const reverted = await service.revert(second.id, 'b');
    expect(reverted.draft.title).toBe('Eins');
    expect(history[0]).toMatchObject({
      action: 'revert',
      who: 'b',
      before: fields({ title: 'Zwei' }),
      after: fields({ title: 'Eins' }),
    });

    // Reverting the very first save goes back to the defaults.
    const first = history.find(
      (h) =>
        h.after &&
        (h.after as SeoFields).title === 'Eins' &&
        h.action === 'save',
    )!;
    expect((await service.revert(first.id, 'b')).draft).toEqual(
      EMPTY_SEO_FIELDS,
    );
  });

  it('refuses to save a page that does not exist', async () => {
    const { service } = setup();
    await expect(
      service.save('template:nope', 'de', EMPTY_SEO_FIELDS, null),
    ).rejects.toThrow('No such page');
  });
});
