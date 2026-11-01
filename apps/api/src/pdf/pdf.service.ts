import { Global, Injectable, Logger, Module } from '@nestjs/common';
import {
  GRID,
  blankPage,
  bookDocument,
  chooseLayout,
  countWords,
  cropNote,
  printDocument,
  printPageSize,
  type PageSubject,
  type PageTone,
  renderBook,
  type BookLayout,
  type LayoutQa,
  type RenderIssue,
  type RenderableBook,
  type RenderedPage,
} from '@fabulka/shared';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import { JournalService } from '../journal/journal.service';
import { bookFontCss } from '../layout/fonts';
import { hyphenatorFor } from '../layout/hyphenate';
import { StorageService } from '../storage/storage.service';

/** Renders with each page's text made to fit; story pages that still overflow try another layout. */
const ROUNDS = 3;
/** Each shrink step takes this much off the body size. */
const SHRINK_STEP = 0.025;

/** What render QA measured in the page. */
export interface PageCheck {
  /** Shrink factors below 1, by page key. */
  fits: Record<string, number>;
  /** Pages whose text still overflows at the theme's smallest size. */
  overflow: { page: string; detail: string }[];
  /** Pages where some text was drawn with a font the book does not embed. */
  fallback: { page: string; detail: string }[];
}

export interface RenderResult {
  pdfPath: string;
  layout: BookLayout;
  /** Each story page's tone, measured now or passed in: the caller keeps them for next time. */
  tones: Record<number, PageTone | null>;
}

/** What is known of a story page's picture: SAM's mask (null: SAM failed) and its tone, if measured. */
export interface PagePicture {
  page: number;
  subject: PageSubject | null;
  tone: PageTone | null;
}

const MIME: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Prints a book to PDF with headless Chromium (Playwright is a renderer here, not a test runner),
 * from the same HTML pages the site shows, and checks the result: text that overflows its box is
 * shrunk within the theme's limit, a story page that still overflows gets the next layout, and
 * text drawn in a system font (a letter none of the book's fonts has) is caught. What cannot be
 * fixed blocks printing and goes into the journal.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly fontCss = bookFontCss();

  constructor(
    private readonly storage: StorageService,
    private readonly journal: JournalService,
  ) {}

  /**
   * Writes book.html and book.pdf next to the book's images (`book` names them by file name). With
   * `pictures`, each story page's layout is first chosen from its picture (chooseLayout).
   */
  async render(
    bookId: string,
    book: RenderableBook,
    layout: BookLayout,
    pictures: PagePicture[] = [],
  ): Promise<RenderResult> {
    const call = this.journal.start({ kind: 'render', model: 'chromium' });
    const hyphenate = hyphenatorFor(book.language);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const folder = join(this.storage.root, 'books', bookId);
      const tones = await measureTones(page, folder, book, pictures);
      let current: BookLayout = { ...layout, fits: {} };
      const notes: LayoutQa['notes'] = [];
      if (pictures.length) {
        const analyses = pictures.map((p) => ({
          page: p.page,
          subject: p.subject,
          tone: tones[p.page],
          words: countWords(
            book.pages.find((b) => b.page === p.page)?.text ?? '',
          ),
        }));
        current = chooseLayout(current, analyses);
        // Layouts the format crops the picture too much for are left out; staff see which.
        for (const analysis of analyses) {
          const detail = cropNote(current, analysis);
          if (detail)
            notes.push({
              page: `story-${analysis.page}`,
              kind: 'crop',
              detail,
            });
        }
      }
      let check: PageCheck = { fits: {}, overflow: [], fallback: [] };
      for (let round = 0; round < ROUNDS; round++) {
        const rendered = renderBook(book, current, { hyphenate });
        const html = bookDocument(rendered, {
          title: book.title ?? '',
          language: book.language,
          fontCss: this.fontCss,
        });
        const htmlPath = await this.storage.save(
          `books/${bookId}/book.html`,
          Buffer.from(html),
        );
        // A file:// page, so the relative image paths resolve against the book folder.
        await page.goto(pathToFileURL(join(this.storage.root, htmlPath)).href, {
          waitUntil: 'load',
        });
        await page.evaluate(() => document.fonts.ready);
        check = await checkPages(page, current.theme.minFit);
        const next = demote(current, rendered.pages, check.overflow);
        if (!next) break;
        current = next;
      }
      // The PDF is printed from the page as checked: the shrink is already applied there.
      const pdf = await page.pdf({
        width: `${current.format.widthMm}mm`,
        height: `${current.format.heightMm}mm`,
        printBackground: true,
        preferCSSPageSize: true,
      });
      const pdfPath = await this.storage.save(`books/${bookId}/book.pdf`, pdf);
      const qa = verdict(check, new Date(), notes);
      if (qa.status === 'blocked') {
        const summary = qa.issues
          .map((i) => `${i.page}: ${i.kind} (${i.detail})`)
          .join('; ');
        this.logger.warn(`book ${bookId} cannot be printed: ${summary}`);
        call.fail(new Error(`Render QA blocked printing: ${summary}`), {
          code: `render_${qa.issues[0].kind}`,
        });
      } else {
        call.ok({ costUsd: 0 });
      }
      return { pdfPath, layout: { ...current, fits: check.fits, qa }, tones };
    } catch (error) {
      call.fail(error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  /**
   * The print file of a frozen layout: every page with the format's bleed (pictures run on past the
   * trim), on a sheet with crop marks and a label outside the bleed. Nothing is chosen or checked
   * again — the layout, its page picks and its shrink are the ones the order froze. Written to
   * `outPath` (a storage path); returns it.
   */
  async renderPrint(
    bookId: string,
    book: RenderableBook,
    layout: BookLayout,
    outPath: string,
    label: string,
  ): Promise<string> {
    const hyphenate = hyphenatorFor(book.language);
    const rendered = renderBook(book, layout, { hyphenate, bleed: true });
    const html = printDocument(rendered, {
      title: book.title ?? '',
      language: book.language,
      fontCss: this.fontCss,
      format: layout.format,
      label,
    });
    // Next to book.html, so the pictures' relative paths resolve the same way.
    const htmlPath = await this.storage.save(
      `books/${bookId}/print.html`,
      Buffer.from(html),
    );
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(join(this.storage.root, htmlPath)).href, {
        waitUntil: 'load',
      });
      await page.evaluate(() => document.fonts.ready);
      const size = printPageSize(layout.format);
      const pdf = await page.pdf({
        width: `${size.widthMm}mm`,
        height: `${size.heightMm}mm`,
        printBackground: true,
        preferCSSPageSize: true,
      });
      return await this.storage.save(outPath, pdf);
    } finally {
      await browser.close();
    }
  }
}

/**
 * Lightness of each picture on a GRID×GRID grid, measured in the browser (it decodes every format
 * the models return, the mock's SVG too). Pictures already measured are not measured again.
 */
async function measureTones(
  page: Page,
  folder: string,
  book: RenderableBook,
  pictures: PagePicture[],
): Promise<Record<number, PageTone | null>> {
  const tones: Record<number, PageTone | null> = {};
  for (const picture of pictures) {
    tones[picture.page] = picture.tone;
    const file = book.pages.find((p) => p.page === picture.page)?.image;
    if (picture.tone || !file) continue;
    const data = await readFile(join(folder, file)).catch(() => null);
    if (!data) continue;
    const url = `data:${MIME[extname(file)] ?? 'image/jpeg'};base64,${data.toString('base64')}`;
    tones[picture.page] = await page.evaluate(
      async ({ url, grid }) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const side = grid * 8;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = side;
        const context = canvas.getContext('2d')!;
        context.drawImage(img, 0, 0, side, side);
        const { data } = context.getImageData(0, 0, side, side);
        const lum: number[] = [];
        for (let gy = 0; gy < grid; gy++) {
          for (let gx = 0; gx < grid; gx++) {
            let sum = 0;
            for (let y = gy * 8; y < gy * 8 + 8; y++) {
              for (let x = gx * 8; x < gx * 8 + 8; x++) {
                const i = (y * side + x) * 4;
                sum +=
                  0.2126 * data[i] +
                  0.7152 * data[i + 1] +
                  0.0722 * data[i + 2];
              }
            }
            lum.push(Math.round(sum / 64));
          }
        }
        return { aspect: img.naturalWidth / img.naturalHeight, lum };
      },
      { url, grid: GRID },
    );
  }
  return tones;
}

export function verdict(
  check: PageCheck,
  now = new Date(),
  notes: LayoutQa['notes'] = [],
): LayoutQa {
  const issues: RenderIssue[] = [
    ...check.overflow.map((o) => ({ ...o, kind: 'overflow' as const })),
    ...check.fallback.map((f) => ({ ...f, kind: 'fallback-font' as const })),
  ];
  const status = issues.length
    ? 'blocked'
    : Object.keys(check.fits).length
      ? 'shrunk'
      : 'ok';
  return { status, checkedAt: now.toISOString(), issues, notes };
}

/**
 * The next layout to try: story pages that overflow even at the smallest size give up their
 * layout (unless staff pinned it) and take the next one. Null when nothing can change.
 */
export function demote(
  layout: BookLayout,
  pages: RenderedPage[],
  overflow: PageCheck['overflow'],
): BookLayout | null {
  const next: BookLayout = { ...layout, pages: { ...layout.pages } };
  let changed = false;
  for (const { page: key } of overflow) {
    const page = pages.find((p) => p.key === key);
    if (page?.kind !== 'story' || !page.variant || page.variant === 'plate')
      continue;
    const id = String(page.story);
    const state = next.pages[id];
    if (state?.pin) continue;
    if (state?.tooFull.includes(page.variant)) continue;
    const base = state ?? blankPage();
    next.pages[id] = { ...base, tooFull: [...base.tooFull, page.variant] };
    changed = true;
  }
  return changed ? next : null;
}

/** Shrinks overflowing text in place and reports what still does not fit or fell back to a system font. */
async function checkPages(page: Page, minFit: number): Promise<PageCheck> {
  const measured = await page.evaluate(
    ({ minFit, step }) => {
      const fits: Record<string, number> = {};
      const overflow: { page: string; detail: string }[] = [];
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>('.fb-page'),
      );
      for (const section of sections) {
        const key = section.dataset.key ?? '?';
        const boxes = Array.from(
          section.querySelectorAll<HTMLElement>('[data-fit-box]'),
        );
        const over = () =>
          boxes.find((box) => {
            const flow = box.firstElementChild as HTMLElement | null;
            if (!flow) return false;
            const wide = Array.from(
              flow.querySelectorAll<HTMLElement>('p, li, h1, h2'),
            ).some((el) => el.scrollWidth > el.clientWidth + 1);
            return wide || flow.offsetHeight > box.clientHeight + 1;
          });
        let fit = 1;
        while (over() && fit - step >= minFit - 1e-9) {
          fit = Math.round((fit - step) * 1000) / 1000;
          section.style.setProperty('--fit', String(fit));
        }
        if (fit < 1) fits[key] = fit;
        const box = over();
        if (box) {
          const flow = box.firstElementChild as HTMLElement;
          overflow.push({
            page: key,
            detail: `${Math.round(flow.offsetHeight)}px of text in a ${Math.round(box.clientHeight)}px box at ${Math.round(fit * 100)}%`,
          });
        }
      }
      // Tag every text element with its page, for the font check below.
      const keys: string[] = [];
      document.querySelectorAll<HTMLElement>('[data-qa-text]').forEach((el) => {
        keys.push(el.closest<HTMLElement>('.fb-page')?.dataset.key ?? '?');
      });
      return { fits, overflow, keys };
    },
    { minFit, step: SHRINK_STEP },
  );
  return { ...measured, fallback: await fallbackFonts(page, measured.keys) };
}

/**
 * Chromium's own record of the fonts it drew each text with (CSS.getPlatformFontsForNode): a
 * font that is not one of the embedded web fonts means a letter fell back to a system font.
 */
async function fallbackFonts(
  page: Page,
  keys: string[],
): Promise<PageCheck['fallback']> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
      nodeId: root.nodeId,
      selector: '[data-qa-text]',
    });
    const found = new Map<string, Set<string>>();
    for (const [i, nodeId] of nodeIds.entries()) {
      const nested = await cdp.send('DOM.querySelectorAll', {
        nodeId,
        selector: '*',
      });
      for (const id of [nodeId, ...nested.nodeIds]) {
        const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', {
          nodeId: id,
        });
        for (const font of fonts) {
          if (font.isCustomFont) continue;
          const key = keys[i] ?? '?';
          found.set(key, (found.get(key) ?? new Set()).add(font.familyName));
        }
      }
    }
    return [...found].map(([page, families]) => ({
      page,
      detail: `drawn with ${[...families].join(', ')}`,
    }));
  } finally {
    await cdp.detach();
  }
}

@Global()
@Module({ providers: [PdfService], exports: [PdfService] })
export class PdfModule {}
