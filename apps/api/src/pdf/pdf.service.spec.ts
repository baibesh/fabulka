import { newLayout, type RenderableBook } from '@fabulka/shared';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NO_JOURNAL, type JournalService } from '../journal/journal.service';
import type { StorageService } from '../storage/storage.service';
import { PdfService, demote, verdict } from './pdf.service';

/** A pastel picture with a white blob in the middle, like the mock model draws. */
const picture = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><rect width="768" height="768" fill="${color}"/><circle cx="384" cy="330" r="120" fill="#fff"/></svg>`;

const book = (text: (n: number) => string): RenderableBook => ({
  title: 'Айгерим және жұлдызды сапар',
  childName: 'Айгерим',
  language: 'kk',
  heroImage: 'hero.svg',
  pages: [1, 2, 3].map((n) => ({
    page: n,
    text: text(n),
    image: `page-${n}.svg`,
  })),
  talkQuestions: ['Кітапта не болды?', 'Сен не істер едің?'],
});

describe('PdfService (Chromium)', () => {
  jest.setTimeout(60_000);
  let root: string;
  let pdf: PdfService;
  const calls: string[] = [];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'fabulka-pdf-'));
    await mkdir(join(root, 'books/b'), { recursive: true });
    for (const [name, color] of [
      ['hero', '#ffffff'],
      ['page-1', '#F9D9A8'],
      ['page-2', '#BFE3D0'],
      ['page-3', '#C9D7F2'],
    ])
      await writeFile(join(root, `books/b/${name}.svg`), picture(color));
    const storage = {
      root,
      save: async (path: string, data: Buffer) => {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), data);
        return path;
      },
    } as unknown as StorageService;
    const journal = {
      start: (call: Parameters<JournalService['start']>[0]) => {
        const timer = NO_JOURNAL.start(call);
        return Object.assign(timer, {
          ok: () => calls.push(`${call.kind}:ok`),
          fail: () => calls.push(`${call.kind}:error`),
        });
      },
    } as unknown as JournalService;
    pdf = new PdfService(storage, journal);
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it('prints a book whose text fits, with nothing to fix', async () => {
    const result = await pdf.render(
      'b',
      book((n) => `${n}-бет. Айгерим Алматыда жаңа шытырман оқиғаны бастайды.`),
      newLayout('fairy'),
    );
    const file = await readFile(join(root, result.pdfPath));
    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.layout.qa).toMatchObject({ status: 'ok', issues: [] });
    expect(result.layout.fits).toEqual({});
    expect(calls.at(-1)).toBe('render:ok');
  });

  it('shrinks text a little too long for its box', async () => {
    const words =
      'Айгерим жұлдыздарға қарап, жаңа досымен бірге ұзақ сапарға шықты.';
    const result = await pdf.render(
      'b',
      book((n) => (n === 2 ? Array(7).fill(words).join(' ') : 'Қысқа.')),
      newLayout('fairy'),
    );
    expect(result.layout.qa.status).toBe('shrunk');
    expect(result.layout.fits['story-2']).toBeLessThan(1);
    expect(result.layout.fits['story-2']).toBeGreaterThanOrEqual(0.8);
  });

  it('tries the next layouts, then blocks printing when the text never fits', async () => {
    const long = Array.from(
      { length: 60 },
      () => 'Айгерим жұлдыздарға қарап, жаңа досымен бірге сапарға шықты.',
    ).join(' ');
    const result = await pdf.render(
      'b',
      book((n) => (n === 1 ? long : 'Қысқа.')),
      newLayout('fairy'),
    );
    expect(result.layout.qa.status).toBe('blocked');
    expect(result.layout.qa.issues).toContainEqual(
      expect.objectContaining({ kind: 'overflow' }),
    );
    expect(result.layout.pages['1'].tooFull.length).toBeGreaterThan(0);
    expect(calls.at(-1)).toBe('render:error');
  });

  it('catches a letter none of the book fonts has', async () => {
    const result = await pdf.render(
      'b',
      book((n) => (n === 3 ? 'Айгерим 🦄 жұлдызды көрді.' : 'Қысқа.')),
      newLayout('fairy'),
    );
    expect(result.layout.qa.status).toBe('blocked');
    expect(result.layout.qa.issues).toContainEqual(
      expect.objectContaining({ page: 'story-3', kind: 'fallback-font' }),
    );
  });
});

describe('render QA verdict', () => {
  it('is ok, shrunk or blocked', () => {
    expect(verdict({ fits: {}, overflow: [], fallback: [] }).status).toBe('ok');
    expect(
      verdict({ fits: { talk: 0.9 }, overflow: [], fallback: [] }).status,
    ).toBe('shrunk');
    expect(
      verdict({
        fits: {},
        overflow: [],
        fallback: [{ page: 'cover', detail: 'x' }],
      }).status,
    ).toBe('blocked');
  });

  it('never demotes a page staff pinned', () => {
    const layout = newLayout('fairy');
    layout.pages['1'] = {
      ...layout.pages['1'],
      ...{
        options: [],
        pin: 'overlay-top',
        choice: null,
        tooFull: [],
        focus: { x: 0.5, y: 0.5 },
        ink: {},
        plateBand: 'bottom',
        spreadSide: 'right',
      },
    };
    const pages = [
      {
        key: 'story-1',
        kind: 'story' as const,
        index: 2,
        side: 'right' as const,
        story: 1,
        part: 0 as const,
        variant: 'overlay-top' as const,
        html: '',
      },
    ];
    expect(demote(layout, pages, [{ page: 'story-1', detail: '' }])).toBeNull();
    layout.pages['1'].pin = null;
    expect(
      demote(layout, pages, [{ page: 'story-1', detail: '' }])!.pages['1']
        .tooFull,
    ).toEqual(['overlay-top']);
  });
});
