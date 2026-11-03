import {
  BOOK_FORMATS,
  blankPage,
  newLayout,
  printPageSize,
  coverWrap,
  interiorPages,
  planBook,
  wrapSheetSize,
  withFormat,
  type RenderableBook,
} from '@fabulka/shared';
import { PDFDocument } from 'pdf-lib';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NO_JOURNAL, type JournalService } from '../journal/journal.service';
import type { StorageService } from '../storage/storage.service';
import { MOCK_SUBJECT } from '../meta/mock.gateway';
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

  it("prints the photo page with the parent's photo in its frame", async () => {
    await writeFile(
      join(root, 'books/b/photo-1.jpg'),
      await readFile(join(__dirname, '../photos/fixtures/child-gps.jpg')),
    );
    const base = newLayout('little', 3);
    const layout = {
      ...base,
      blocks: [
        ...base.blocks.slice(0, -1),
        { kind: 'photo' as const, movable: true, optional: true },
        base.blocks.at(-1)!,
      ],
      photo: {
        path: 'books/b/photo-1.jpg',
        caption: 'Айгерим, 3 жас',
        aspect: 4 / 3,
      },
    };
    const result = await pdf.render(
      'b',
      book(() => 'Қысқа.'),
      layout,
    );
    expect(result.layout.qa).toMatchObject({ status: 'ok', issues: [] });
    const html = await readFile(join(root, 'books/b/book.html'), 'utf8');
    expect(html).toContain('data-key="photo"');
    // The only JPEG in the book (the pictures are SVG) is embedded as one.
    const file = await readFile(join(root, result.pdfPath));
    expect(file.toString('latin1')).toContain('/DCTDecode');
  });

  it('prints the cover wrap, then the pages between the covers with bleed and crop marks', async () => {
    const layout = withFormat(newLayout('fairy'), BOOK_FORMATS['a5-portrait']);
    const story = book((n) => `${n}-бет. Айгерим Алматыда.`);
    const path = await pdf.renderPrint(
      'b',
      story,
      layout,
      'orders/o1/print.pdf',
      'Fabulka · o1',
      'hard',
    );
    const file = await readFile(join(root, path));
    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    const pt = (mm: number) => (mm / 25.4) * 72;
    const doc = await PDFDocument.load(file);
    const inside = interiorPages(planBook(story, layout)).length;
    expect(inside % 4).toBe(0);
    expect(doc.getPageCount()).toBe(inside + 1);
    // The first sheet is the hardcover wrap: two boards, two hinges and the spine, turned in round it.
    const wrap = coverWrap(layout.format, inside, 'hard');
    const [first, ...pages] = doc.getPages();
    const sheet = wrapSheetSize(wrap);
    expect(first.getMediaBox().width).toBeCloseTo(pt(sheet.widthMm), 0);
    expect(first.getMediaBox().height).toBeCloseTo(pt(sheet.heightMm), 0);
    expect(first.getTrimBox().width).toBeCloseTo(pt(wrap.widthMm), 1);
    expect(first.getBleedBox().width).toBeCloseTo(pt(wrap.widthMm + 30), 1);
    const html = await readFile(join(root, 'books/b/print.html'), 'utf8');
    expect(html).toContain('data-testid="spine-text"');
    // Points: (148 + 2 × (3 + 10)) mm × (210 + 2 × (3 + 10)) mm.
    const size = printPageSize(layout.format);
    expect(pages[0].getMediaBox().width).toBeCloseTo(pt(size.widthMm), 0);
    expect(pages[0].getMediaBox().height).toBeCloseTo(pt(size.heightMm), 0);
    // The trim and the bleed are marked for the print shop's preflight on every page.
    for (const page of pages) {
      const trim = page.getTrimBox();
      const bleed = page.getBleedBox();
      expect(trim.width).toBeCloseTo(pt(148), 1);
      expect(trim.height).toBeCloseTo(pt(210), 1);
      expect(trim.x).toBeCloseTo(pt(13), 1);
      expect(bleed.width).toBeCloseTo(pt(154), 1);
      expect(page.getMediaBox().height - (trim.y + trim.height)).toBeCloseTo(
        pt(13),
        1,
      );
    }
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

  it("keys out an ornament's white background and trims it to the motif", async () => {
    // Like Muse Image draws it: a small motif in the middle of a big white square.
    const drawn = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#fff"/><circle cx="200" cy="200" r="50" fill="#e0a020"/></svg>`,
    );
    const png = await pdf.cleanOrnament(drawn, 'svg');
    expect(png).not.toBeNull();
    // PNG header: width and height big-endian at bytes 16 and 20; the 100 px disc plus a little.
    expect(png!.readUInt32BE(16)).toBeLessThan(120);
    expect(png!.readUInt32BE(20)).toBeLessThan(120);
    const blank = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#fff"/></svg>`,
    );
    expect(await pdf.cleanOrnament(blank, 'svg')).toBeNull();
  });
});

describe('PdfService (Chromium), choosing layouts from the pictures', () => {
  jest.setTimeout(60_000);
  let root: string;
  let pdf: PdfService;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'fabulka-pdf-'));
    await mkdir(join(root, 'books/c'), { recursive: true });
    for (const n of [1, 2, 3])
      await writeFile(join(root, `books/c/page-${n}.svg`), picture('#F9D9A8'));
    await writeFile(join(root, 'books/c/hero.svg'), picture('#ffffff'));
    const storage = {
      root,
      save: async (path: string, data: Buffer) => {
        await writeFile(join(root, path), data);
        return path;
      },
    } as unknown as StorageService;
    pdf = new PdfService(storage, NO_JOURNAL as unknown as JournalService);
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it('measures each picture once and keeps text clear of the hero', async () => {
    const short = book(() => 'Айгерим жұлдыздарды көрді.');
    const result = await pdf.render('c', short, newLayout('fairy'), [
      { page: 1, subject: MOCK_SUBJECT, tone: null },
      { page: 2, subject: null, tone: null },
      { page: 3, subject: MOCK_SUBJECT, tone: null },
    ]);
    // The pastel picture is light: dark text on its calm bottom third.
    expect(result.tones[1]?.aspect).toBe(1);
    expect(result.tones[1]!.lum[0]).toBeGreaterThan(180);
    expect(result.layout.pages['1'].options[0]).toBe('overlay-bottom');
    expect(result.layout.pages['1'].ink['overlay-bottom']).toBe('dark');
    // Where SAM failed nobody knows where the hero is: the text goes on its own page (story 2
    // starts on a left page), else on a plate.
    expect(result.layout.pages['2'].options).toEqual(['facing', 'plate']);
    const html = await readFile(join(root, 'books/c/book.html'), 'utf8');
    expect(html).toContain('data-key="story-1" data-variant="overlay-bottom"');
    expect(html).toContain('data-key="story-2" data-variant="facing"');
  });

  it("lays out a page whose picture was refused as a vignette page with the hero's sheet", async () => {
    const short = book(() => 'Айгерим жұлдыздарды көрді.');
    const refused: RenderableBook = {
      ...short,
      pages: short.pages.map((p) => (p.page === 2 ? { ...p, image: null } : p)),
    };
    // Staff once pinned a picture layout on that page: it cannot hold without a picture.
    const base = newLayout('fairy');
    const result = await pdf.render(
      'c',
      refused,
      {
        ...base,
        pages: { '2': { ...blankPage(), pin: 'overlay-top' } },
      },
      [
        { page: 1, subject: MOCK_SUBJECT, tone: null },
        { page: 2, subject: null, tone: null },
        { page: 3, subject: MOCK_SUBJECT, tone: null },
      ],
    );
    expect(result.layout.pages['2']).toMatchObject({
      noArt: true,
      options: ['plate'],
    });
    expect(result.layout.pages['1'].noArt).toBe(false);
    // Printable, with a note for staff.
    expect(result.layout.qa.status).toBe('ok');
    expect(result.layout.qa.notes).toContainEqual(
      expect.objectContaining({ page: 'story-2', kind: 'no-art' }),
    );
    const html = await readFile(join(root, 'books/c/book.html'), 'utf8');
    const page2 = /<section[^>]*data-key="story-2"[\s\S]*?<\/section>/.exec(
      html,
    )![0];
    expect(page2).toContain('fb-no-art');
    expect(page2).toContain('data-variant="plate"');
    expect(page2).toContain('class="fb-vignette" src="hero.svg"');
    expect(page2).not.toContain('fb-empty');
  });

  it('keeps line breaks in page text, and render QA measures them', async () => {
    const lines = Array.from({ length: 14 }, (_, i) => `Жол ${i + 1}.`);
    const flat = await pdf.render(
      'c',
      book((n) => (n === 1 ? lines.join(' ') : 'Қысқа.')),
      newLayout('fairy'),
    );
    expect(flat.layout.fits['story-1']).toBeUndefined();
    const broken = await pdf.render(
      'c',
      book((n) => (n === 1 ? lines.join('\n') : 'Қысқа.')),
      newLayout('fairy'),
    );
    // Fourteen short lines take far more room than one short paragraph.
    expect(
      broken.layout.fits['story-1'] ??
        (broken.layout.qa.status === 'blocked' ? 0 : 1),
    ).toBeLessThan(1);
    const html = await readFile(join(root, 'books/c/book.html'), 'utf8');
    expect(html).toContain('Жол 1.\nЖол 2.');
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
