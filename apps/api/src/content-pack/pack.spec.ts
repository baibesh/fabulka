import { Prisma } from '@prisma/client';
import type { LandingImage, LandingOverrides } from '@fabulka/shared';
import { TRANSLATION_CLIENT_KEY } from '../examples/translation';
import { bookData } from './import';
import { bookRow } from './export';
import {
  CONTENT_CLIENT_KEY,
  PackSchema,
  hiddenRule,
  mergeLanding,
  newOrder,
  packProblems,
  safeStoragePath,
  targetProblems,
  type Pack,
} from './pack';

const SHA = 'a'.repeat(64);
const file = (path: string) => ({ path, bytes: 1, sha256: SHA });
const image = (country: string, slot: string, hex: string): LandingImage => ({
  path: `landing/${country}/${slot}-${hex}`,
  widths: [384, 640],
});

/** A small pack that holds together: one German book, its sample, an example and a landing. */
function pack(over: Partial<Pack> = {}): Pack {
  const id = 'book0000000001';
  return PackSchema.parse({
    version: 1,
    createdAt: '2026-11-04T00:00:00.000Z',
    books: [
      {
        id,
        template: 'not-yet',
        row: {
          status: 'done',
          language: 'de',
          heroImagePath: `books/${id}/hero.jpeg`,
          pages: [{ page: 1, imagePath: `books/${id}/page-1.jpeg` }],
          layout: null,
        },
      },
    ],
    samples: [{ template: 'not-yet', language: 'de', country: 'DE', book: id }],
    examples: [
      {
        id: 'example0000001',
        countries: ['DE'],
        mode: 'include',
        versions: [{ language: 'de', book: id }],
      },
    ],
    landing: [
      {
        country: 'DE',
        hero: { de: { title: 'Dein Kind im eigenen Bilderbuch' } },
        images: {
          hero: {
            all: {
              ...image('DE', 'hero', 'abcdef0123456789'),
              book: { id, picture: 'cover' },
            },
          },
        },
      },
    ],
    hideGlobalExamplesIn: ['DE'],
    files: [
      file(`books/${id}/hero.jpeg`),
      file(`books/${id}/page-1.jpeg`),
      file('landing/DE/hero-abcdef0123456789-384.webp'),
      file('landing/DE/hero-abcdef0123456789-640.webp'),
    ],
    ...over,
  });
}

describe('safeStoragePath', () => {
  it('takes book and landing files only, never a way out of storage', () => {
    expect(safeStoragePath('books/book0000000001/page-1.jpeg')).toBe(true);
    expect(safeStoragePath('books/book0000000001/sub/x.png')).toBe(true);
    expect(safeStoragePath('landing/DE/hero-abc-384.webp')).toBe(true);
    expect(safeStoragePath('books/book0000000001/../../etc/passwd')).toBe(
      false,
    );
    expect(safeStoragePath('books/../x/y')).toBe(false);
    expect(safeStoragePath('uploads/toys/x.jpg')).toBe(false);
    expect(safeStoragePath('landing/de/hero.webp')).toBe(false);
    expect(safeStoragePath('books/book0000000001')).toBe(false);
  });
});

describe('packProblems', () => {
  it('finds nothing in a pack that holds together', () => {
    expect(packProblems(pack())).toEqual([]);
  });

  it('finds samples, versions and pictures that point outside the pack or do not match', () => {
    const p = pack();
    p.samples.push({
      template: 'bath-time',
      language: 'de',
      country: 'AT',
      book: 'book0000000002',
    });
    p.samples.push({
      template: 'not-yet',
      language: 'es',
      country: 'ES',
      book: 'book0000000001',
    });
    p.examples[0].versions.push({ language: 'en', book: 'book0000000001' });
    p.files = p.files.filter(
      (f) => !f.path.endsWith('-640.webp') && !f.path.endsWith('page-1.jpeg'),
    );
    const problems = packProblems(p).join('\n');
    expect(problems).toContain(
      'sample bath-time/de/AT: book book0000000002 is not in the pack',
    );
    expect(problems).toContain(
      'sample not-yet/es/ES: book book0000000001 is in de',
    );
    expect(problems).toContain(
      'example example0000001: book book0000000001 is not in en',
    );
    expect(problems).toContain('a book is the sample of two catalog books');
    expect(problems).toContain(
      'landing/DE/hero-abcdef0123456789-640.webp is not in the pack',
    );
    expect(problems).toContain(
      'books/book0000000001/page-1.jpeg is not in the pack',
    );
  });

  it('refuses an unfinished book', () => {
    const p = pack();
    p.books[0].row.status = 'pages';
    expect(packProblems(p)).toContain('book book0000000001 is not finished');
  });
});

describe('targetProblems', () => {
  const target = {
    templates: new Set(['not-yet']),
    offered: new Set(['DE', 'KZ']),
    books: new Map<string, string>(),
  };

  it('fits a database with the catalog book and the countries', () => {
    expect(targetProblems(pack(), target)).toEqual([]);
  });

  it('refuses a missing catalog book, a country the site does not offer and a visitor’s book', () => {
    const p = pack({ hideGlobalExamplesIn: ['FR'] });
    p.books[0].template = 'bath-time';
    const problems = targetProblems(p, {
      ...target,
      books: new Map([['book0000000001', 'visitor-key']]),
    });
    expect(problems).toEqual([
      'book book0000000001: no catalog book bath-time',
      'book book0000000001 is there already and is not staff content',
      'the site does not offer FR',
    ]);
  });

  it('lets an import update its own books again', () => {
    for (const key of [CONTENT_CLIENT_KEY, TRANSLATION_CLIENT_KEY])
      expect(
        targetProblems(pack(), {
          ...target,
          books: new Map([['book0000000001', key]]),
        }),
      ).toEqual([]);
  });
});

describe('hiddenRule', () => {
  const everywhere = { mode: 'include' as const, countries: [] };

  it('hides an everywhere example in each country, as a country manager would', () => {
    expect(hiddenRule(everywhere, null, ['DE', 'ES'])).toEqual({
      mode: 'exclude',
      countries: ['DE', 'ES'],
    });
  });

  it('adds to an exclude list and leaves one already hidden there as it is', () => {
    const own = { mode: 'exclude' as const, countries: ['DE'] };
    expect(hiddenRule(own, null, ['DE', 'AT'])).toEqual({
      mode: 'exclude',
      countries: ['DE', 'AT'],
    });
    expect(hiddenRule(own, null, ['DE'])).toBe('unchanged');
  });

  it('follows the catalog book when the example has no countries of its own', () => {
    const kz = { mode: 'include' as const, countries: ['KZ'] };
    expect(hiddenRule(everywhere, kz, ['DE'])).toBe('unchanged');
    const two = { mode: 'include' as const, countries: ['KZ', 'DE'] };
    expect(hiddenRule(everywhere, two, ['DE'])).toEqual({
      mode: 'include',
      countries: ['KZ'],
    });
  });

  it('never empties an include list, which would mean everywhere', () => {
    expect(
      hiddenRule({ mode: 'include', countries: ['DE'] }, null, ['DE']),
    ).toBe('stuck');
  });
});

describe('mergeLanding', () => {
  const current: LandingOverrides = {
    DE: {
      hero: { de: { title: 'Alt', lead: 'Bleibt' } },
      faqHidden: ['shipping'],
      faq: [],
      hiddenSections: ['methods'],
      images: { toyPhoto: { de: image('DE', 'toyPhoto', '1111111111111111') } },
    },
    KZ: {
      hero: { ru: { title: 'Казахстан' } },
      faqHidden: [],
      faq: [],
      hiddenSections: [],
    },
  };

  it('sets the titles and pictures, keeps the lead, the FAQ, the sections and other countries', () => {
    const photo = image('DE', 'toyPhoto', '2222222222222222');
    const { next, replaced, changed } = mergeLanding(current, [
      {
        country: 'DE',
        hero: { de: { title: 'Neu' } },
        images: { toyPhoto: { de: photo } },
      },
      { country: 'AT', hero: { de: { title: 'Servus' } }, images: {} },
    ]);
    expect(next.DE.hero.de).toEqual({ title: 'Neu', lead: 'Bleibt' });
    expect(next.DE.faqHidden).toEqual(['shipping']);
    expect(next.DE.hiddenSections).toEqual(['methods']);
    expect(next.DE.images?.toyPhoto?.de).toEqual(photo);
    expect(next.AT.hero.de?.title).toBe('Servus');
    expect(next.KZ).toEqual(current.KZ);
    expect(replaced).toEqual([current.DE.images!.toyPhoto!.de]);
    expect(changed).toEqual(['DE hero de', 'DE toyPhoto de', 'AT hero de']);
  });

  it('changes nothing the second time', () => {
    const landing = [
      { country: 'DE', hero: { de: { title: 'Neu' } }, images: {} },
    ];
    const once = mergeLanding(current, landing).next;
    expect(mergeLanding(once, landing).changed).toEqual([]);
  });
});

describe('newOrder', () => {
  it('puts new examples before every example there, in the pack’s order', () => {
    expect(newOrder(0, 3)).toEqual([-3, -2, -1]);
    expect(newOrder(-5, 2)).toEqual([-7, -6]);
    expect(newOrder(null, 2)).toEqual([0, 1]);
  });
});

describe('book rows', () => {
  it('keeps the columns, dates as text and a staff key; writes the catalog book by slug', () => {
    const row = bookRow({
      id: 'book0000000001',
      templateId: 'local-template-id',
      userId: 'someone',
      clientKey: 'content-de',
      status: 'done',
      language: 'de',
      layout: null,
      createdAt: new Date('2026-11-04T00:00:00Z'),
    });
    expect(row).toMatchObject({
      clientKey: CONTENT_CLIENT_KEY,
      status: 'done',
      createdAt: '2026-11-04T00:00:00.000Z',
    });
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('templateId');
    expect(row).not.toHaveProperty('userId');
    expect(bookRow({ clientKey: TRANSLATION_CLIENT_KEY }).clientKey).toBe(
      TRANSLATION_CLIENT_KEY,
    );

    const data = bookData(
      { id: 'book0000000001', template: 'not-yet', row },
      new Map([['not-yet', 'prod-template-id']]),
    ) as unknown as Record<string, unknown>;
    expect(data.templateId).toBe('prod-template-id');
    expect(data.userId).toBeNull();
    expect(data.layout).toBe(Prisma.DbNull);
    expect(data.language).toBe('de');
  });
});
