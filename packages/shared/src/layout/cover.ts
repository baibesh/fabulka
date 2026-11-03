import type { BookFormat, BookLayout, CoverLayout, Focus } from "./model";
import type { Rect } from "./plan";
import { formatTypeScale } from "./themes";
import { GRID, type PageSubject, type PageTone, contrast, gridCell, luminance, underBox } from "./choose";

/**
 * The front cover: its own illustration (the hero in a scene from the story, drawn by Muse Image),
 * the child's name in big lettering, the title and a small subtitle. SAM's mask of the cover art
 * decides where the lettering goes, so it never sits on the hero; the print wrap adds the back cover
 * and a spine as wide as the book is thick.
 */

/** Share of the cover's height (or, on a wide cover's side band, its width) the lettering takes. */
export const COVER_BAND = 0.4;
/** Most of the lettering box that may lie over the hero (a cell or two of hair is fine; a face is not). */
export const COVER_MAX_OVERLAP = 0.04;
/**
 * How busy the picture under the lettering may be (the spread of lightness and texture, as in
 * judgeOverlay). Looser than for page text: the name is big and outlined, the lines glow.
 */
export const COVER_MAX_ROUGH = 48;
/** Covers at least this much wider than tall letter a side band; the rest the top or the bottom. */
export const WIDE_COVER = 1.25;

type Band = CoverLayout["band"];

/** The bands the lettering may take on a cover of this shape, in order of preference. */
export function coverBands(format: BookFormat): Band[] {
  return format.widthMm / format.heightMm >= WIDE_COVER ? ["top", "bottom", "left", "right"] : ["top", "bottom"];
}

/** Where the lettering goes on a cover of this format, inside the safe zone. */
export function coverTextRect(format: BookFormat, band: Band): Rect {
  const { widthMm: w, heightMm: h, safeMm: s } = format;
  if (band === "left" || band === "right") {
    const width = w * COVER_BAND - s - 2;
    return { x: band === "left" ? s + 2 : w * (1 - COVER_BAND), y: s, w: width, h: h - 2 * s };
  }
  const x = s + 2;
  const width = w - 2 * x;
  return band === "top" ? { x, y: s, w: width, h: h * COVER_BAND - s } : { x, y: h * (1 - COVER_BAND), w: width, h: h * COVER_BAND - s };
}

/** The name's size (mm): big as the theme's title allows, never wider than its box (about 0.56 em a letter). */
export function coverNameMm(rect: Rect, titlePt: number, name: string): number {
  const letters = Math.max(3, [...name].length);
  return Math.min(titlePt * 2.6 * (25.4 / 72), (rect.w * 0.94) / (letters * 0.56), Math.min(rect.h, 90) * 0.42);
}

/**
 * About where the lettering's ink will be inside its box: as wide as the name or the longest title
 * line (roughly half an em a letter), centred. The picture is judged there, not across the whole band.
 */
export function letteringRect(rect: Rect, titlePt: number, text: { name: string; title: string }): Rect {
  const nameMm = coverNameMm(rect, titlePt, text.name);
  const lineMm = titlePt * 0.72 * (25.4 / 72);
  const longest = Math.max(...splitTitle(text.title, text.name).after.split(/\s+/).reduce<string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last !== undefined && (last.length + word.length + 1) * lineMm * 0.5 <= rect.w) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
    return lines;
  }, []).map((line) => line.length * lineMm * 0.5), 0);
  const w = Math.min(rect.w, Math.max([...text.name].length * nameMm * 0.56, longest) + 8);
  return { x: rect.x + (rect.w - w) / 2, y: rect.y, w, h: rect.h };
}

/** Where the cover's picture goes: the whole cover, or (banner) all of it but the lettering's band. */
export function coverArtRect(format: BookFormat, cover: Pick<CoverLayout, "mode" | "band">): Rect {
  const { widthMm: w, heightMm: h } = format;
  if (cover.mode === "overlay") return { x: 0, y: 0, w, h };
  switch (cover.band) {
    case "top":
      return { x: 0, y: h * COVER_BAND, w, h: h * (1 - COVER_BAND) };
    case "bottom":
      return { x: 0, y: 0, w, h: h * (1 - COVER_BAND) };
    case "left":
      return { x: w * COVER_BAND, y: 0, w: w * (1 - COVER_BAND), h };
    case "right":
      return { x: 0, y: 0, w: w * (1 - COVER_BAND), h };
  }
}

/** The band of the cover color a banner's lettering stands on: the cover outside the picture. */
export function coverBandRect(format: BookFormat, band: Band): Rect {
  const { widthMm: w, heightMm: h } = format;
  switch (band) {
    case "top":
      return { x: 0, y: 0, w, h: h * COVER_BAND };
    case "bottom":
      return { x: 0, y: h * (1 - COVER_BAND), w, h: h * COVER_BAND };
    case "left":
      return { x: 0, y: 0, w: w * COVER_BAND, h };
    case "right":
      return { x: w * (1 - COVER_BAND), y: 0, w: w * COVER_BAND, h };
  }
}

/** Share of `region` (a box on the cover, in mm) that lies over the hero in the picture under it. */
export function coverOverlap(layout: Pick<BookLayout, "format">, cover: CoverLayout, subject: PageSubject | null, region: Rect): number {
  if (!subject?.grid) return 0;
  const art = coverArtRect(layout.format, cover);
  // Only the part of the box that lies over the picture can cover anyone.
  const x0 = Math.max(region.x, art.x);
  const y0 = Math.max(region.y, art.y);
  const x1 = Math.min(region.x + region.w, art.x + art.w);
  const y1 = Math.min(region.y + region.h, art.y + art.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const under = underBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, art, cover.aspect, cover.focus);
  const cells = gridCells(under);
  const covered = cells.filter(([x, y]) => gridCell(subject, x, y)).length;
  // As a share of the whole lettering box, so a sliver over the art does not count as all of it.
  const share = ((x1 - x0) * (y1 - y0)) / Math.max(region.w * region.h, 1e-9);
  return cells.length ? (covered / cells.length) * share : 0;
}

/** Lettering over a picture region (0..1): which ink reads, and whether it reads at all. */
function judgeLettering(region: Rect, tone: PageTone, theme: BookLayout["theme"]): { ok: boolean; ink: "dark" | "light" } {
  const under = gridCells(region);
  const lums = under.map(([x, y]) => tone.lum[y * GRID + x] ?? 128);
  const mean = lums.reduce((sum, v) => sum + v, 0) / lums.length;
  const spread = Math.sqrt(lums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lums.length);
  const detail = tone.detail;
  const texture = detail ? under.reduce((sum, [x, y]) => sum + (detail[y * GRID + x] ?? 0), 0) / under.length : 0;
  const background = luminance(mean);
  const dark = contrast(luminance(theme.palette.ink), background);
  const light = contrast(1, background);
  const ink = dark >= light ? "dark" : "light";
  return { ok: Math.hypot(spread, texture) <= COVER_MAX_ROUGH && Math.max(dark, light) >= theme.minContrast, ink };
}

/**
 * The cover's lettering for its picture: over a calm band clear of the hero, the top first (the
 * picture is asked to leave it calm) when the text reads there; else on its own band of the cover
 * color with the picture beside it, uncovered: the side opposite the hero on a wide cover, else the
 * top or bottom that would hide less of the hero. Without SAM's mask or the picture's tones nothing
 * is known, so the banner is the safe choice.
 */
export function chooseCover(
  layout: Pick<BookLayout, "format" | "theme" | "ageGroup">,
  subject: PageSubject | null,
  tone: PageTone | null,
  text?: { name: string; title: string },
): CoverLayout {
  const titlePt = formatTypeScale(layout.theme, layout.ageGroup, layout.format).titlePt;
  const aspect = tone?.aspect ?? 1;
  const focus: Focus = subject?.box ? { x: subject.box.x + subject.box.w / 2, y: subject.box.y + subject.box.h / 2 } : { x: 0.5, y: 0.5 };
  const bands = coverBands(layout.format);
  if (subject && tone) {
    const art = coverArtRect(layout.format, { mode: "overlay", band: "top" });
    for (const band of bands) {
      const rect = coverTextRect(layout.format, band);
      const ink = text ? letteringRect(rect, titlePt, text) : rect;
      const verdict = judgeLettering(underBox(ink, art, aspect, focus), tone, layout.theme);
      const overlap = coverOverlap(layout, { mode: "overlay", band, ink: verdict.ink, focus, aspect }, subject, rect);
      if (verdict.ok && overlap <= COVER_MAX_OVERLAP) return { mode: "overlay", band, ink: verdict.ink, focus, aspect };
    }
  }
  if (bands.includes("left")) return { mode: "banner", band: focus.x < 0.5 ? "right" : "left", ink: "dark", focus, aspect };
  const hidden = (band: Band) => coverOverlap(layout, { mode: "overlay", band, ink: "dark", focus, aspect }, subject, coverTextRect(layout.format, band));
  const band = subject?.grid && hidden("bottom") < hidden("top") ? "bottom" : "top";
  return { mode: "banner", band, ink: "dark", focus, aspect };
}

// ---- The print wrap: back cover, spine, front cover ---------------------------------------------

export const BINDINGS = ["soft", "hard"] as const;
export type Binding = (typeof BINDINGS)[number];

/** One leaf (two pages) of 150 g/m² coated text paper, in millimetres. */
export const PAPER_LEAF_MM = 0.12;
/** A softcover's own card, folded round the spine. */
export const SOFT_COVER_MM = 0.4;
/** The grey board of a hardcover case, one side. */
export const BOARD_MM = 2.5;
/** Hardcover: how far the boards stand out past the pages (top, bottom and fore-edge). */
export const SQUARE_MM = 3;
/** Hardcover: the groove between the spine and each board, where the cover bends. */
export const HINGE_MM = 8;
/** Hardcover: the cover paper folded over the boards' edges. */
export const TURN_IN_MM = 15;
/** Below this a spine is too thin to letter (printers ask for at least 5 mm, with a margin each side). */
export const SPINE_TEXT_MIN_MM = 5;

/**
 * How wide the spine is, from the pages between the covers and the binding: the block of paper, plus
 * the card of a softcover or the case's boards and play of a hardcover, rounded up to half a millimetre.
 */
export function spineWidthMm(interiorPages: number, binding: Binding): number {
  const block = Math.ceil(Math.max(interiorPages, 0) / 2) * PAPER_LEAF_MM;
  const raw = binding === "hard" ? block + 2 * BOARD_MM + 1 : block + SOFT_COVER_MM;
  return Math.ceil(raw * 2 - 1e-9) / 2;
}

/** The cover wrap of one binding: its sheet, the panels on it and the format a cover panel is drawn at. */
export interface CoverWrap {
  binding: Binding;
  interiorPages: number;
  spineMm: number;
  /** Whether the spine carries the name and title. */
  spineText: boolean;
  /** The wrap without the bleed (softcover) or the turn-in (hardcover): what shows on the finished book. */
  widthMm: number;
  heightMm: number;
  /** Bleed or turn-in around it, on every side. */
  marginMm: number;
  /** Panels on the finished wrap (mm from its top left, margin excluded). */
  back: Rect;
  spine: Rect;
  front: Rect;
  /**
   * The size the front and back covers are drawn at: the page for a softcover; the board for a
   * hardcover (a little bigger than the page), with the turn-in as its bleed.
   */
  panel: BookFormat;
}

/**
 * The wrap printed for the outside of the book. Softcover: back, spine, front at the page size, with
 * the page's bleed. Hardcover: two boards a square bigger than the page, the hinges and the spine,
 * with the turn-in folded over the boards.
 */
export function coverWrap(format: BookFormat, interiorPages: number, binding: Binding): CoverWrap {
  const spineMm = spineWidthMm(interiorPages, binding);
  const hard = binding === "hard";
  const panelW = hard ? format.widthMm + SQUARE_MM : format.widthMm;
  const panelH = hard ? format.heightMm + 2 * SQUARE_MM : format.heightMm;
  const hinge = hard ? HINGE_MM : 0;
  const back: Rect = { x: 0, y: 0, w: panelW, h: panelH };
  const spine: Rect = { x: panelW + hinge, y: 0, w: spineMm, h: panelH };
  const front: Rect = { x: panelW + 2 * hinge + spineMm, y: 0, w: panelW, h: panelH };
  return {
    binding,
    interiorPages,
    spineMm,
    spineText: spineMm >= SPINE_TEXT_MIN_MM,
    widthMm: front.x + front.w,
    heightMm: panelH,
    marginMm: hard ? TURN_IN_MM : format.bleedMm,
    back,
    spine,
    front,
    panel: {
      id: `${format.id}-${binding}-cover`,
      widthMm: panelW,
      heightMm: panelH,
      bleedMm: hard ? TURN_IN_MM : format.bleedMm,
      safeMm: format.safeMm + (hard ? SQUARE_MM : 0),
    },
  };
}

/** Grid cells under a region of the picture (0..1). */
function gridCells(region: Rect): [number, number][] {
  const clamp = (v: number) => Math.min(GRID - 1, Math.max(0, v));
  const x0 = clamp(Math.floor(region.x * GRID));
  const y0 = clamp(Math.floor(region.y * GRID));
  const x1 = Math.max(x0, clamp(Math.ceil((region.x + region.w) * GRID) - 1));
  const y1 = Math.max(y0, clamp(Math.ceil((region.y + region.h) * GRID) - 1));
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

/**
 * The child's name in the title, for the lettering: the word that is the name (or a declined form of
 * it: "Тимура" for Тимур, "Айшаның" for Айша) with what comes before and after. Without the name in
 * the title, the name stands alone and the whole title follows.
 */
export function splitTitle(title: string, name: string): { before: string; name: string; after: string } {
  const clean = title.trim();
  const wanted = name.trim();
  if (!wanted) return { before: "", name: clean, after: "" };
  const words = clean.split(/(\s+)/u);
  const key = wanted.toLocaleLowerCase();
  const stem = key.length > 4 ? key.slice(0, -1) : key;
  for (let i = 0; i < words.length; i++) {
    const bare = words[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    const lower = bare.toLocaleLowerCase();
    // A case ending may add a few letters (and change the last one of a longer name).
    const matches = lower === key || (lower.startsWith(stem) && lower.length > stem.length && lower.length - key.length <= 4);
    if (!bare || !matches) continue;
    const start = words[i].indexOf(bare);
    const before = (words.slice(0, i).join("") + words[i].slice(0, start)).trim();
    const after = (words[i].slice(start + bare.length) + words.slice(i + 1).join("")).trim();
    return { before, name: bare, after: after.replace(/^[,:;]\s*/u, "") };
  }
  return { before: "", name: wanted, after: clean };
}
