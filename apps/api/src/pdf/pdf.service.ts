import { Global, Injectable, Logger, Module } from '@nestjs/common';
import {
  COVER_MAX_OVERLAP,
  GRID,
  blankPage,
  bookDocument,
  chooseCover,
  chooseLayout,
  coverOverlap,
  coverWrap,
  interiorPages,
  planBook,
  renderCoverWrap,
  type Binding,
  type Rect,
  countBreaks,
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
import { withPrintBoxes } from './print-boxes';

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
  /** The cover's lettering as rendered (mm on the page), when the book has a designed cover. */
  coverText?: Rect | null;
  /** The lettering lies over the hero on the cover art even in the banner (should never happen). */
  coverOverlap?: { page: string; detail: string }[];
}

export interface RenderResult {
  pdfPath: string;
  layout: BookLayout;
  /** Each story page's tone, measured now or passed in: the caller keeps them for next time. */
  tones: Record<number, PageTone | null>;
  /** The cover illustration's tone, measured now or passed in; null without one. */
  coverTone: PageTone | null;
}

/** What is known of the cover illustration: SAM's mask (null: SAM failed) and its tone, if measured. */
export interface CoverPicture {
  subject: PageSubject | null;
  tone: PageTone | null;
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

/** Told how far a render has got, for the progress screen. */
export interface RenderHooks {
  /** The pages are laid out and checked; the PDF is printed next. */
  printing?: () => unknown;
}

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
    hooks: RenderHooks = {},
    cover: CoverPicture | null = null,
  ): Promise<RenderResult> {
    const call = this.journal.start({ kind: 'render', model: 'chromium' });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const {
        layout: current,
        check,
        notes,
        tones,
        coverTone,
      } = await this.layOut(
        page,
        `books/${bookId}`,
        'book.html',
        book,
        layout,
        pictures,
        cover,
      );
      await hooks.printing?.();
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
      return {
        pdfPath,
        layout: { ...current, fits: check.fits, qa },
        tones,
        coverTone,
      };
    } catch (error) {
      call.fail(error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  /** Where a stored file is, for a file:// page (an AI theme's ornament). */
  private asset = (path: string) =>
    pathToFileURL(join(this.storage.root, path)).href;

  /**
   * Lays a book out in `folder` (a storage path holding its pictures) and runs render QA there: the
   * chooser picks each page's layout from its picture, text that overflows is shrunk within the
   * theme's limit, a story page that still overflows tries its next layout. The page is left open
   * on the checked document.
   */
  private async layOut(
    page: Page,
    folder: string,
    htmlName: string,
    book: RenderableBook,
    layout: BookLayout,
    pictures: PagePicture[],
    cover: CoverPicture | null = null,
  ) {
    const hyphenate = hyphenatorFor(book.language);
    const tones = await measureTones(
      page,
      join(this.storage.root, folder),
      book,
      pictures,
    );
    // The cover's lettering goes where SAM says the hero is not (chooseCover); none without its art.
    const coverTone =
      cover && book.coverImage
        ? (cover.tone ??
          (await measureTone(
            page,
            join(this.storage.root, folder, book.coverImage),
          )))
        : null;
    let current: BookLayout = {
      ...layout,
      fits: {},
      cover:
        cover && book.coverImage
          ? chooseCover(layout, cover.subject, coverTone, {
              name: book.childName,
              title: book.title ?? '',
            })
          : null,
    };
    const notes: LayoutQa['notes'] = [];
    if (pictures.length) {
      const analyses = pictures.map((p) => {
        const page = book.pages.find((b) => b.page === p.page);
        return {
          page: p.page,
          subject: p.subject,
          tone: tones[p.page],
          words: countWords(page?.text ?? ''),
          breaks: countBreaks(page?.text ?? ''),
          // A page whose picture was refused has none: it becomes a vignette page.
          art: Boolean(page?.image),
        };
      });
      current = chooseLayout(current, analyses);
      for (const analysis of analyses) {
        if (!analysis.art) {
          notes.push({
            page: `story-${analysis.page}`,
            kind: 'no-art',
            detail:
              "Muse Image refused every version of this page's scene: the hero's sheet stands in as a vignette",
          });
          continue;
        }
        // Layouts the format crops the picture too much for are left out; staff see which.
        const detail = cropNote(current, analysis);
        if (detail)
          notes.push({ page: `story-${analysis.page}`, kind: 'crop', detail });
      }
    }
    let check: PageCheck = { fits: {}, overflow: [], fallback: [] };
    for (let round = 0; round < ROUNDS; round++) {
      const rendered = renderBook(book, current, {
        hyphenate,
        asset: this.asset,
      });
      const html = bookDocument(rendered, {
        title: book.title ?? '',
        language: book.language,
        fontCss: this.fontCss,
      });
      const htmlPath = await this.storage.save(
        `${folder}/${htmlName}`,
        Buffer.from(html),
      );
      // A file:// page, so the relative image paths resolve against the book folder.
      await page.goto(pathToFileURL(join(this.storage.root, htmlPath)).href, {
        waitUntil: 'load',
      });
      await page.evaluate(() => document.fonts.ready);
      check = await checkPages(page, current.theme.minFit);
      // The lettering as rendered must not lie over the hero: over the picture, it moves to its own band.
      const overlap =
        current.cover && check.coverText
          ? coverOverlap(
              current,
              current.cover,
              cover?.subject ?? null,
              check.coverText,
            )
          : 0;
      if (overlap > COVER_MAX_OVERLAP && current.cover) {
        if (current.cover.mode === 'overlay') {
          current = { ...current, cover: { ...current.cover, mode: 'banner' } };
          continue;
        }
        check.coverOverlap = [
          {
            page: 'cover',
            detail: `${Math.round(overlap * 100)}% of the lettering over the hero`,
          },
        ];
      }
      const next = demote(current, rendered.pages, check.overflow);
      if (!next) break;
      current = next;
    }
    return { layout: current, check, notes, tones, coverTone };
  }

  /**
   * An AI theme's ornament made fit to print small: Muse Image ignores the transparent background and
   * draws a small motif in the middle of a big white square. The white becomes transparent (softly,
   * so a glow keeps its edge) and the empty margin is cut off. Null when the picture is all white.
   */
  async cleanOrnament(image: Buffer, ext: string): Promise<Buffer | null> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const url = `data:${MIME[`.${ext}`] ?? 'image/png'};base64,${image.toString('base64')}`;
      const png = await page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const { naturalWidth: w, naturalHeight: h } = img;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext('2d')!;
        context.drawImage(img, 0, 0);
        const pixels = context.getImageData(0, 0, w, h);
        const d = pixels.data;
        let [left, top, right, bottom] = [w, h, -1, -1];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            // Distance from white: 0 for paper white, 255 for a full color or black.
            const ink = 255 - Math.min(d[i], d[i + 1], d[i + 2]);
            const alpha = Math.min(
              d[i + 3],
              Math.min(255, Math.max(0, (ink - 6) * 4)),
            );
            d[i + 3] = alpha;
            if (alpha > 24) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
        }
        if (right < 0) return null;
        context.putImageData(pixels, 0, 0);
        const pad = Math.round(Math.max(right - left, bottom - top) * 0.04);
        const [x0, y0] = [Math.max(0, left - pad), Math.max(0, top - pad)];
        const [x1, y1] = [
          Math.min(w, right + pad + 1),
          Math.min(h, bottom + pad + 1),
        ];
        const out = document.createElement('canvas');
        out.width = x1 - x0;
        out.height = y1 - y0;
        out
          .getContext('2d')!
          .drawImage(
            canvas,
            x0,
            y0,
            out.width,
            out.height,
            0,
            0,
            out.width,
            out.height,
          );
        return out.toDataURL('image/png').split(',')[1];
      }, url);
      return png ? Buffer.from(png, 'base64') : null;
    } finally {
      await browser.close();
    }
  }

  /**
   * A theme tried on sample books (one per language) in `folder`: each goes through render QA, and
   * every page is saved as a PNG preview for staff. Returns, by sample, its QA verdict and previews.
   */
  async renderSamples(
    folder: string,
    samples: { name: string; book: RenderableBook }[],
    layout: BookLayout,
    pictures: PagePicture[],
  ): Promise<{ name: string; qa: LayoutQa; previews: string[] }[]> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ deviceScaleFactor: 1 });
      const results: { name: string; qa: LayoutQa; previews: string[] }[] = [];
      for (const sample of samples) {
        const { check, notes } = await this.layOut(
          page,
          folder,
          `sample-${sample.name}.html`,
          sample.book,
          layout,
          pictures,
        );
        const previews: string[] = [];
        const sections = page.locator('.fb-page');
        const count = await sections.count();
        for (let i = 0; i < count; i++) {
          const png = await sections.nth(i).screenshot({ type: 'png' });
          previews.push(
            await this.storage.save(`${folder}/${sample.name}-${i}.png`, png),
          );
        }
        results.push({
          name: sample.name,
          qa: verdict(check, new Date(), notes),
          previews,
        });
      }
      return results;
    } finally {
      await browser.close();
    }
  }

  /**
   * The print file of a frozen layout: first the cover wrap for the order's binding (back cover,
   * spine as wide as the book is thick, front cover), then every page between the covers with the
   * format's bleed (pictures run on past the trim), each on a sheet with crop marks and a label
   * outside the bleed, with TrimBox and BleedBox set for the print shop's preflight. Nothing is chosen or checked
   * again — the layout, its page picks and its shrink are the ones the order froze. Written to
   * `outPath` (a storage path); returns it.
   */
  async renderPrint(
    bookId: string,
    book: RenderableBook,
    layout: BookLayout,
    outPath: string,
    label: string,
    binding: Binding = 'soft',
  ): Promise<string> {
    const hyphenate = hyphenatorFor(book.language);
    const options = { hyphenate, asset: this.asset };
    const rendered = renderBook(book, layout, { ...options, bleed: true });
    // The outside of the book first: back, spine and front as wide as the inside is thick.
    const spec = coverWrap(
      layout.format,
      interiorPages(planBook(book, layout)).length,
      binding,
    );
    const html = printDocument(rendered, {
      title: book.title ?? '',
      language: book.language,
      fontCss: this.fontCss,
      format: layout.format,
      label,
      wrap: { html: renderCoverWrap(book, layout, spec, options), spec },
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
      return await this.storage.save(
        outPath,
        await withPrintBoxes(pdf, layout.format, spec),
      );
    } finally {
      await browser.close();
    }
  }
}

/** One picture's tone (measureTones), or null when the file cannot be read. */
async function measureTone(page: Page, file: string): Promise<PageTone | null> {
  const data = await readFile(file).catch(() => null);
  if (!data) return null;
  const url = `data:${MIME[extname(file)] ?? 'image/jpeg'};base64,${data.toString('base64')}`;
  return toneOf(page, url);
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
    tones[picture.page] = await measureTone(page, join(folder, file));
  }
  return tones;
}

/** A picture's tone grid, from its data URL. */
function toneOf(page: Page, url: string): Promise<PageTone> {
  return page.evaluate(
    async ({ url, grid }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      // 16×16 samples a cell: their mean is the cell's lightness, their spread its texture.
      const n = 16;
      const side = grid * n;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = side;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingQuality = 'high';
      context.drawImage(img, 0, 0, side, side);
      const { data } = context.getImageData(0, 0, side, side);
      const lum: number[] = [];
      const detail: number[] = [];
      for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
          let sum = 0;
          let squares = 0;
          for (let y = gy * n; y < gy * n + n; y++) {
            for (let x = gx * n; x < gx * n + n; x++) {
              const i = (y * side + x) * 4;
              const l =
                0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
              sum += l;
              squares += l * l;
            }
          }
          const mean = sum / (n * n);
          lum.push(Math.round(mean));
          detail.push(
            Math.round(Math.sqrt(Math.max(0, squares / (n * n) - mean * mean))),
          );
        }
      }
      return { aspect: img.naturalWidth / img.naturalHeight, lum, detail };
    },
    { url, grid: GRID },
  );
}

export function verdict(
  check: PageCheck,
  now = new Date(),
  notes: LayoutQa['notes'] = [],
): LayoutQa {
  const issues: RenderIssue[] = [
    ...check.overflow.map((o) => ({ ...o, kind: 'overflow' as const })),
    ...check.fallback.map((f) => ({ ...f, kind: 'fallback-font' as const })),
    ...(check.coverOverlap ?? []).map((c) => ({
      ...c,
      kind: 'cover-overlap' as const,
    })),
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
      // Where the cover's lettering ended up, in millimetres from the page's top left (96 px an inch).
      const cover = document.querySelector<HTMLElement>(
        '.fb-page[data-key="cover"]',
      );
      const letters = cover?.querySelector<HTMLElement>(
        '[data-cover-text] .fb-flow',
      );
      let coverText: { x: number; y: number; w: number; h: number } | null =
        null;
      if (cover && letters) {
        const page = cover.getBoundingClientRect();
        // The flow is as wide as its box; the lines themselves are what may cover someone.
        const lines = Array.from(
          letters.querySelectorAll<HTMLElement>('h1, p'),
        ).map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect();
        });
        if (lines.length) {
          const mm = 25.4 / 96;
          const x0 = Math.min(...lines.map((r) => r.left));
          const y0 = Math.min(...lines.map((r) => r.top));
          const x1 = Math.max(...lines.map((r) => r.right));
          const y1 = Math.max(...lines.map((r) => r.bottom));
          coverText = {
            x: (x0 - page.left) * mm,
            y: (y0 - page.top) * mm,
            w: (x1 - x0) * mm,
            h: (y1 - y0) * mm,
          };
        }
      }
      return { fits, overflow, keys, coverText };
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
