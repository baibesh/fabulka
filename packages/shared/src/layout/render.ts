import type { Language } from "../language";
import { BOOK_LABELS } from "../labels";
import type { FrameRect, TextKind } from "../formats";
import type { FrameCast } from "../scenario";
import type { BookLayout, BookTheme, CoverLayout, PageLayout, PageVariant, PlacedText } from "./model";
import { frameBox, frameInner, letteringBox, letteringFont } from "./panels";
import { BOOK_FONTS, formatTypeScale } from "./themes";
import { type PlannedPage, type Rect, artRect, interiorPages, planBook, textRect } from "./plan";
import { contrast, luminance, objectPosition, pageText } from "./choose";
import { type CoverWrap, coverArtRect, coverBandRect, coverNameMm, coverTextRect, splitTitle } from "./cover";

/**
 * The one book renderer. It turns a book and its layout into fixed-size HTML pages (millimetres,
 * points): the site shows them as spreads, scaled to fit, and the API prints the same pages to PDF
 * with headless Chromium. Same markup, same CSS, same font files, same soft hyphens - so what the
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
  /** The front cover's own illustration; without it the cover shows the hero's character sheet. */
  coverImage?: string | null;
  /** The back cover's two sentences, in the book's language. */
  blurb?: string | null;
  pages: RenderablePage[];
  talkQuestions: string[];
}

/**
 * A story page for the renderer. A picture book page needs its text and picture; a panel page
 * (PageLayout.panels) also its frames and texts, which the renderer then draws where the layout
 * placed them. `image` is then the first frame's picture (for the covers).
 */
export interface RenderablePage {
  page: number;
  text: string;
  image: string | null;
  frames?: { frame: number; rect: FrameRect; image: string | null; cast?: FrameCast[] }[];
  texts?: { id: string; kind: TextKind; frame: number; text: string; speaker?: string | null }[];
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
  /** Where a stored file (an AI theme's ornament) is loaded from; the site's /files/ when left out. */
  asset?: (path: string) => string;
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
  const size = formatTypeScale(theme, layout.ageGroup, format);
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
    // The framed cover's title stands on the cover color: ink on a light one, paper on a dark one.
    `--cover-ink:${contrast(luminance(p.ink), luminance(p.cover)) >= contrast(luminance(p.paper), luminance(p.cover)) ? p.ink : p.paper}`,
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
    `--letter:${fontStack(letteringFont(theme).family)}`,
    `--letter-weight:${letteringFont(theme).weight}`,
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
  const asset = options.asset ?? ((path: string) => `/files/${path}`);
  const ornament = () => ornamentHtml(layout.theme, asset);
  const bleedArt = (r: Rect) => (bleed ? place(grow(r, layout.format, bleed)) + ";" : "");

  const pages = plan.map((planned): RenderedPage => {
    const fit = layout.fits[planned.key] ?? 1;
    const style = themeStyle(layout, fit, bleed);
    const classes = [`fb-page`, `fb-${planned.kind}`, `fb-${planned.side}`];
    if (planned.filler) classes.push("fb-filler");
    let inner = "";
    switch (planned.kind) {
      case "cover":
        if (book.coverImage && layout.cover) {
          inner = designedCover(book, layout, layout.cover, title, labels.series, bleedArt);
          classes.push("fb-cover-designed");
        } else {
          inner = cover(book, layout, title, labels.madeFor(book.childName), bleedArt, ornament);
          classes.push(`fb-cover-${layout.theme.cover}`);
        }
        break;
      case "back":
        inner = backCover(book, layout, title, body, bleedArt, ornament);
        break;
      case "dedication":
        inner = `<div class="fb-box fb-center" data-fit-box style="${place(paperRect(layout))}"><div class="fb-flow">
  <div class="fb-ornament">${ornament()}</div>
  <p class="fb-dedication-text" data-qa-text>${title(layout.dedication ?? labels.madeFor(book.childName))}</p></div></div>`;
        break;
      case "story": {
        const page = byPage.get(planned.story!)!;
        const state = layout.pages[String(planned.story)];
        if (state?.panels && page.frames?.length) {
          // Comic lettering is never hyphenated: a word that does not fit makes render QA shrink or shorten.
          inner = panelPage(planned.story!, page, state, layout, book.heroImage, (t) => escapeHtml(pageText(t)));
          classes.push("fb-panels");
        } else if (state?.noArt) {
          inner = vignette(page, layout, book.heroImage, body, ornament);
          classes.push("fb-no-art");
        } else {
          inner = story(planned, page, state, layout, body, bleedArt, ornament);
        }
        classes.push(`fb-v-${planned.variant}`);
        break;
      }
      case "talk":
        inner = `<div class="fb-box" data-fit-box style="${place(paperRect(layout))}"><div class="fb-flow">
  <h2 class="fb-heading" data-qa-text>${escapeHtml(labels.talk)}</h2>
  <ol class="fb-questions">${book.talkQuestions
    .map((q, i) => `<li><span class="fb-num" aria-hidden="true">${i + 1}.</span><span data-qa-text>${body(q)}</span></li>`)
    .join("")}</ol></div></div>`;
        break;
      case "photo":
        inner = photoPage(layout, asset, ornament, title);
        break;
      case "drawing":
        inner = `<h2 class="fb-drawing-title" data-qa-text>${escapeHtml(labels.drawingTitle)}</h2>
  <div class="fb-drawing-frame">${CRAYONS}</div><p class="fb-drawing-label" data-qa-text>${escapeHtml(labels.drawing)}</p>`;
        break;
      case "end":
        inner = `<div class="fb-box fb-center" data-fit-box style="${place(paperRect(layout))}"><div class="fb-flow">
  <div class="fb-ornament">${ornament()}</div>
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

/**
 * The parent's photo of the child in a frame in the theme's colors, its ornament above and the
 * caption below. The photo keeps its shape: it is scaled to the room the caption leaves.
 */
function photoPage(layout: BookLayout, asset: (path: string) => string, ornament: () => string, title: (t: string) => string): string {
  const photo = layout.photo!;
  const rect = paperRect(layout);
  const caption = photo.caption ? `<p class="fb-photo-caption" data-qa-text>${title(photo.caption)}</p>` : "";
  // Room for the ornament (12 mm + 4 mm), the frame's mat and border (~8 mm) and a caption.
  const maxH = rect.h - 16 - 8 - (caption ? 26 : 0);
  const maxW = rect.w - 8;
  const w = Math.min(maxW, maxH * photo.aspect);
  return `<div class="fb-box fb-center" data-fit-box style="${place(rect)}"><div class="fb-flow">
  <div class="fb-ornament">${ornament()}</div>
  <div class="fb-photo-frame"><img class="fb-photo" src="${escapeHtml(asset(photo.path))}" alt="" style="width:${mm(w)};height:${mm(w / photo.aspect)};object-fit:cover"></div>
  ${caption}</div></div>`;
}

function cover(
  book: RenderableBook,
  layout: BookLayout,
  title: (t: string) => string,
  madeFor: string,
  bleedArt: (r: Rect) => string,
  ornament: () => string,
): string {
  // On a scene cover the title goes where the theme's pictures leave calm space, not over a face.
  const atBottom = layout.theme.cover === "scene" && layout.theme.textSpace === "bottom";
  const heading = `<div class="fb-cover-title${atBottom ? " fb-at-bottom" : ""}" data-fit-box><div class="fb-flow">
  <h1 data-qa-text>${title(book.title ?? "")}</h1>
  <p class="fb-for" data-qa-text>${escapeHtml(madeFor)}</p></div></div>`;
  if (layout.theme.cover === "scene") {
    const { widthMm: w, heightMm: h, safeMm: s } = layout.format;
    if (book.heroImage) {
      // The hero's character sheet (drawn once for every book, on white) stands on the cover's own
      // sky, its white multiplied away, opposite the title: the cover never repeats a story page.
      const hero = atBottom ? { x: s, y: s, w: w - 2 * s, h: h * 0.62 - s } : { x: s, y: h * 0.36, w: w - 2 * s, h: h * 0.64 - s };
      // The theme's ornament on either side of the hero, like a printed frontispiece.
      const mid = hero.y + hero.h * 0.55;
      const flank = (x: number) => `<div class="fb-ornament fb-cover-ornament" style="left:${mm(x)};top:${mm(mid)}">${ornament()}</div>`;
      return `<div class="fb-cover-sky" style="${bleedArt({ x: 0, y: 0, w, h }) || "inset:0"}"></div>${flank(s + 4)}${flank(w - s - 26)}${image(book.heroImage, "fb-cover-hero", undefined, `${place(hero)};`)}${heading}`;
    }
    // A book without a character sheet (none so far) keeps its first picture.
    const first = book.pages[0];
    const state = layout.pages[String(first?.page)];
    return `${image(first?.image, "fb-art", crop(state, w / h), bleedArt({ x: 0, y: 0, w, h }))}${heading}`;
  }
  return `<div class="fb-hero-frame">${image(book.heroImage, "fb-hero")}</div>${heading}`;
}

/**
 * The designed front cover: the cover's own illustration (the hero in a scene from the story), the
 * child's name in big lettering in the theme's heading font - outlined and set at a slight tilt, like
 * hand lettering on a picture book - the rest of the title around it and a small subtitle. Where it
 * goes comes from the layout (chooseCover, from SAM's mask): over a calm band of the picture, or on a
 * band of the cover color with the picture beside it.
 */
function designedCover(
  book: RenderableBook,
  layout: BookLayout,
  cover: CoverLayout,
  title: (t: string) => string,
  series: string,
  bleedArt: (r: Rect) => string,
): string {
  const { format } = layout;
  const art = coverArtRect(format, cover);
  const rect = coverTextRect(format, cover.band);
  const position = objectPosition(cover.focus, cover.aspect, art.w / art.h);
  const picture = image(book.coverImage, "fb-cover-art", position, bleedArt(art) || `${place(art)};`);
  const bandRect = coverBandRect(format, cover.band);
  // The picture melts into the band instead of a hard edge.
  const seam: Rect = {
    top: { x: 0, y: art.y, w: format.widthMm, h: 14 },
    bottom: { x: 0, y: art.y + art.h - 14, w: format.widthMm, h: 14 },
    left: { x: art.x, y: 0, w: 14, h: format.heightMm },
    right: { x: art.x + art.w - 14, y: 0, w: 14, h: format.heightMm },
  }[cover.band];
  const band =
    cover.mode === "banner"
      ? `<div class="fb-cover-band" style="${bleedArt(bandRect) || place(bandRect)}"></div><div class="fb-cover-seam fb-${cover.band}" style="${bleedArt(seam) || place(seam)}"></div>`
      : "";
  const parts = splitTitle(book.title ?? "", book.childName);
  // The name as big as the theme's title allows, but never wider than the box: about 0.56 em a letter.
  const nameMm = coverNameMm(rect, formatTypeScale(layout.theme, layout.ageGroup, format).titlePt, parts.name);
  const line = (text: string, cls: string) => (text ? `<p class="${cls}" data-qa-text>${title(text)}</p>` : "");
  const ink = cover.mode === "banner" ? "band" : cover.ink;
  return `${picture}${band}<div class="fb-cover-letters fb-${cover.band} fb-letters-${ink}" data-fit-box data-cover-text style="${place(rect)}"><div class="fb-flow">
  ${line(parts.before, "fb-cover-line")}
  <h1 class="fb-cover-name" data-qa-text data-testid="cover-name" style="font-size:calc(${mm(nameMm)} * var(--fit))">${title(parts.name)}</h1>
  ${line(parts.after, "fb-cover-line")}
  <p class="fb-cover-sub" data-qa-text>${escapeHtml(series)}</p></div></div>`;
}

/**
 * The back cover: the title, the story's two sentences (the blurb), the hero's character sheet small
 * on the cover color, and the Fabulka mark at the foot.
 */
function backCover(
  book: RenderableBook,
  layout: BookLayout,
  title: (t: string) => string,
  body: (t: string) => string,
  bleedArt: (r: Rect) => string,
  ornament: () => string,
): string {
  const { widthMm: w, heightMm: h } = layout.format;
  const rect = paperRect(layout);
  const box = { ...rect, h: rect.h - 14 };
  // The story's last picture in a round frame (the happy ending), else the hero's sheet, else the ornament.
  const last = [...book.pages]
    .reverse()
    .map((p) => [...(p.frames ?? [])].reverse().find((f) => f.image)?.image ?? p.image)
    .find(Boolean);
  const side = Math.min(rect.w, rect.h) * 0.36;
  const hero = last
    ? `<div class="fb-back-frame" style="width:${mm(side)};height:${mm(side)}"><img class="fb-back-art" src="${escapeHtml(last)}" alt=""></div>`
    : book.heroImage
      ? `<img class="fb-back-hero" src="${escapeHtml(book.heroImage)}" alt="">`
      : `<div class="fb-ornament">${ornament()}</div>`;
  const blurb = book.blurb ? `<p class="fb-blurb" data-qa-text>${body(book.blurb)}</p>` : "";
  return `<div class="fb-back-sky" style="${bleedArt({ x: 0, y: 0, w, h }) || "inset:0"}"></div>
<div class="fb-box fb-center" data-fit-box style="${place(box)}"><div class="fb-flow">
  ${hero}
  <p class="fb-back-title" data-qa-text>${title(book.title ?? "")}</p>
  ${blurb}</div></div>
<div class="fb-back-mark" style="bottom:calc(var(--safe) + 2mm)">${FABULKA_MARK}<span data-qa-text>Fabulka</span></div>`;
}

/** The Fabulka mark: a little open book with a face, drawn so it never depends on a font. */
const FABULKA_MARK =
  '<svg viewBox="0 0 32 24" width="9mm" height="6.75mm" aria-hidden="true"><path d="M16 5C12 2 6 2 2 3v17c4-1 10-1 14 2 4-3 10-3 14-2V3c-4-1-10-1-14 2z" fill="currentColor"/><path d="M16 5v17" stroke="#fff" stroke-width="1.2"/><circle cx="10" cy="11" r="1.3" fill="#fff"/><circle cx="22" cy="11" r="1.3" fill="#fff"/><path d="M11 15c3 2 7 2 10 0" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';

/**
 * A story page whose picture Muse Image refused in every version (PageLayout.noArt): a vignette page
 * in the theme's colors. The hero's character sheet (drawn on white for every book) stands small on
 * the paper, its white multiplied away as on the scene cover, and the text sits below it where a
 * plate would - so the book still has a picture on every page and keeps its rhythm. Without a sheet
 * the theme's ornament stands in.
 */
function vignette(
  page: RenderablePage,
  layout: BookLayout,
  heroImage: string | null,
  body: (t: string) => string,
  ornament: () => string,
): string {
  const { safeMm: s } = layout.format;
  const rect = textRect("plate", layout.format, { plateBand: "bottom" });
  const art: Rect = { x: rect.x, y: s + 6, w: rect.w, h: rect.y - s - 12 };
  const picture = heroImage
    ? image(heroImage, "fb-vignette", undefined, `${place(art)};`)
    : `<div class="fb-ornament fb-vignette-ornament" style="${place(art)}">${ornament()}</div>`;
  return `${picture}<div class="fb-box fb-text fb-on-paper fb-center fb-top" data-fit-box style="${place(rect)}"><div class="fb-flow"><p data-qa-text>${body(page.text)}</p></div></div>`;
}

/**
 * A panel page: each frame in its box with an ink border, its picture cropped to keep SAM's figures
 * in view (or the hero's sheet small on paper when every version of it was refused), and its texts
 * where the layout placed them, measured inside the border - balloons (an SVG ellipse or box and its
 * tail, ink stroke under a paper fill, so a balloon and its tail read as one shape; it may stand out
 * over the border), caption boxes and sound effects. Every text is a fit box render QA measures;
 * `data-el` names it, so the one that overflows can be shortened.
 */
function panelPage(
  number: number,
  page: RenderablePage,
  state: PageLayout,
  layout: BookLayout,
  heroImage: string | null,
  body: (t: string) => string,
): string {
  const gutter = layout.panels?.gutterMm ?? 3;
  const border = layout.panels?.borderMm ?? 0.8;
  return (page.frames ?? [])
    .map((frame) => {
      const outer = frameBox(layout.format, frame.rect, gutter);
      const box = frameInner(outer, border);
      const crop = state.frames[String(frame.frame)];
      const position = crop ? objectPosition(crop.focus, crop.aspect, box.w / box.h) : undefined;
      const picture = frame.image
        ? image(frame.image, "fb-art", position)
        : heroImage
          ? image(heroImage, "fb-vignette fb-panel-vignette", undefined, "left:15%;top:10%;width:70%;height:80%;")
          : "";
      const placed = state.balloons.filter((b) => b.frame === frame.frame);
      const texts = new Map((page.texts ?? []).map((t) => [t.id, t]));
      const shapes = placed.filter((b) => b.kind === "speech").map((b) => balloonShape(b, box));
      const svg = shapes.length
        ? `<svg class="fb-balloons" viewBox="0 0 ${round(box.w)} ${round(box.h)}" preserveAspectRatio="none" aria-hidden="true"><g class="fb-balloon-ink">${shapes.join("")}</g><g class="fb-balloon-fill">${shapes.join("")}</g></svg>`
        : "";
      const letters = placed
        .map((b) => {
          const text = texts.get(b.id);
          if (!text) return "";
          const r: Rect = { x: b.box.x * box.w, y: b.box.y * box.h, w: b.box.w * box.w, h: b.box.h * box.h };
          const el = ` data-el="${number}:${escapeHtml(b.id)}"`;
          const size = `font-size:calc(${b.pt}pt * var(--fit))`;
          if (b.kind === "speech") {
            const inner = letteringBox(b.shape, r, b.pt);
            return `<div class="fb-box fb-say" data-fit-box${el} style="${place(inner)};${size}"><div class="fb-flow"><p data-qa-text>${body(text.text)}</p></div></div>`;
          }
          if (b.kind === "sfx") {
            return `<div class="fb-box fb-sfx" data-fit-box${el} style="${place(r)};${size};transform:rotate(${b.rotate}deg)"><div class="fb-flow"><p data-qa-text>${body(text.text)}</p></div></div>`;
          }
          return `<div class="fb-box fb-caption${b.kind === "narration" ? " fb-caption-wide" : ""}" data-fit-box${el} style="${place(r)};${size}"><div class="fb-flow"><p data-qa-text>${body(text.text)}</p></div></div>`;
        })
        .join("");
      return `<div class="fb-panel" data-frame="${frame.frame}" style="${place(outer)};border-width:${mm(border)}">${picture}${svg}${letters}</div>`;
    })
    .join("");
}

/** A balloon (an ellipse, a rounded box or a caption box) and its tail toward the speaker, in the frame's millimetres. */
function balloonShape(b: PlacedText, box: Rect): string {
  const rx = (b.box.w * box.w) / 2;
  const ry = (b.box.h * box.h) / 2;
  const cx = b.box.x * box.w + rx;
  const cy = b.box.y * box.h + ry;
  let tail = "";
  if (b.tail) {
    const tx = b.tail.x * box.w;
    const ty = b.tail.y * box.h;
    const angle = Math.atan2(ty - cy, tx - cx);
    const bx = cx + Math.cos(angle) * rx * 0.6;
    const by = cy + Math.sin(angle) * ry * 0.6;
    const half = Math.min(rx, ry) * 0.32;
    const px = -Math.sin(angle) * half;
    const py = Math.cos(angle) * half;
    tail = `<path d="M${round(bx + px)},${round(by + py)} L${round(tx)},${round(ty)} L${round(bx - px)},${round(by - py)} Z"/>`;
  }
  if (b.shape === "ellipse") return `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(rx)}" ry="${round(ry)}"/>${tail}`;
  // A box's corners round like a balloon's; a caption box keeps them square.
  const corner = b.shape === "box" ? Math.min(ry, rx, b.pt * 0.25) : 0.4;
  return `<rect x="${round(cx - rx)}" y="${round(cy - ry)}" width="${round(rx * 2)}" height="${round(ry * 2)}" rx="${round(corner)}"/>${tail}`;
}

const round = (n: number) => Math.round(n * 100) / 100;

function story(
  planned: PlannedPage,
  page: RenderablePage,
  state: PageLayout | undefined,
  layout: BookLayout,
  body: (t: string) => string,
  bleedArt: (r: Rect) => string,
  ornament: () => string,
): string {
  const variant = planned.variant as PageVariant;
  const ink = state?.ink?.[variant] ?? "dark";
  const text = (rect: Rect, cls = "", style = "") =>
    `<div class="fb-box fb-text fb-ink-${ink} ${cls}" data-fit-box style="${place(rect)}${style}"><div class="fb-flow"><p data-qa-text>${body(page.text)}</p></div></div>`;
  // Text over the picture, set off from it as the theme says (the box itself stays where it is).
  const over = (rect: Rect, anchor: "top" | "bottom", gutter?: "left" | "right") => {
    const set = overText(layout, rect, anchor, gutter);
    return text(rect, set.cls ? `fb-${anchor} ${set.cls}` : `fb-${anchor}`, set.style);
  };
  const box = artRect(variant, layout.format);
  const art = (cls = "fb-art", style = "") => image(page.image, cls, crop(state, box.w / box.h), style);
  const rect = textRect(variant, layout.format, state);
  const full = bleedArt(box);
  switch (variant) {
    case "overlay-top":
    case "overlay-bottom":
      return art("fb-art", full) + over(rect, variant === "overlay-top" ? "top" : "bottom");
    case "split":
      return art("fb-art", full || `${place(box)};`) + text(rect, "fb-on-paper");
    case "facing":
      if (planned.part === 0) return art("fb-art", full);
      return `<div class="fb-ornament fb-facing-ornament">${ornament()}</div>${text(rect, "fb-on-paper fb-center")}`;
    case "spread": {
      const left = planned.part === 0;
      const side = state?.spreadSide ?? "right";
      const shifted = { ...box, x: left ? 0 : -layout.format.widthMm };
      const pic = art("fb-art fb-spread-art", bleedArt(shifted) || (left ? "left:0" : "left:-100%"));
      // The fold is on the right of the left page and on the left of the right one.
      return pic + ((left ? "left" : "right") === side ? over(rect, "bottom", left ? "right" : "left") : "");
    }
    case "plate":
      return art("fb-art", full) + text(rect, `fb-plate ${state?.plateBand === "top" ? "fb-top" : "fb-bottom"}`);
  }
}

/** How far the fade runs from its solid part into the picture, beyond the text (mm). */
const FADE_MM = 16;

/**
 * The class and box style that set text over a picture off from it (BookTheme.overlayStyle). The
 * plate and the fade are drawn by the text's flow (::before) outside the text box, which keeps its
 * place and size, so render QA measures the text exactly as without them. The fade reaches the page
 * edges (into the bleed) on every side but the one it fades out on, and a spread's fold (`gutter`),
 * where it thins out. "none" adds nothing: the page renders as before the setting.
 */
function overText(layout: BookLayout, rect: Rect, anchor: "top" | "bottom", gutter?: "left" | "right"): { cls: string; style: string } {
  const style = layout.theme.overlayStyle ?? "none";
  if (style === "none") return { cls: "", style: "" };
  if (style !== "fade") return { cls: "fb-over-plate", style: "" };
  const { widthMm: w, heightMm: h, bleedMm: bleed } = layout.format;
  const top = anchor === "top" ? rect.y + bleed : FADE_MM;
  const bottom = anchor === "bottom" ? h - rect.y - rect.h + bleed : FADE_MM;
  const left = rect.x + (gutter === "left" ? 0 : bleed);
  const right = w - rect.x - rect.w + (gutter === "right" ? 0 : bleed);
  const reach = [top, right, bottom, left].map((n) => `-${mm(n)}`).join(" ");
  return { cls: `fb-over-fade${gutter ? ` fb-gutter-${gutter}` : ""}`, style: `;--over:${reach}` };
}

const ORNAMENT_SVG: Record<BookTheme["ornament"], string> = {
  leaf: '<path d="M12 22c-.8-3.6-4.6-5.8-8-5.8C4 9.6 7.6 4.4 12 2c4.4 2.4 8 7.6 8 14.2-3.4 0-7.2 2.2-8 5.8z"/><path d="M12 6v14" stroke="#fff" stroke-opacity=".55" stroke-width="1" fill="none"/>',
  star: '<path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 17.4l-6.2 3.8 1.6-7L2 9.5l7.1-.6z"/>',
  flower: '<circle cx="12" cy="6" r="4"/><circle cx="17.7" cy="10.1" r="4"/><circle cx="15.5" cy="16.9" r="4"/><circle cx="8.5" cy="16.9" r="4"/><circle cx="6.3" cy="10.1" r="4"/><circle cx="12" cy="12" r="3" fill="#fff" fill-opacity=".7"/>',
  sparkle: '<path d="M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z"/>',
};

/**
 * The theme's ornament: an AI theme's drawn one (multiplied onto the paper, so a white background
 * the image model could not make transparent disappears), else the SVG shape in the accent color.
 */
/** Two crayons and a doodled sun in a drawing page's corner, so the empty frame reads as an invitation. */
const CRAYONS = `<svg class="fb-crayons" viewBox="0 0 100 70" aria-hidden="true">
<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".55">
<circle cx="22" cy="20" r="9"/><path d="M22 4v4M22 32v4M6 20h4M34 20h4M10.7 8.7l2.8 2.8M30.5 28.5l2.8 2.8M10.7 31.3l2.8-2.8M30.5 11.5l2.8-2.8"/></g>
<g transform="rotate(-28 70 45)"><rect x="40" y="38" width="48" height="10" rx="2" fill="currentColor"/><path d="M40 38 30 43 40 48z" fill="#f3d9b1"/><path d="M33.5 41.3 30 43l3.5 1.7z" fill="currentColor"/></g>
<g transform="rotate(-8 72 60)"><rect x="46" y="55" width="44" height="9" rx="2" fill="#6aa6c9"/><path d="M46 55 37 59.5 46 64z" fill="#f3d9b1"/><path d="M40 58 37 59.5 40 61z" fill="#6aa6c9"/></g>
</svg>`;

function ornamentHtml(theme: BookTheme, asset: (path: string) => string): string {
  if (theme.ornamentImage) return `<img class="fb-ornament-img" src="${escapeHtml(asset(theme.ornamentImage))}" alt="">`;
  return `<svg viewBox="0 0 24 24" width="12mm" height="12mm" fill="currentColor" aria-hidden="true">${ORNAMENT_SVG[theme.ornament]}</svg>`;
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

/**
 * Escaped text with optional marks. Body text (`isBody`) gets soft hyphens and is tidied by pageText,
 * keeping its intended line breaks for the CSS's pre-line.
 */
function inline(raw: string, options: RenderOptions, isBody: boolean): string {
  const text = isBody ? pageText(raw) : raw;
  const fix = (t: string) => escapeHtml(isBody && options.hyphenate ? options.hyphenate(t) : t);
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
/* Story text keeps its intended line breaks (a caption, then lines of dialogue); render QA measures it so. */
.fb-text p { font-size: calc(var(--body-size) * var(--fit)); line-height: var(--line); white-space: pre-line; }
.fb-vignette { position: absolute; object-fit: contain; mix-blend-mode: multiply; }
.fb-vignette-ornament { position: absolute; display: flex; align-items: center; justify-content: center; margin: 0; }
.fb-ink-dark { color: var(--ink); text-shadow: 0 0 1.2mm rgba(255,255,255,.85), 0 0 .4mm rgba(255,255,255,.9); }
.fb-ink-light { color: #fff; text-shadow: 0 0 1.4mm rgba(0,0,0,.6), 0 0 .4mm rgba(0,0,0,.5); }
.fb-on-paper { color: var(--ink); text-shadow: none; }
.fb-plate { color: var(--ink); text-shadow: none; }
.fb-plate .fb-flow { background: color-mix(in srgb, var(--plate) 90%, transparent); border-radius: 5mm; padding: 4mm 5mm;
  box-shadow: 0 .6mm 2.4mm rgba(0,0,0,.12); }
/* Text over a picture set off from it (the theme's overlayStyle): drawn by the flow's ::before outside
   the text box, so the box and what render QA measures stay as they are; the clip keeps the old
   overflow clipping a little way out, around the plate or the fade. Ink on the theme's own paper
   color, so it reads on light and dark themes alike. */
.fb-over-plate, .fb-over-fade { color: var(--ink); overflow: visible; }
.fb-over-plate .fb-flow, .fb-over-fade .fb-flow { position: relative; isolation: isolate; }
.fb-over-plate .fb-flow::before, .fb-over-fade .fb-flow::before { content: ""; position: absolute; z-index: -1; pointer-events: none; }
.fb-over-plate { text-shadow: none; clip-path: inset(-7mm -8mm); }
.fb-over-plate .fb-flow::before { inset: -4mm -5mm; border-radius: 5mm; background: color-mix(in srgb, var(--plate) 88%, transparent);
  box-shadow: 0 .6mm 2.4mm rgba(0,0,0,.12), 0 0 0 .25mm color-mix(in srgb, var(--ink) 6%, transparent); }
.fb-over-fade { text-shadow: 0 0 .8mm color-mix(in srgb, var(--paper) 80%, transparent); clip-path: inset(var(--over));
  --fade: color-mix(in srgb, var(--paper) 92%, transparent) 0, color-mix(in srgb, var(--paper) 86%, transparent) calc(100% - ${FADE_MM}mm),
    color-mix(in srgb, var(--paper) 55%, transparent) calc(100% - ${FADE_MM * 0.55}mm),
    color-mix(in srgb, var(--paper) 18%, transparent) calc(100% - ${FADE_MM * 0.2}mm), transparent 100%; }
.fb-over-fade .fb-flow::before { inset: var(--over); background: linear-gradient(to top, var(--fade)); }
.fb-over-fade.fb-top .fb-flow::before { background: linear-gradient(to bottom, var(--fade)); }
.fb-over-fade.fb-gutter-left .fb-flow::before { -webkit-mask-image: linear-gradient(to right, transparent, #000 10mm);
  mask-image: linear-gradient(to right, transparent, #000 10mm); }
.fb-over-fade.fb-gutter-right .fb-flow::before { -webkit-mask-image: linear-gradient(to left, transparent, #000 10mm);
  mask-image: linear-gradient(to left, transparent, #000 10mm); }
.fb-ornament { color: var(--accent); line-height: 0; margin-bottom: 4mm; text-align: center; }
.fb-ornament svg { display: inline-block; }
.fb-ornament .fb-ornament-img { display: inline-block; width: 22mm; height: 22mm; object-fit: contain; mix-blend-mode: multiply; }
.fb-facing-ornament { position: absolute; left: 0; right: 0; top: calc(var(--safe) + 4mm); }
.fb-folio { position: absolute; bottom: 5mm; font-size: 9pt; line-height: 1; color: var(--muted); }
.fb-left .fb-folio { left: 9mm; }
.fb-right .fb-folio { right: 9mm; }
.fb-heading, .fb-cover-title h1, .fb-end-title, .fb-dedication-text { font-family: var(--heading); font-weight: var(--heading-weight); }
.fb-heading { font-size: calc(var(--heading-size) * var(--fit)); line-height: 1.15; margin-bottom: 7mm; color: var(--ink); }
.fb-questions { list-style: none; }
.fb-questions li { display: flex; gap: 2.5mm; margin-bottom: 4mm; line-height: 1.35; }
/* The numbers are drawn here, in the body font with lining figures, not as list markers: a marker
   sat outside the text box (clipped) and took whatever font the list had, e.g. a heading font whose
   "1" reads as "l". */
.fb-num { flex: none; min-width: 1.4em; font-family: var(--body); font-weight: 700; color: var(--ink);
  font-variant-numeric: lining-nums tabular-nums; }
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
.fb-cover-framed .fb-cover-title h1 { color: var(--cover-ink); }
.fb-cover-framed .fb-for { color: var(--cover-ink); opacity: .8; }
.fb-cover-framed .fb-cover-title { top: calc(var(--safe) + 128mm); bottom: var(--safe); }
.fb-cover-sky { position: absolute; background: radial-gradient(ellipse 75% 65% at 50% 50%, var(--paper) 0%, var(--cover) 72%); }
.fb-cover-hero { position: absolute; object-fit: contain; mix-blend-mode: multiply; }
.fb-cover-ornament { position: absolute; width: 22mm; margin: 0; opacity: .75; transform: translateY(-50%); }
.fb-cover-scene .fb-cover-title { top: var(--safe); max-height: 46%; }
.fb-cover-scene .fb-cover-title.fb-at-bottom { top: auto; bottom: var(--safe); }
.fb-cover-scene .fb-cover-title .fb-flow { background: color-mix(in srgb, var(--plate) 88%, transparent); border-radius: 6mm;
  padding: 5mm 6mm; box-shadow: 0 .8mm 3mm rgba(0,0,0,.15); }
.fb-cover-designed { background: var(--cover); }
.fb-cover-art { position: absolute; object-fit: cover; }
.fb-cover-band { position: absolute; background: var(--cover); }
.fb-cover-seam { position: absolute; background: linear-gradient(to bottom, var(--cover), transparent); }
.fb-cover-seam.fb-bottom { background: linear-gradient(to top, var(--cover), transparent); }
.fb-cover-seam.fb-left { background: linear-gradient(to right, var(--cover), transparent); }
.fb-cover-seam.fb-right { background: linear-gradient(to left, var(--cover), transparent); }
.fb-cover-letters { position: absolute; display: flex; flex-direction: column; justify-content: center; text-align: center; overflow: hidden;
  --outline: var(--paper); }
.fb-cover-letters.fb-top { justify-content: flex-start; }
.fb-cover-letters.fb-bottom { justify-content: flex-end; }
.fb-cover-name { font-family: var(--heading); font-weight: var(--heading-weight); line-height: 1.04; color: var(--accent);
  margin: 1.5mm 0 2mm; transform: rotate(-2.5deg); letter-spacing: .01em; overflow-wrap: anywhere;
  text-shadow: .55mm 0 0 var(--outline), -.55mm 0 0 var(--outline), 0 .55mm 0 var(--outline), 0 -.55mm 0 var(--outline),
    .4mm .4mm 0 var(--outline), -.4mm .4mm 0 var(--outline), .4mm -.4mm 0 var(--outline), -.4mm -.4mm 0 var(--outline),
    0 1.4mm 1.2mm rgba(0,0,0,.22); }
.fb-cover-line { font-family: var(--heading); font-weight: var(--heading-weight); font-size: calc(var(--title-size) * .72 * var(--fit));
  line-height: 1.14; color: var(--ink); }
.fb-cover-sub { margin-top: 2.5mm; font-size: calc(9.5pt * var(--fit)); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--ink); }
/* Over the picture the lines sit in a soft halo of the paper color: readable on leaves and sky alike. */
.fb-letters-dark .fb-cover-line, .fb-letters-dark .fb-cover-sub { text-shadow: 0 0 .4mm var(--paper), 0 0 1mm var(--paper), 0 0 2mm var(--paper),
  0 0 3.2mm var(--paper), 0 0 4.5mm color-mix(in srgb, var(--paper) 80%, transparent); }
.fb-letters-light { --outline: var(--ink); }
.fb-letters-light .fb-cover-name { color: var(--paper); }
.fb-letters-light .fb-cover-line, .fb-letters-light .fb-cover-sub { color: #fff; text-shadow: 0 0 .4mm rgba(0,0,0,.6), 0 0 1.2mm rgba(0,0,0,.55),
  0 0 2.6mm rgba(0,0,0,.45), 0 0 4mm rgba(0,0,0,.3); }
.fb-letters-band .fb-cover-line, .fb-letters-band .fb-cover-sub { color: var(--cover-ink); }
.fb-back { background: var(--cover); }
.fb-back-sky { position: absolute; background: radial-gradient(ellipse 80% 70% at 50% 40%, var(--paper) 0%, var(--cover) 75%); }
.fb-back-frame { display: inline-block; border-radius: 50%; overflow: hidden; border: 1.2mm solid var(--paper);
  box-shadow: 0 0 0 .6mm var(--accent), 0 1mm 3mm rgba(0,0,0,.18); margin-bottom: 6mm; }
.fb-back-art { width: 100%; height: 100%; object-fit: cover; }
.fb-back-hero { display: inline-block; width: 38%; max-height: 42mm; object-fit: contain; mix-blend-mode: multiply; margin-bottom: 4mm; }
.fb-back-title { font-family: var(--heading); font-weight: var(--heading-weight); font-size: calc(var(--heading-size) * var(--fit));
  line-height: 1.15; color: var(--cover-ink); margin-bottom: 4mm; }
.fb-blurb { font-size: calc(var(--body-size) * var(--fit)); line-height: var(--line); color: var(--cover-ink); }
.fb-back-mark { position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 2mm;
  color: var(--accent); font-family: var(--heading); font-weight: var(--heading-weight); font-size: 12pt; line-height: 1; }
.fb-wrap { position: relative; overflow: hidden; background: var(--cover, #fff); }
.fb-wrap-panel { position: absolute; top: 0; }
.fb-spine { background: var(--cover); }
.fb-spine-band { position: absolute; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.fb-spine-text { writing-mode: vertical-rl; white-space: nowrap; font-family: var(--heading); font-weight: var(--heading-weight);
  line-height: 1; color: var(--cover-ink); max-height: 92%; overflow: hidden; text-overflow: ellipsis; }
.fb-spine-up { transform: rotate(180deg); }
.fb-spine-dot { margin: 1.5mm 0; color: var(--accent); }
.fb-photo-frame { display: inline-block; padding: 3mm; background: #fff; border: .7mm solid var(--accent); border-radius: 4mm;
  box-shadow: 0 .8mm 3mm rgba(0,0,0,.14); line-height: 0; }
.fb-photo { display: block; border-radius: 2mm; }
.fb-photo-caption { margin-top: 5mm; font-family: var(--heading); font-weight: var(--heading-weight);
  font-size: calc(var(--heading-size) * .8 * var(--fit)); line-height: 1.25; color: var(--ink); }
.fb-drawing-title { position: absolute; left: var(--safe); right: var(--safe); top: calc(var(--safe) + 2mm); text-align: center;
  font-family: var(--heading); font-weight: var(--heading-weight); font-size: var(--heading-size); line-height: 1.15; color: var(--ink); }
.fb-drawing-frame { position: absolute; inset: calc(var(--safe) + 4mm); top: calc(var(--safe) + 20mm); bottom: calc(var(--safe) + 16mm);
  border: .6mm dashed color-mix(in srgb, var(--muted) 60%, transparent); border-radius: 6mm; }
.fb-crayons { position: absolute; right: 5mm; bottom: 5mm; width: 42mm; height: auto; color: var(--accent); }
.fb-drawing-label { position: absolute; left: var(--safe); right: var(--safe); bottom: calc(var(--safe) + 2mm); text-align: center;
  font-size: 11pt; color: var(--muted); }
/* Panel pages: frames with an ink border, balloons (an ink stroke under a paper fill), caption boxes, sound effects. */
.fb-panels { background: var(--paper); }
.fb-panel { position: absolute; overflow: visible; border-style: solid; border-color: var(--ink); background: color-mix(in srgb, var(--muted) 18%, var(--paper)); }
.fb-panel .fb-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fb-panel-vignette { position: absolute; object-fit: contain; mix-blend-mode: multiply; }
.fb-balloons { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.fb-balloon-ink { fill: var(--ink); stroke: var(--ink); stroke-width: 1.2; stroke-linejoin: round; }
.fb-balloon-fill { fill: #fff; }
.fb-say, .fb-caption, .fb-sfx { font-family: var(--letter); font-weight: var(--letter-weight); text-transform: uppercase; color: var(--ink);
  text-align: center; line-height: 1.16; letter-spacing: .01em; }
.fb-say p, .fb-caption p, .fb-sfx p { font-size: inherit; line-height: inherit; }
.fb-say { align-items: stretch; }
.fb-caption { background: var(--plate); border: .5mm solid var(--ink); text-align: left; justify-content: center; }
.fb-caption .fb-flow { padding: .3em .55em; }
.fb-caption-wide { text-align: center; }
.fb-sfx { font-family: var(--heading); font-weight: var(--heading-weight); color: var(--accent); -webkit-text-stroke: .35mm var(--ink);
  paint-order: stroke fill; letter-spacing: .03em; font-style: italic; overflow: visible; }
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
  meta: {
    title: string;
    language: Language;
    fontCss: string;
    format: BookLayout["format"];
    label: string;
    /** The cover wrap (renderCoverWrap): printed first; the covers then leave the inside pages. */
    wrap?: { html: string; spec: CoverWrap };
  },
): string {
  const { format } = meta;
  const b = format.bleedMm;
  const s = PRINT_SLUG_MM;
  const sheet = printPageSize(format);
  const marks = cropMarks(s + b, s + b, format.widthMm, format.heightMm, b);
  const pages = meta.wrap ? interiorPages(rendered.pages) : rendered.pages;
  const total = pages.length + (meta.wrap ? 1 : 0);
  const sheets = pages.map(
    (p, i) => `<div class="fb-sheet" data-key="${p.key}">
<div class="fb-sheet-page">${p.html}</div>
<svg class="fb-marks" viewBox="0 0 ${sheet.widthMm} ${sheet.heightMm}" width="${sheet.widthMm}mm" height="${sheet.heightMm}mm">${marks}</svg>
<div class="fb-slug" style="left:${s + b}mm">${escapeHtml(meta.label)} · ${i + 1 + (meta.wrap ? 1 : 0)}/${total} · ${p.key}</div>
</div>`,
  );
  let wrapCss = "";
  if (meta.wrap) {
    const { spec, html } = meta.wrap;
    const m = spec.marginMm;
    const size = wrapSheetSize(spec);
    const x0 = s + m;
    const y0 = s + m;
    // Crop marks at the wrap's corners; fold marks above and below every line the cover bends on.
    const folds = [spec.back.x + spec.back.w, spec.spine.x, spec.spine.x + spec.spine.w, spec.front.x]
      .filter((x, i, all) => all.indexOf(x) === i)
      .map((x) => x0 + x);
    const fold = folds
      .map((x) => markLine(x, y0 - m - MARK_GAP_MM - MARK_MM, x, y0 - m - MARK_GAP_MM) + markLine(x, y0 + spec.heightMm + m + MARK_GAP_MM, x, y0 + spec.heightMm + m + MARK_GAP_MM + MARK_MM))
      .join("");
    sheets.unshift(`<div class="fb-sheet fb-wrap-sheet" data-key="wrap">
<div class="fb-sheet-page">${html}</div>
<svg class="fb-marks" viewBox="0 0 ${size.widthMm} ${size.heightMm}" width="${size.widthMm}mm" height="${size.heightMm}mm">${cropMarks(x0, y0, spec.widthMm, spec.heightMm, m)}${fold}</svg>
<div class="fb-slug" style="left:${x0}mm">${escapeHtml(meta.label)} · 1/${total} · cover wrap, ${spec.binding}, spine ${spec.spineMm} mm</div>
</div>`);
    wrapCss = `@page fbwrap { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }
.fb-wrap-sheet { page: fbwrap; width: ${size.widthMm}mm; height: ${size.heightMm}mm; }`;
  }
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
.fb-slug { position: absolute; bottom: 2mm; font: 6pt/1 sans-serif; color: #000; }
${wrapCss}
</style>
</head>
<body>
${sheets.join("\n")}
</body>
</html>`;
}

const markLine = (xa: number, ya: number, xb: number, yb: number) =>
  `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#000" stroke-width="0.25"/>`;

/** Crop marks at the corners of a trim box (top left x0, y0) whose bleed is `bleed` wide. */
function cropMarks(x0: number, y0: number, w: number, h: number, bleed: number): string {
  const x1 = x0 + w;
  const y1 = y0 + h;
  const out = bleed + MARK_GAP_MM;
  return [
    // Horizontal marks on the trim lines, left and right of the bleed.
    markLine(x0 - out - MARK_MM, y0, x0 - out, y0),
    markLine(x1 + out, y0, x1 + out + MARK_MM, y0),
    markLine(x0 - out - MARK_MM, y1, x0 - out, y1),
    markLine(x1 + out, y1, x1 + out + MARK_MM, y1),
    // Vertical marks on the trim lines, above and below the bleed.
    markLine(x0, y0 - out - MARK_MM, x0, y0 - out),
    markLine(x1, y0 - out - MARK_MM, x1, y0 - out),
    markLine(x0, y1 + out, x0, y1 + out + MARK_MM),
    markLine(x1, y1 + out, x1, y1 + out + MARK_MM),
  ].join("");
}

/** The wrap's sheet in the print file: the wrap, its bleed or turn-in, and the slug for the marks. */
export function wrapSheetSize(wrap: CoverWrap): { widthMm: number; heightMm: number } {
  const extra = 2 * (wrap.marginMm + PRINT_SLUG_MM);
  return { widthMm: wrap.widthMm + extra, heightMm: wrap.heightMm + extra };
}

/**
 * The outside of the printed book on one sheet: the back and the front cover drawn at the wrap's
 * panel size (the page, or a hardcover's board) with their bleed or turn-in, and the spine between
 * them in the cover color, lettered with the name and title when it is wide enough (SPINE_TEXT_MIN_MM).
 */
export function renderCoverWrap(book: RenderableBook, layout: BookLayout, wrap: CoverWrap, options: RenderOptions = {}): string {
  const panelLayout: BookLayout = { ...layout, format: wrap.panel };
  const rendered = renderBook(book, panelLayout, { ...options, bleed: true });
  const front = rendered.pages.find((p) => p.kind === "cover");
  const back = rendered.pages.find((p) => p.kind === "back");
  const m = wrap.marginMm;
  const labels = BOOK_LABELS[book.language];
  // The spine element runs from the back board to the front board (hinges included) over the panels' bleed.
  const left = wrap.back.x + wrap.back.w;
  const width = wrap.front.x - left;
  const fontMm = Math.min(wrap.spineMm * 0.5, 4.2);
  const text = wrap.spineText
    ? `<div class="fb-spine-text${labels.spineUp ? " fb-spine-up" : ""}" data-testid="spine-text" style="font-size:${mm(fontMm)}">${escapeHtml(book.childName)}<span class="fb-spine-dot">·</span>${escapeHtml(book.title ?? "")}</div>`
    : "";
  return `<div class="fb-wrap" style="width:${mm(wrap.widthMm + 2 * m)};height:${mm(wrap.heightMm + 2 * m)}">
<div class="fb-wrap-panel" style="left:${mm(wrap.back.x)}">${back?.html ?? ""}</div>
<div class="fb-wrap-panel" style="left:${mm(wrap.front.x)}">${front?.html ?? ""}</div>
<section class="fb-page fb-spine" data-key="spine" style="${themeStyle(panelLayout, 1, 0)};position:absolute;left:${mm(m + left)};top:0;width:${mm(width)};height:${mm(wrap.heightMm + 2 * m)}">
<div class="fb-spine-band" style="left:${mm(wrap.spine.x - left)};width:${mm(wrap.spine.w)};top:${mm(m)};height:${mm(wrap.heightMm)}">${text}</div>
</section></div>`;
}
