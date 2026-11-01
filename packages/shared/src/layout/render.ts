import type { Language } from "../language";
import { BOOK_LABELS } from "../labels";
import type { BookLayout, BookTheme, PageLayout, PageVariant } from "./model";
import { BOOK_FONTS } from "./themes";
import { type PlannedPage, type Rect, artRect, planBook, textRect } from "./plan";
import { objectPosition } from "./choose";

/**
 * The one book renderer. It turns a book and its layout into fixed-size HTML pages (millimetres,
 * points): the site shows them as spreads, scaled to fit, and the API prints the same pages to PDF
 * with headless Chromium. Same markup, same CSS, same font files, same soft hyphens — so what the
 * parent sees is what is printed. Paged.js was considered: it flows one long document into pages,
 * which a picture book with a fixed layout per page does not need, and it rewrites the DOM in a way
 * that fights React; so pages are laid out here directly and checked by render QA.
 */

/** What the renderer needs of a book. Image sources are ready to use (URLs or file names). */
export interface RenderableBook {
  title: string | null;
  childName: string;
  language: Language;
  heroImage: string | null;
  pages: { page: number; text: string; image: string | null }[];
  talkQuestions: string[];
}

/** A run of text: plain, or words to mark with a hint (the sample book on a catalog page). */
export type MarkedPiece = string | { text: string; hint: string };

export interface RenderOptions {
  /** Inserts soft hyphens (U+00AD) into body text; left out, nothing is hyphenated. */
  hyphenate?: (text: string) => string;
  /** Marks words of the body text and title (the site's sample book). */
  mark?: (text: string) => MarkedPiece[];
  /**
   * For the print file: each page grows by the format's bleed on every side, pictures that touch
   * the trim run on into it, and the trimmed page sits in the middle exactly as on screen.
   */
  bleed?: boolean;
}

export interface RenderedPage extends PlannedPage {
  /** A <section> of the page's full size; its style carries the theme. */
  html: string;
}

export interface RenderedBook {
  pages: RenderedPage[];
  widthMm: number;
  heightMm: number;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Which languages get hyphenated, with which TeX patterns (the `hyphen` package). Kazakh has none
 * (neither hyph-utf8 nor Chromium's dictionaries have it), and wrong hyphens are worse than none.
 */
export const HYPHENATION: Record<Language, "ru" | "en-us" | "es" | "de" | null> = {
  ru: "ru",
  kk: null,
  en: "en-us",
  es: "es",
  de: "de",
};

/** Words shorter than this are never hyphenated (the API and the site use the same value). */
export const HYPHEN_MIN_WORD = 6;

const fontStack = (family: string) => `'${family}', ${BOOK_FONTS[family]?.generic ?? "serif"}`;
const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;
const place = (r: Rect) => `left:${mm(r.x)};top:${mm(r.y)};width:${mm(r.w)};height:${mm(r.h)}`;

/** The theme as CSS variables on each page, so a page can be shown on its own. */
function themeStyle(layout: BookLayout, fit: number, bleed: number): string {
  const { theme, format } = layout;
  const size = theme.sizes[layout.ageGroup];
  const heading = layout.headingFallback ? { family: theme.fonts.body.family, weight: 700 } : theme.fonts.heading;
  const p = theme.palette;
  return [
    `--w:${mm(format.widthMm + 2 * bleed)}`,
    `--h:${mm(format.heightMm + 2 * bleed)}`,
    `--safe:${mm(format.safeMm)}`,
    `--paper:${p.paper}`,
    `--ink:${p.ink}`,
    `--accent:${p.accent}`,
    `--muted:${p.muted}`,
    `--cover:${p.cover}`,
    `--plate:${p.plate}`,
    `--body:${fontStack(theme.fonts.body.family)}`,
    `--body-weight:${theme.fonts.body.weight}`,
    `--heading:${fontStack(heading.family)}`,
    `--heading-weight:${heading.weight}`,
    `--body-size:${size.bodyPt}pt`,
    `--line:${size.lineHeight}`,
    `--title-size:${size.titlePt}pt`,
    `--heading-size:${size.headingPt}pt`,
    `--fit:${fit}`,
  ].join(";");
}

/** Lays the book out and renders every page. */
export function renderBook(book: RenderableBook, layout: BookLayout, options: RenderOptions = {}): RenderedBook {
  const labels = BOOK_LABELS[book.language];
  const plan = planBook(book, layout);
  const byPage = new Map(book.pages.map((p) => [p.page, p]));

  const body = (text: string) => inline(text, options, true);
  const title = (text: string) => inline(text, options, false);
  const bleed = options.bleed ? layout.format.bleedMm : 0;
  const bleedArt = (r: Rect) => (bleed ? place(grow(r, layout.format, bleed)) + ";" : "");

  const pages = plan.map((planned): RenderedPage => {
    const fit = layout.fits[planned.key] ?? 1;
    const style = themeStyle(layout, fit, bleed);
    const classes = [`fb-page`, `fb-${planned.kind}`, `fb-${planned.side}`];
    if (planned.filler) classes.push("fb-filler");
    let inner = "";
    switch (planned.kind) {
      case "cover":
        inner = cover(book, layout, title, labels.madeFor(book.childName), bleedArt);
        classes.push(`fb-cover-${layout.theme.cover}`);
        break;
      case "dedication":
        inner = `<div class="fb-box fb-center" data-fit-box style="${place(paperRect(layout))}"><div class="fb-flow">
  <div class="fb-ornament">${ornament(layout.theme.ornament)}</div>
  <p class="fb-dedication-text" data-qa-text>${title(layout.dedication ?? labels.madeFor(book.childName))}</p></div></div>`;
        break;
      case "story": {
        const page = byPage.get(planned.story!)!;
        const state = layout.pages[String(planned.story)];
        inner = story(planned, page, state, layout, body, bleedArt);
        classes.push(`fb-v-${planned.variant}`);
        break;
      }
      case "talk":
        inner = `<div class="fb-box" data-fit-box style="${place(paperRect(layout))}"><div class="fb-flow">
  <h2 class="fb-heading" data-qa-text>${escapeHtml(labels.talk)}</h2>
  <ol class="fb-questions">${book.talkQuestions.map((q) => `<li data-qa-text>${body(q)}</li>`).join("")}</ol></div></div>`;
        break;
      case "drawing":
        inner = `<div class="fb-drawing-frame"></div><p class="fb-drawing-label" data-qa-text>${escapeHtml(labels.drawing)}</p>`;
        break;
      case "end":
        inner = `<div class="fb-box fb-center" data-fit-box style="${place(paperRect(layout))}"><div class="fb-flow">
  <div class="fb-ornament">${ornament(layout.theme.ornament)}</div>
  <h2 class="fb-end-title" data-qa-text>${escapeHtml(labels.end)}</h2>
  <p class="fb-made" data-qa-text>Fabulka · Powered by Meta Muse models</p></div></div>`;
        break;
    }
    const folio = planned.kind === "story" && planned.index > 0 ? `<span class="fb-folio">${planned.index}</span>` : "";
    const variant = planned.variant ? ` data-variant="${planned.variant}"` : "";
    const filler = planned.filler ? ` data-filler="true"` : "";
    const content = bleed
      ? `<div class="fb-trim" style="left:${mm(bleed)};top:${mm(bleed)};width:${mm(layout.format.widthMm)};height:${mm(layout.format.heightMm)}">${inner}${folio}</div>`
      : `${inner}${folio}`;
    const html = `<section class="${classes.join(" ")}" data-key="${planned.key}"${variant}${filler} style="${style}">${content}</section>`;
    return { ...planned, html };
  });
  return { pages, widthMm: layout.format.widthMm, heightMm: layout.format.heightMm };
}

/**
 * A picture's box grown into the bleed on every side where it touches the trim (for a spread, the
 * box spans both pages, so on each page it reaches past the trim on the outer side).
 */
function grow(r: Rect, format: BookLayout["format"], bleed: number): Rect {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const x0 = r.x <= 0.01 ? r.x - bleed : r.x;
  const y0 = r.y <= 0.01 ? r.y - bleed : r.y;
  const x1 = r.x + r.w >= format.widthMm - 0.01 || near(r.x + r.w, format.widthMm) ? r.x + r.w + bleed : r.x + r.w;
  const y1 = r.y + r.h >= format.heightMm - 0.01 ? r.y + r.h + bleed : r.y + r.h;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The safe area of a paper page. */
function paperRect(layout: BookLayout): Rect {
  const { widthMm: w, heightMm: h, safeMm: s } = layout.format;
  return { x: s + 6, y: s + 6, w: w - 2 * s - 12, h: h - 2 * s - 12 };
}

function cover(
  book: RenderableBook,
  layout: BookLayout,
  title: (t: string) => string,
  madeFor: string,
  bleedArt: (r: Rect) => string,
): string {
  const heading = `<div class="fb-cover-title" data-fit-box><div class="fb-flow">
  <h1 data-qa-text>${title(book.title ?? "")}</h1>
  <p class="fb-for" data-qa-text>${escapeHtml(madeFor)}</p></div></div>`;
  if (layout.theme.cover === "scene") {
    const first = book.pages[0];
    const state = layout.pages[String(first?.page)];
    const { widthMm: w, heightMm: h } = layout.format;
    return `${image(first?.image ?? book.heroImage, "fb-art", crop(state, w / h), bleedArt({ x: 0, y: 0, w, h }))}${heading}`;
  }
  return `<div class="fb-hero-frame">${image(book.heroImage, "fb-hero")}</div>${heading}`;
}

function story(
  planned: PlannedPage,
  page: RenderableBook["pages"][number],
  state: PageLayout | undefined,
  layout: BookLayout,
  body: (t: string) => string,
  bleedArt: (r: Rect) => string,
): string {
  const variant = planned.variant as PageVariant;
  const ink = state?.ink?.[variant] ?? "dark";
  const text = (rect: Rect, cls = "") =>
    `<div class="fb-box fb-text fb-ink-${ink} ${cls}" data-fit-box style="${place(rect)}"><div class="fb-flow"><p data-qa-text>${body(page.text)}</p></div></div>`;
  const box = artRect(variant, layout.format);
  const art = (cls = "fb-art", style = "") => image(page.image, cls, crop(state, box.w / box.h), style);
  const rect = textRect(variant, layout.format, state);
  const full = bleedArt(box);
  switch (variant) {
    case "overlay-top":
    case "overlay-bottom":
      return art("fb-art", full) + text(rect, variant === "overlay-top" ? "fb-top" : "fb-bottom");
    case "split":
      return art("fb-art", full || `${place(box)};`) + text(rect, "fb-on-paper");
    case "facing":
      if (planned.part === 0) return art("fb-art", full);
      return `<div class="fb-ornament fb-facing-ornament">${ornament(layout.theme.ornament)}</div>${text(rect, "fb-on-paper fb-center")}`;
    case "spread": {
      const left = planned.part === 0;
      const side = state?.spreadSide ?? "right";
      const shifted = { ...box, x: left ? 0 : -layout.format.widthMm };
      const pic = art("fb-art fb-spread-art", bleedArt(shifted) || (left ? "left:0" : "left:-100%"));
      return pic + ((left ? "left" : "right") === side ? text(rect, "fb-bottom") : "");
    }
    case "plate":
      return art("fb-art", full) + text(rect, `fb-plate ${state?.plateBand === "top" ? "fb-top" : "fb-bottom"}`);
  }
}

const ORNAMENT_SVG: Record<BookTheme["ornament"], string> = {
  leaf: '<path d="M12 22c-.8-3.6-4.6-5.8-8-5.8C4 9.6 7.6 4.4 12 2c4.4 2.4 8 7.6 8 14.2-3.4 0-7.2 2.2-8 5.8z"/><path d="M12 6v14" stroke="#fff" stroke-opacity=".55" stroke-width="1" fill="none"/>',
  star: '<path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 17.4l-6.2 3.8 1.6-7L2 9.5l7.1-.6z"/>',
  flower: '<circle cx="12" cy="6" r="4"/><circle cx="17.7" cy="10.1" r="4"/><circle cx="15.5" cy="16.9" r="4"/><circle cx="8.5" cy="16.9" r="4"/><circle cx="6.3" cy="10.1" r="4"/><circle cx="12" cy="12" r="3" fill="#fff" fill-opacity=".7"/>',
  sparkle: '<path d="M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z"/>',
};

function ornament(shape: BookTheme["ornament"]): string {
  return `<svg viewBox="0 0 24 24" width="12mm" height="12mm" fill="currentColor" aria-hidden="true">${ORNAMENT_SVG[shape]}</svg>`;
}

/** The object-position that keeps the hero in view when the picture is cropped to a box of this shape. */
function crop(state: PageLayout | undefined, boxAspect: number): { x: number; y: number } | undefined {
  return state ? objectPosition(state.focus, state.aspect, boxAspect) : undefined;
}

function image(src: string | null | undefined, cls: string, position?: { x: number; y: number }, style = ""): string {
  const css0 = position ? `object-position:${Math.round(position.x * 1000) / 10}% ${Math.round(position.y * 1000) / 10}%;` : "";
  const css = `${css0}${style}`;
  if (!src) return `<div class="${cls} fb-empty" style="${css}"></div>`;
  return `<img class="${cls}" src="${escapeHtml(src)}" alt="" style="${css}">`;
}

/** Escaped text with optional soft hyphens and marks. */
function inline(text: string, options: RenderOptions, hyphenate: boolean): string {
  const fix = (t: string) => escapeHtml(hyphenate && options.hyphenate ? options.hyphenate(t) : t);
  const pieces = options.mark ? options.mark(text) : [text];
  // Marked words (a name, a city) are kept whole: they are proper names, and the hint names them.
  return pieces
    .map((piece) =>
      typeof piece === "string"
        ? fix(piece)
        : `<mark class="fb-mark" data-testid="sample-highlight" tabindex="0" data-hint="${escapeHtml(piece.hint)}">${escapeHtml(piece.text)}</mark>`,
    )
    .join("");
}

/**
 * The book's CSS, the same on the site and in the PDF. Sizes are in millimetres and points; each
 * page carries its theme in CSS variables; --fit is render QA's shrink factor for that page.
 */
export const BOOK_CSS = `
.fb-page { position: relative; width: var(--w); height: var(--h); overflow: hidden; box-sizing: border-box;
  background: var(--paper); color: var(--ink); font-family: var(--body); font-weight: var(--body-weight);
  font-size: calc(var(--body-size) * var(--fit)); line-height: var(--line); text-align: left;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; font-kerning: normal; }
.fb-page * { box-sizing: border-box; margin: 0; padding: 0; }
.fb-page p, .fb-page li { hyphens: manual; -webkit-hyphens: manual; widows: 2; orphans: 2; }
.fb-page img { display: block; }
.fb-trim { position: absolute; overflow: visible; }
.fb-art { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
.fb-spread-art { width: 200%; }
.fb-empty { background: #e6dccb; }
.fb-box { position: absolute; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
.fb-box.fb-top { justify-content: flex-start; }
.fb-box.fb-bottom { justify-content: flex-end; }
.fb-center { text-align: center; align-items: stretch; }
.fb-flow { width: 100%; }
.fb-text p { font-size: calc(var(--body-size) * var(--fit)); line-height: var(--line); }
.fb-ink-dark { color: var(--ink); text-shadow: 0 0 1.2mm rgba(255,255,255,.85), 0 0 .4mm rgba(255,255,255,.9); }
.fb-ink-light { color: #fff; text-shadow: 0 0 1.4mm rgba(0,0,0,.6), 0 0 .4mm rgba(0,0,0,.5); }
.fb-on-paper { color: var(--ink); text-shadow: none; }
.fb-plate { color: var(--ink); text-shadow: none; }
.fb-plate .fb-flow { background: color-mix(in srgb, var(--plate) 90%, transparent); border-radius: 5mm; padding: 4mm 5mm;
  box-shadow: 0 .6mm 2.4mm rgba(0,0,0,.12); }
.fb-ornament { color: var(--accent); line-height: 0; margin-bottom: 4mm; text-align: center; }
.fb-ornament svg { display: inline-block; }
.fb-facing-ornament { position: absolute; left: 0; right: 0; top: calc(var(--safe) + 4mm); }
.fb-folio { position: absolute; bottom: 5mm; font-size: 9pt; line-height: 1; color: var(--muted); }
.fb-left .fb-folio { left: 9mm; }
.fb-right .fb-folio { right: 9mm; }
.fb-heading, .fb-cover-title h1, .fb-end-title, .fb-dedication-text { font-family: var(--heading); font-weight: var(--heading-weight); }
.fb-heading { font-size: calc(var(--heading-size) * var(--fit)); line-height: 1.15; margin-bottom: 7mm; color: var(--ink); }
.fb-questions { padding-left: 7mm; }
.fb-questions li { margin-bottom: 4mm; line-height: 1.35; }
.fb-dedication-text { font-size: calc(var(--heading-size) * var(--fit)); line-height: 1.25; }
.fb-end-title { font-size: calc(var(--title-size) * 1.15 * var(--fit)); line-height: 1.1; }
.fb-made { margin-top: 6mm; font-size: 9pt; color: var(--muted); }
.fb-cover { background: var(--cover); }
.fb-cover-title { position: absolute; left: calc(var(--safe) + 4mm); right: calc(var(--safe) + 4mm); text-align: center;
  display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
.fb-cover-title h1 { font-size: calc(var(--title-size) * var(--fit)); line-height: 1.12; color: var(--ink); }
.fb-for { margin-top: 3mm; font-size: 12pt; color: var(--muted); }
.fb-cover-framed .fb-hero-frame { position: absolute; left: 50%; top: calc(var(--safe) + 4mm); width: 118mm; height: 118mm;
  transform: translateX(-50%); border-radius: 8mm; background: #fff; overflow: hidden; box-shadow: 0 1mm 4mm rgba(0,0,0,.12); }
.fb-cover-framed .fb-hero { width: 100%; height: 100%; object-fit: contain; }
.fb-cover-framed .fb-cover-title { top: calc(var(--safe) + 128mm); bottom: var(--safe); }
.fb-cover-scene .fb-cover-title { top: var(--safe); max-height: 46%; }
.fb-cover-scene .fb-cover-title .fb-flow { background: color-mix(in srgb, var(--plate) 88%, transparent); border-radius: 6mm;
  padding: 5mm 6mm; box-shadow: 0 .8mm 3mm rgba(0,0,0,.15); }
.fb-drawing-frame { position: absolute; inset: calc(var(--safe) + 4mm); bottom: calc(var(--safe) + 16mm);
  border: .6mm dashed color-mix(in srgb, var(--muted) 60%, transparent); border-radius: 6mm; }
.fb-drawing-label { position: absolute; left: var(--safe); right: var(--safe); bottom: calc(var(--safe) + 2mm); text-align: center;
  font-size: 11pt; color: var(--muted); }
.fb-mark { background: color-mix(in srgb, var(--accent) 20%, transparent); color: inherit; border-radius: .2em; padding: 0 .1em;
  text-decoration: underline dotted color-mix(in srgb, var(--accent) 70%, transparent); text-underline-offset: .2em; cursor: help; outline: none; }
.fb-mark:focus-visible { box-shadow: 0 0 0 .5mm var(--accent); }
`;

/** A whole document for printing: every page, one per PDF page. */
export function bookDocument(rendered: RenderedBook, meta: { title: string; language: Language; fontCss: string }): string {
  return `<!doctype html>
<html lang="${meta.language}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<style>
${meta.fontCss}
@page { size: ${rendered.widthMm}mm ${rendered.heightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
${BOOK_CSS}
.fb-page { break-after: page; page-break-after: always; }
.fb-page:last-child { break-after: auto; page-break-after: auto; }
</style>
</head>
<body>
${rendered.pages.map((p) => p.html).join("\n")}
</body>
</html>`;
}

/** Room around the bleed for crop marks and the page label in the print file, in millimetres. */
export const PRINT_SLUG_MM = 10;
/** Crop marks: their length and their gap from the bleed edge. */
const MARK_MM = 5;
const MARK_GAP_MM = 1.5;

/** The print file's page size: trim plus bleed on every side plus the slug for the marks. */
export function printPageSize(format: BookLayout["format"]): { widthMm: number; heightMm: number } {
  const extra = 2 * (format.bleedMm + PRINT_SLUG_MM);
  return { widthMm: format.widthMm + extra, heightMm: format.heightMm + extra };
}

/**
 * The print file for the printer: every page rendered with bleed (renderBook with `bleed`), centred
 * on a sheet with crop marks at the trim corners outside the bleed and a label in the slug. Separate
 * from the screen PDF, which is the trimmed pages only.
 */
export function printDocument(
  rendered: RenderedBook,
  meta: { title: string; language: Language; fontCss: string; format: BookLayout["format"]; label: string },
): string {
  const { format } = meta;
  const b = format.bleedMm;
  const s = PRINT_SLUG_MM;
  const sheet = printPageSize(format);
  const x0 = s + b;
  const y0 = s + b;
  const x1 = x0 + format.widthMm;
  const y1 = y0 + format.heightMm;
  const line = (xa: number, ya: number, xb: number, yb: number) =>
    `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#000" stroke-width="0.25"/>`;
  const out = b + MARK_GAP_MM;
  const marks = [
    // Horizontal marks on the trim lines, left and right of the bleed.
    line(x0 - out - MARK_MM, y0, x0 - out, y0),
    line(x1 + out, y0, x1 + out + MARK_MM, y0),
    line(x0 - out - MARK_MM, y1, x0 - out, y1),
    line(x1 + out, y1, x1 + out + MARK_MM, y1),
    // Vertical marks on the trim lines, above and below the bleed.
    line(x0, y0 - out - MARK_MM, x0, y0 - out),
    line(x1, y0 - out - MARK_MM, x1, y0 - out),
    line(x0, y1 + out, x0, y1 + out + MARK_MM),
    line(x1, y1 + out, x1, y1 + out + MARK_MM),
  ].join("");
  const total = rendered.pages.length;
  const sheets = rendered.pages.map(
    (p, i) => `<div class="fb-sheet" data-key="${p.key}">
<div class="fb-sheet-page">${p.html}</div>
<svg class="fb-marks" viewBox="0 0 ${sheet.widthMm} ${sheet.heightMm}" width="${sheet.widthMm}mm" height="${sheet.heightMm}mm">${marks}</svg>
<div class="fb-slug">${escapeHtml(meta.label)} · ${i + 1}/${total} · ${p.key}</div>
</div>`,
  );
  return `<!doctype html>
<html lang="${meta.language}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<style>
${meta.fontCss}
@page { size: ${sheet.widthMm}mm ${sheet.heightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
${BOOK_CSS}
.fb-sheet { position: relative; width: ${sheet.widthMm}mm; height: ${sheet.heightMm}mm; overflow: hidden; background: #fff;
  break-after: page; page-break-after: always; }
.fb-sheet:last-child { break-after: auto; page-break-after: auto; }
.fb-sheet-page { position: absolute; left: ${s}mm; top: ${s}mm; }
.fb-marks { position: absolute; left: 0; top: 0; }
.fb-slug { position: absolute; left: ${x0}mm; bottom: 2mm; font: 6pt/1 sans-serif; color: #000; }
</style>
</head>
<body>
${sheets.join("\n")}
</body>
</html>`;
}
