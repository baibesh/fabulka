import { z } from "zod";
import type { BookLayout, BookTheme, Focus, PageLayout, PageVariant } from "./model";
import { type Rect, artRect, textRect } from "./plan";
import { blankPage, formatTypeScale } from "./themes";

/**
 * Image-aware page layouts. SAM finds the hero once per illustration (a coarse mask), Chromium
 * measures how light and how busy each part of the picture is, and for every page the chooser keeps
 * the theme's layouts whose text fits, does not cover the hero and reads clearly against what is
 * under it; else the plate. All of it is pure, so the API, the tests and the site agree.
 */

/** Cells per side of the mask and tone grids. */
export const GRID = 24;

/** Where SAM found the hero in a picture: its box (0..1) and a GRID×GRID mask as hex bits. */
export const PageSubjectSchema = z.object({
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
  /** Row-major bits, 4 per hex digit; "" with no box (SAM found nobody). */
  grid: z.string(),
});
export type PageSubject = z.infer<typeof PageSubjectSchema>;

/**
 * How light the picture is, cell by cell (sRGB luma 0..255 on a GRID×GRID grid), and its shape.
 * `detail` is the spread of luma inside each cell: fine texture (a city, foliage) that cell means
 * average away. Tones measured before it existed have none.
 */
export const PageToneSchema = z.object({ aspect: z.number().positive(), lum: z.array(z.number()), detail: z.array(z.number()).optional() });
export type PageTone = z.infer<typeof PageToneSchema>;

/** What the chooser knows of a story page. `subject` null: SAM failed, so the hero's place is unknown. */
export interface PageAnalysis {
  page: number;
  words: number;
  subject: PageSubject | null;
  tone: PageTone | null;
}

/** Most of a text box that may lie over the hero. */
const MAX_OVERLAP = 0.06;
/** Above this spread of lightness (luma 0..255) the background is too busy to read text on. */
const MAX_BUSY = 46;
/**
 * The same with the texture inside cells counted in (the hypotenuse of both spreads). Set on twelve
 * real Muse Image pages: text read well on sky, snow and plain ground (up to ~30) and badly on a
 * city or tree branches (36 and up, as an average over a box that is half calm water, half roofs).
 */
const MAX_ROUGH = 33;
/** Half the width of the strip along a spread's fold (mm) where the hero must not be: the binding hides it. */
const GUTTER_MM = 8;
/** How far beyond the estimate render QA's shrink may still make text fit. */
const SHRINK_ROOM = 1.4;
const PT_MM = 25.4 / 72;
/**
 * The least share of a picture (of its width or its height) a layout may keep after cropping it to
 * its box. Pictures are drawn 3:2 with a safe margin; a tall A5 page or an A4 spread needs more
 * picture than that, and such layouts give way to the plate (render QA notes it).
 */
export const MIN_VISIBLE = 0.5;

/** The share of a picture of `imageAspect` that stays in view when it covers a box of `boxAspect`. */
export function visibleShare(imageAspect: number, boxAspect: number): number {
  return Math.min(boxAspect / imageAspect, imageAspect / boxAspect);
}

export function encodeGrid(cells: boolean[]): string {
  let hex = "";
  for (let i = 0; i < cells.length; i += 4) {
    hex += ((cells[i] ? 8 : 0) | (cells[i + 1] ? 4 : 0) | (cells[i + 2] ? 2 : 0) | (cells[i + 3] ? 1 : 0)).toString(16);
  }
  return hex;
}

export function gridCell(subject: PageSubject, x: number, y: number): boolean {
  if (!subject.grid) return false;
  const i = y * GRID + x;
  const digit = parseInt(subject.grid[i >> 2] ?? "0", 16);
  return ((digit >> (3 - (i & 3))) & 1) === 1;
}

/**
 * The CSS object-position (0..1) that keeps `focus` (a point of the picture) as central as the crop
 * allows when a picture of `imageAspect` covers a box of `boxAspect`.
 */
export function objectPosition(focus: Focus, imageAspect: number, boxAspect: number): Focus {
  const vw = Math.min(1, boxAspect / imageAspect);
  const vh = Math.min(1, imageAspect / boxAspect);
  const at = (f: number, v: number) => (v >= 1 ? 0.5 : clamp(f - v / 2, 0, 1 - v) / (1 - v));
  return { x: at(focus.x, vw), y: at(focus.y, vh) };
}

/** The part of the picture (0..1) under a box drawn on the art box `art`, given the crop. */
export function underBox(rect: Rect, art: Rect, imageAspect: number, focus: Focus): Rect {
  const boxAspect = art.w / art.h;
  const vw = Math.min(1, boxAspect / imageAspect);
  const vh = Math.min(1, imageAspect / boxAspect);
  const position = objectPosition(focus, imageAspect, boxAspect);
  const ox = (1 - vw) * position.x;
  const oy = (1 - vh) * position.y;
  return {
    x: ox + ((rect.x - art.x) / art.w) * vw,
    y: oy + ((rect.y - art.y) / art.h) * vh,
    w: (rect.w / art.w) * vw,
    h: (rect.h / art.h) * vh,
  };
}

/** Grid cells under a picture region. */
function cells(region: Rect): [number, number][] {
  const x0 = clamp(Math.floor(region.x * GRID), 0, GRID - 1);
  const y0 = clamp(Math.floor(region.y * GRID), 0, GRID - 1);
  const x1 = clamp(Math.ceil((region.x + region.w) * GRID) - 1, x0, GRID - 1);
  const y1 = clamp(Math.ceil((region.y + region.h) * GRID) - 1, y0, GRID - 1);
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

/** WCAG relative luminance of an sRGB channel value (0..255) taken as grey, or of a #rrggbb color. */
export function luminance(value: number | string): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  if (typeof value === "number") return lin(value / 255);
  const hex = value.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Words a text box holds at the theme's size for this age and format, roughly (render QA has the last word). */
export function capacity(rect: Rect, theme: BookTheme, layout: Pick<BookLayout, "ageGroup"> & Partial<Pick<BookLayout, "format">>): number {
  const size = formatTypeScale(theme, layout.ageGroup, layout.format);
  const em = size.bodyPt * PT_MM;
  const lines = Math.floor(rect.h / (em * size.lineHeight));
  const chars = rect.w / (em * 0.5);
  return Math.floor((lines * chars) / 6.3);
}

export interface Verdict {
  ok: boolean;
  ink: "dark" | "light";
  /** Why it was turned down, for the admin and the tests. */
  reason?: "overlap" | "contrast" | "busy" | "words" | "unknown" | "crop" | "gutter";
  contrast?: number;
}

/** Text over a picture region: clear of the hero, calm, and in the ink that reads best. */
export function judgeOverlay(region: Rect, page: PageAnalysis, theme: BookTheme): Verdict {
  if (!page.tone || !page.subject) return { ok: false, ink: "dark", reason: "unknown" };
  const under = cells(region);
  const subject = page.subject;
  const covered = under.filter(([x, y]) => gridCell(subject, x, y)).length / under.length;
  const lums = under.map(([x, y]) => page.tone!.lum[y * GRID + x] ?? 128);
  const mean = lums.reduce((s, v) => s + v, 0) / lums.length;
  const spread = Math.sqrt(lums.reduce((s, v) => s + (v - mean) ** 2, 0) / lums.length);
  const detail = page.tone.detail;
  const texture = detail ? under.reduce((s, [x, y]) => s + (detail[y * GRID + x] ?? 0), 0) / under.length : 0;
  const busy = detail ? Math.hypot(spread, texture) > MAX_ROUGH : spread > MAX_BUSY;
  const background = luminance(mean);
  const dark = contrast(luminance(theme.palette.ink), background);
  const light = contrast(1, background);
  const ink = dark >= light ? "dark" : "light";
  const best = Math.max(dark, light);
  if (covered > MAX_OVERLAP) return { ok: false, ink, reason: "overlap", contrast: best };
  if (busy) return { ok: false, ink, reason: "busy", contrast: best };
  if (best < theme.minContrast) return { ok: false, ink, reason: "contrast", contrast: best };
  return { ok: true, ink, contrast: best };
}

/** Layouts that suit one page, best first, with what each needs (ink, side, focus). */
export function judgePage(layout: BookLayout, page: PageAnalysis): Partial<PageLayout> & { options: PageVariant[]; verdicts: Partial<Record<PageVariant, Verdict>> } {
  const { theme, format } = layout;
  const focus: Focus = page.subject?.box ? { x: page.subject.box.x + page.subject.box.w / 2, y: page.subject.box.y + page.subject.box.h / 2 } : { x: 0.5, y: 0.5 };
  const aspect = page.tone?.aspect ?? 1.5;
  const verdicts: Partial<Record<PageVariant, Verdict>> = {};
  const ink: PageLayout["ink"] = {};
  let spreadSide: PageLayout["spreadSide"] = "right";
  let plateBand: PageLayout["plateBand"] = "bottom";
  const fits = (variant: PageVariant, state?: Pick<PageLayout, "plateBand">) =>
    page.words <= capacity(textRect(variant, format, state), theme, layout) * SHRINK_ROOM;

  for (const variant of [...theme.variants, "plate" as const]) {
    const art = artRect(variant, format);
    let verdict: Verdict;
    const share = visibleShare(aspect, art.w / art.h);
    if (variant !== "plate" && share < MIN_VISIBLE - 1e-9) {
      verdicts[variant] = { ok: false, ink: "dark", reason: "crop" };
      ink[variant] = "dark";
      continue;
    }
    if (variant === "split" || variant === "facing") {
      verdict = { ok: true, ink: "dark" };
    } else if (variant === "spread" && inGutter(page, art, aspect, focus, format.widthMm)) {
      // A face or a body across the fold disappears into the binding.
      verdict = { ok: false, ink: "dark", reason: "gutter" };
    } else if (variant === "spread") {
      const sides = (["right", "left"] as const).map((side) => {
        const rect = textRect("spread", format);
        const onCanvas = { ...rect, x: rect.x + (side === "right" ? format.widthMm : 0) };
        return { side, verdict: judgeOverlay(underBox(onCanvas, art, aspect, focus), page, theme) };
      });
      const pick = sides.find((s) => s.verdict.ok) ?? sides[0];
      spreadSide = pick.side;
      verdict = pick.verdict;
    } else if (variant === "plate") {
      // The plate goes where it hides less of the hero; its paper keeps the text readable anywhere.
      const overlap = (band: "top" | "bottom") =>
        page.subject ? cells(underBox(textRect("plate", format, { plateBand: band }), art, aspect, focus)).filter(([x, y]) => gridCell(page.subject!, x, y)).length : 0;
      plateBand = overlap("top") < overlap("bottom") ? "top" : "bottom";
      verdict = { ok: true, ink: "dark" };
    } else {
      verdict = judgeOverlay(underBox(textRect(variant, format), art, aspect, focus), page, theme);
    }
    if (verdict.ok && !fits(variant, { plateBand })) verdict = { ...verdict, ok: false, reason: "words" };
    verdicts[variant] = verdict;
    ink[variant] = verdict.ink;
  }
  const options = [...theme.variants, "plate" as const].filter((v, i, all) => all.indexOf(v) === i && (v === "plate" || verdicts[v]?.ok));
  return { options, focus, aspect, ink, spreadSide, plateBand, verdicts };
}

/** The layout with every story page judged; staff pins, the parent's still valid picks and QA's findings stay. */
export function chooseLayout(layout: BookLayout, pages: PageAnalysis[]): BookLayout {
  const next: BookLayout = { ...layout, pages: { ...layout.pages } };
  for (const page of pages) {
    const current = layout.pages[String(page.page)] ?? blankPage();
    const { verdicts: _verdicts, ...judged } = judgePage(layout, page);
    void _verdicts;
    const choice = current.choice && judged.options.includes(current.choice) ? current.choice : null;
    next.pages[String(page.page)] = { ...current, ...judged, choice };
  }
  return next;
}

/**
 * Render QA's note for a page whose picture is too narrow for some of the theme's layouts in this
 * format (they would keep less than MIN_VISIBLE of it), so the chooser left them out — and fell back
 * to the plate when none was left. Null when every layout keeps enough picture.
 */
export function cropNote(layout: BookLayout, page: PageAnalysis): string | null {
  const aspect = page.tone?.aspect ?? 1.5;
  const dropped = layout.theme.variants
    .filter((v) => v !== "plate")
    .map((v) => {
      const art = artRect(v, layout.format);
      return { variant: v, share: visibleShare(aspect, art.w / art.h) };
    })
    .filter((d) => d.share < MIN_VISIBLE - 1e-9);
  if (!dropped.length) return null;
  const list = dropped.map((d) => `${d.variant} ${Math.round(d.share * 100)}%`).join(", ");
  const all = dropped.length === layout.theme.variants.filter((v) => v !== "plate").length;
  return `${layout.format.id} crops the picture too much for ${list}${all ? "; plate used" : ""}`;
}

/** Whether the hero's mask reaches into the strip along the fold of a spread (art box `art`). */
function inGutter(page: PageAnalysis, art: Rect, aspect: number, focus: Focus, foldMm: number): boolean {
  if (!page.subject) return false;
  const strip = underBox({ x: foldMm - GUTTER_MM, y: art.y, w: GUTTER_MM * 2, h: art.h }, art, aspect, focus);
  const under = cells(strip);
  const covered = under.filter(([x, y]) => gridCell(page.subject!, x, y)).length / under.length;
  return covered > MAX_OVERLAP;
}

/** Words in a text, for the capacity check. */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
