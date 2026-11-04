import type { FrameRect, TextKind } from "../formats";
import type { FrameCast } from "../scenario";
import { GRID, gridCell, objectPosition, type PageSubject } from "./choose";
import type { BalloonShape, BookFormat, BookLayout, BookTheme, Focus, PageLayout, PlacedText } from "./model";
import type { Rect } from "./plan";
import { blankPage, formatTypeScale } from "./themes";

/**
 * Panel pages (comics): a page is a grid of frames, and its texts sit in the frames - speech in
 * balloons whose tails point at the speaker's head, captions in corner boxes, sound effects as big
 * tilted lettering. SAM finds the figures and faces in each frame; placeFrameTexts keeps every text
 * off faces (and off bodies where it can), near its speaker and in reading order. All of it is pure:
 * the API places the texts when it lays the book out, the renderer draws them where they were put,
 * and render QA measures the result in Chromium.
 */

const PT_MM = 25.4 / 72;
/** Cells per side of a frame's occupancy grid (bodies). */
const CELLS = 32;
/** What covering one cell of a body costs. */
const BODY = 1;
/** How much around a face's box (shares of its size) a balloon should not touch either. */
const FACE_MARGIN = { x: 0.15, y: 0.25 };
/** Line height of the lettering. */
const LINE = 1.16;
/** Width of a capital letter of the lettering, in em (Nunito ExtraBold capitals are wide). */
const CAP_EM = 0.7;
/** The lettering's smallest size (pt): a crowded balloon shrinks no further. */
export const MIN_LETTERING_PT = 7;
/** The sizes a crowded text may take, as shares of the lettering size, largest first. */
const SIZES = [1, 0.94, 0.88, 0.82];
/** How far past the gutter's middle a balloon stops (mm), so balloons of two frames never touch. */
const GUTTER_GAP = 0.75;
/** How far a balloon may stand out of a frame on the page's outer side (mm), into the margin. */
const OUTER_REACH = 3;

/** Scores (lower is better): what makes a place worse, from a covered face down to a smaller size. */
const SCORE = {
  /** Lettering on lettering cannot be read: worse than anything in the picture. */
  overText: 1e6,
  /** A face covered, plus how much of it. */
  face: 1e4,
  faceShare: 3e3,
  /** The balloon touches the room around a face, or its tail runs over one. */
  nearFace: 600,
  /** Covering a body, by the share covered. */
  body: 60,
  /** Smaller lettering, by the share it lost. */
  smaller: 1500,
  /** A balloon that reads before one that comes earlier in the story (comics read in a Z). */
  order: 250,
  /** A rounded box instead of an ellipse; a caption box instead of a balloon. */
  shape: { ellipse: 0, box: 60, caption: 140 },
  /** Each mm of the balloon outside its frame (over the border, the gutter or the margin). */
  outside: 6,
} as const;

/** The area panels fill: the page inside its safe margin, so every balloon stays in the safe zone. */
export function panelArea(format: BookFormat): Rect {
  const { widthMm: w, heightMm: h, safeMm: s } = format;
  return { x: s, y: s, w: w - 2 * s, h: h - 2 * s };
}

/** A frame's box on the page (mm): its share of the panel area, with half the gutter taken off each inner side. */
export function frameBox(format: BookFormat, rect: FrameRect, gutterMm: number): Rect {
  const area = panelArea(format);
  const g = gutterMm / 2;
  const grown = { x: area.x - g, y: area.y - g, w: area.w + 2 * g, h: area.h + 2 * g };
  return {
    x: grown.x + rect.x * grown.w + g,
    y: grown.y + rect.y * grown.h + g,
    w: rect.w * grown.w - 2 * g,
    h: rect.h * grown.h - 2 * g,
  };
}

/** The picture's box inside a frame's ink border: what the picture covers and what its texts are placed in. */
export function frameInner(box: Rect, borderMm: number): Rect {
  return { x: box.x + borderMm, y: box.y + borderMm, w: Math.max(1, box.w - 2 * borderMm), h: Math.max(1, box.h - 2 * borderMm) };
}

/** The lettering's size on panel pages (pt): the theme's body size at this format, times its lettering scale. */
export function letteringPt(layout: Pick<BookLayout, "theme" | "ageGroup" | "format">): number {
  const body = formatTypeScale(layout.theme, layout.ageGroup, layout.format).bodyPt;
  const scale = layout.theme.lettering?.scale ?? 0.74;
  return Math.round(Math.min(12, Math.max(7.5, body * scale)) * 2) / 2;
}

/** The picture size Muse Image is asked for, by the frame's shape (a picture book page is always landscape). */
export function frameImageSize(box: Pick<Rect, "w" | "h">, panel: boolean): "1536x1024" | "1024x1024" | "1024x1536" {
  if (!panel) return "1536x1024";
  const aspect = box.w / box.h;
  if (aspect >= 1.25) return "1536x1024";
  if (aspect <= 0.8) return "1024x1536";
  return "1024x1024";
}

/** About how much room capitals take (mm): greedy word wrap at `maxW`, CAP_EM a letter. */
export function letteringSize(text: string, pt: number, maxW: number): { w: number; h: number; lines: number } {
  const em = pt * PT_MM;
  const letter = em * CAP_EM;
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: number[] = [];
  for (const word of words) {
    const width = [...word].length * letter;
    const last = lines.length ? lines[lines.length - 1] : -1;
    if (last >= 0 && last + letter * 0.45 + width <= maxW) lines[lines.length - 1] = last + letter * 0.45 + width;
    else lines.push(width);
  }
  if (!lines.length) lines.push(letter);
  // A word longer than the width keeps its own: the balloon grows around it rather than cut it.
  return { w: Math.max(...lines), h: lines.length * em * LINE, lines: lines.length };
}

/** A balloon's size around lettering of this size: an ellipse needs room at its ends, a box hugs the lines. */
function shapeSize(shape: BalloonShape, letters: { w: number; h: number }, pt: number): { w: number; h: number } {
  const m = pt * PT_MM;
  if (shape === "ellipse") return { w: letters.w * 1.24 + m * 1.6, h: letters.h * 1.3 + m * 1.1 };
  return { w: letters.w + m * 1.2 + 1, h: letters.h + m * 0.8 + 0.6 };
}

/**
 * Where a speech text's lettering goes inside its balloon (same units as `r`): the middle of an
 * ellipse, or a box's inside less its padding. The renderer draws the fit box here.
 */
export function letteringBox(shape: BalloonShape, r: Rect, pt: number): Rect {
  if (shape === "ellipse") return { x: r.x + r.w * 0.1, y: r.y + r.h * 0.12, w: r.w * 0.8, h: r.h * 0.76 };
  const m = pt * PT_MM;
  const px = m * 0.6;
  const py = m * 0.4;
  return { x: r.x + px, y: r.y + py, w: Math.max(1, r.w - 2 * px), h: Math.max(1, r.h - 2 * py) };
}

/** How far a frame's balloons may stand out of it on each side (mm): over the border to near the gutter's middle, or into the margin. */
export interface Reach {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const NO_REACH: Reach = { left: 0, top: 0, right: 0, bottom: 0 };

/** What placing a frame's texts needs to know of the frame. */
export interface FrameToPlace {
  frame: number;
  /** The picture's box on the page (inside the frame's border), mm. */
  box: Rect;
  /** The picture's width / height and the point the crop keeps in view. */
  aspect: number;
  focus: Focus;
  /** SAM's mask; null when SAM failed or the frame has no picture. */
  subject: PageSubject | null;
  /** Who the scene shows and where, from the scenario. */
  cast: FrameCast[];
  /** How far balloons may stand out of the frame; none when left out. */
  reach?: Reach;
}

export interface TextToPlace {
  id: string;
  kind: TextKind;
  frame: number;
  speaker: string | null;
  text: string;
}

export interface PlaceOptions {
  /**
   * A line no balloon can carry clear of every face moves into a caption box at the frame's edge.
   * Off while Muse Spark may still shorten it (the book's generation); on for the final layout.
   */
  captions?: boolean;
}

/** A box in the frame, mm from its top left. */
interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A frame's bodies (SAM's mask) on a grid: what covering each cell costs. */
class Occupancy {
  readonly cells = new Float32Array(CELLS * CELLS);
  constructor(
    readonly w: number,
    readonly h: number,
  ) {}

  /** The cost at a point; nothing outside the frame. */
  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.cells[Math.floor((y / this.h) * CELLS) * CELLS + Math.floor((x / this.w) * CELLS)];
  }
}

/** Points spread over a shape (shares of its box), where its cost is sampled. */
const SAMPLES: Record<BalloonShape, [number, number][]> = (() => {
  const grid = (inside: (u: number, v: number) => boolean) => {
    const out: [number, number][] = [];
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 7; j++) {
        const u = (i + 0.5) / 9;
        const v = (j + 0.5) / 7;
        if (inside(u, v)) out.push([u, v]);
      }
    return out;
  };
  const rect = grid(() => true);
  return { ellipse: grid((u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25), box: rect, caption: rect };
})();

/** Where the picture's point (0..1 of the image) lands in the frame (mm), given the crop. */
function toFrame(frame: FrameToPlace, p: { x: number; y: number }): { x: number; y: number } {
  const boxAspect = frame.box.w / frame.box.h;
  const vw = Math.min(1, boxAspect / frame.aspect);
  const vh = Math.min(1, frame.aspect / boxAspect);
  const pos = objectPosition(frame.focus, frame.aspect, boxAspect);
  const ox = (1 - vw) * pos.x;
  const oy = (1 - vh) * pos.y;
  return { x: ((p.x - ox) / vw) * frame.box.w, y: ((p.y - oy) / vh) * frame.box.h };
}

function boxToFrame(frame: FrameToPlace, b: { x: number; y: number; w: number; h: number }): Spot {
  const a = toFrame(frame, { x: b.x, y: b.y });
  const c = toFrame(frame, { x: b.x + b.w, y: b.y + b.h });
  return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
}

/** The frame's bodies from SAM's mask. */
function occupancy(frame: FrameToPlace): Occupancy {
  const occ = new Occupancy(frame.box.w, frame.box.h);
  const subject = frame.subject;
  if (!subject) return occ;
  const boxAspect = frame.box.w / frame.box.h;
  const vw = Math.min(1, boxAspect / frame.aspect);
  const vh = Math.min(1, frame.aspect / boxAspect);
  const pos = objectPosition(frame.focus, frame.aspect, boxAspect);
  const ox = (1 - vw) * pos.x;
  const oy = (1 - vh) * pos.y;
  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      const ix = ox + ((cx + 0.5) / CELLS) * vw;
      const iy = oy + ((cy + 0.5) / CELLS) * vh;
      const gx = Math.min(GRID - 1, Math.max(0, Math.floor(ix * GRID)));
      const gy = Math.min(GRID - 1, Math.max(0, Math.floor(iy * GRID)));
      if (gridCell(subject, gx, gy)) occ.cells[cy * CELLS + cx] = BODY;
    }
  return occ;
}

/** The faces SAM found that show in the frame (mm), cut to the frame. */
function facesOf(frame: FrameToPlace): Spot[] {
  const { w: W, h: H } = frame.box;
  return (frame.subject?.faces ?? [])
    .map((f) => boxToFrame(frame, f))
    .map((f) => {
      const x = Math.max(0, f.x);
      const y = Math.max(0, f.y);
      return { x, y, w: Math.min(W, f.x + f.w) - x, h: Math.min(H, f.y + f.h) - y };
    })
    .filter((f) => f.w > 0.2 && f.h > 0.2);
}

const overlaps = (a: Spot, b: Spot) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Whether a shape drawn in `s` touches the box `r` (an ellipse exactly, a box by its rectangle). */
function shapeTouches(shape: BalloonShape, s: Spot, r: Spot): boolean {
  if (!overlaps(s, r)) return false;
  if (shape !== "ellipse") return true;
  const rx = s.w / 2;
  const ry = s.h / 2;
  const cx = s.x + rx;
  const cy = s.y + ry;
  const px = clamp(cx, r.x, r.x + r.w);
  const py = clamp(cy, r.y, r.y + r.h);
  return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < 1;
}

/** Whether a point lies inside a shape drawn in `s`. */
function inShape(shape: BalloonShape, s: Spot, x: number, y: number): boolean {
  if (shape !== "ellipse") return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  return ((x - s.x - s.w / 2) / (s.w / 2)) ** 2 + ((y - s.y - s.h / 2) / (s.h / 2)) ** 2 <= 1;
}

/** The share of a face (its box) under a shape. */
function faceShare(shape: BalloonShape, s: Spot, face: Spot): number {
  let hit = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (inShape(shape, s, face.x + ((i + 0.5) / 6) * face.w, face.y + ((j + 0.5) / 6) * face.h)) hit++;
  return hit / 36;
}

const grownFace = (f: Spot): Spot => ({ x: f.x - f.w * FACE_MARGIN.x, y: f.y - f.h * FACE_MARGIN.y, w: f.w * (1 + 2 * FACE_MARGIN.x), h: f.h * (1 + 2 * FACE_MARGIN.y) });

/** Whether a text's shape covers any face. */
export function coversFace(shape: BalloonShape, s: Spot, faces: Spot[]): boolean {
  return faces.some((f) => shapeTouches(shape, s, f));
}

/** Where a figure's head is (mm in the frame): the top of a face inside its box, else the top of its box. */
function headOf(frame: FrameToPlace, speaker: string | null): { x: number; y: number; top: number } | null {
  const subject = frame.subject;
  if (!subject) return null;
  // A child or a side character speaks from a person SAM found (a kite shaped like an animal is not one); the pet from an animal.
  const all = (subject.people ?? []).filter((p) => p.box.w * p.box.h > 0.004);
  const kind = speaker === "pet" ? "animal" : "person";
  const own = all.filter((p) => p.concept === kind);
  const people = (own.length ? own : all).sort((a, b) => a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2));
  const faces = subject.faces ?? [];
  const order: Record<string, number> = { left: 0, center: 1, right: 2 };
  // Only figures of that kind count when matching positions: people for people, the pet for the pet.
  const placed = frame.cast.filter((c) => c.at && (kind === "animal" ? c.id === "pet" : c.id !== "pet")).sort((a, b) => order[a.at!] - order[b.at!]);
  let figure: { x: number; y: number; w: number; h: number } | null = null;
  if (people.length) {
    const index = placed.findIndex((c) => c.id === speaker);
    if (index >= 0 && people.length === placed.length) figure = people[index].box;
    else {
      const at = frame.cast.find((c) => c.id === speaker)?.at ?? (speaker === "hero" ? "center" : undefined);
      const want = at === "left" ? 0.22 : at === "right" ? 0.78 : 0.5;
      figure = [...people].sort((a, b) => Math.abs(a.box.x + a.box.w / 2 - want) - Math.abs(b.box.x + b.box.w / 2 - want))[0].box;
    }
  } else if (subject.box) figure = subject.box;
  if (!figure) return null;
  const inside = faces
    .filter((f) => {
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      return cx > figure!.x && cx < figure!.x + figure!.w && cy > figure!.y && cy < figure!.y + figure!.h;
    })
    .sort((a, b) => a.y - b.y)[0];
  const head = inside ?? { x: figure.x + figure.w * 0.3, y: figure.y, w: figure.w * 0.4, h: figure.h * 0.14 };
  const top = toFrame(frame, { x: head.x + head.w / 2, y: head.y });
  const mid = toFrame(frame, { x: head.x + head.w / 2, y: head.y + head.h * 0.2 });
  return { x: top.x, y: mid.y, top: top.y };
}

/** A shape and size a text may take: its box and its lettering's size. */
interface Candidate {
  shape: BalloonShape;
  pt: number;
  w: number;
  h: number;
  lines: number;
}

/** A place found for a text, with what it covers. */
interface Found {
  spot: Spot;
  candidate: Candidate;
  face: boolean;
  score: number;
}

/** What one frame knows while its texts are placed. */
interface FrameState {
  W: number;
  H: number;
  occ: Occupancy;
  faces: Spot[];
  reach: Reach;
  /** Boxes of the texts placed so far (grown a little) and their tails, with how much covering them costs. */
  taken: { spot: Spot; weight: number }[];
  /** Where the frame's captions went: its speech reads after them. */
  captions: Spot[];
}

/** The x (or y) range a shape of size `size` may take in a frame of `length`: its lettering inside the frame, its shape no further out than the reach. */
function span(length: number, size: number, before: number, after: number, innerStart: number, innerSize: number, pad: number): [number, number] {
  const min = Math.max(-before, pad - innerStart);
  const max = Math.min(length + after - size, length - pad - innerStart - innerSize);
  return [min, max];
}

/**
 * The best place for one text over every shape and size it may take: each is tried at every
 * position (on a grid about a millimetre apart) and scored by `score` plus what it covers - faces
 * first, then other texts, then bodies.
 */
function best(
  state: FrameState,
  candidates: Candidate[],
  pad: number,
  score: (s: Spot, c: Candidate) => number,
  {
    reach = state.reach,
    edge = false,
    cost = (c: Candidate) => SCORE.shape[c.shape] + (1 - c.pt / Math.max(...candidates.map((d) => d.pt))) * SCORE.smaller,
  }: { reach?: Reach; edge?: boolean; cost?: (c: Candidate) => number } = {},
): Found | null {
  let out: Found | null = null;
  // The plainest shapes and biggest sizes first: a good place found early rules the rest out quickly.
  for (const c of [...candidates].sort((a, b) => cost(a) - cost(b))) {
    const base = cost(c);
    if (out && base >= out.score) continue;
    const inner = letteringBox(c.shape, { x: 0, y: 0, w: c.w, h: c.h }, c.pt);
    const [x0, x1] = span(state.W, c.w, reach.left, reach.right, inner.x, inner.w, pad);
    const [y0, y1] = span(state.H, c.h, reach.top, reach.bottom, inner.y, inner.h, pad);
    if (x1 < x0 - 1e-6 || y1 < y0 - 1e-6) continue;
    const nx = Math.min(36, Math.max(1, Math.ceil(x1 - x0)));
    const ny = Math.min(36, Math.max(1, Math.ceil(y1 - y0)));
    // A caption box sits along the frame's top or bottom edge.
    const ys = edge ? [y0, Math.max(y0, y1)] : Array.from({ length: ny + 1 }, (_, j) => y0 + ((y1 - y0) * j) / ny);
    const samples = SAMPLES[c.shape];
    for (const y of ys)
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx;
        const spot = { x, y, w: c.w, h: c.h };
        let s = base;
        // Faces: covered is worst, touched nearly as bad.
        let face = false;
        let share = 0;
        let near = false;
        for (const f of state.faces) {
          if (shapeTouches(c.shape, spot, f)) {
            face = true;
            share = Math.max(share, faceShare(c.shape, spot, f));
          } else if (shapeTouches(c.shape, spot, grownFace(f))) near = true;
        }
        if (face) s += SCORE.face + share * SCORE.faceShare;
        else if (near) s += SCORE.nearFace;
        if (out && s >= out.score) continue;
        // Other texts and their tails.
        const grown = { x: spot.x - 0.5, y: spot.y - 0.5, w: spot.w + 1, h: spot.h + 1 };
        for (const t of state.taken) {
          if (!overlaps(grown, t.spot)) continue;
          const ox = Math.min(grown.x + grown.w, t.spot.x + t.spot.w) - Math.max(grown.x, t.spot.x);
          const oy = Math.min(grown.y + grown.h, t.spot.y + t.spot.h) - Math.max(grown.y, t.spot.y);
          s += t.weight * SCORE.overText * (0.25 + (ox * oy) / (grown.w * grown.h));
        }
        if (out && s >= out.score) continue;
        // Bodies, sampled over the shape; what stands outside the frame covers nothing but costs a little.
        let body = 0;
        for (const [u, v] of samples) body += state.occ.at(x + u * c.w, y + v * c.h);
        s += (body / samples.length) * SCORE.body;
        s += (Math.max(0, -x) + Math.max(0, -y) + Math.max(0, x + c.w - state.W) + Math.max(0, y + c.h - state.H)) * SCORE.outside;
        if (out && s >= out.score) continue;
        s += score(spot, c);
        if (!out || s < out.score) out = { spot, candidate: c, face, score: s };
      }
  }
  return out;
}

/** The shapes a speech line may take: each size, each balloon, and wrapped into one to five lines. */
function speechCandidates(text: string, pt: number, W: number, H: number, shapes: BalloonShape[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const share of SIZES) {
    const size = Math.max(Math.min(pt, MIN_LETTERING_PT), Math.round(pt * share * 10) / 10);
    const one = letteringSize(text, size, 1e4).w;
    for (const shape of shapes) {
      const widest = shape === "caption" ? W : Math.min(W * 0.8, 70);
      for (let lines = 1; lines <= 6; lines++) {
        const maxW = Math.min(widest, Math.max(12, (one / lines) * 1.08));
        const letters = letteringSize(text, size, maxW);
        const box = shapeSize(shape, letters, size);
        const key = `${shape}:${size}:${letters.lines}:${Math.round(letters.w)}`;
        if (seen.has(key) || box.h > H + 6) continue;
        seen.add(key);
        out.push({ shape, pt: size, w: box.w, h: box.h, lines: letters.lines });
      }
    }
  }
  return out;
}

/**
 * Every text of one frame placed, in reading order: the caption in the corner that covers least (the
 * top left first), each balloon near and above its speaker's head with its tail toward it - the
 * first further up and left, the next below or right of it - and sound effects big and tilted where
 * the picture is free. No text covers a face where any place, shape or size keeps clear of them: a
 * balloon may stand out over the frame's border, wrap narrower or wider, become a rounded box or
 * take smaller lettering (down to MIN_LETTERING_PT); with `captions`, a line still left on a face
 * moves into a caption box at the frame's edge. What still covers a face has `face` set (render QA
 * fails it). Boxes are returned as shares of the frame.
 */
export function placeFrameTexts(frame: FrameToPlace, texts: TextToPlace[], pt: number, options: PlaceOptions = {}): PlacedText[] {
  const { w: W, h: H } = frame.box;
  const state: FrameState = { W, H, occ: occupancy(frame), faces: facesOf(frame), reach: frame.reach ?? NO_REACH, taken: [], captions: [] };
  const pad = Math.min(1.2, W * 0.015);
  const share = (s: Spot) => ({ x: s.x / W, y: s.y / H, w: s.w / W, h: s.h / H });
  const take = (into: FrameState, spot: Spot, weight = 1) => into.taken.push({ spot: { x: spot.x - 0.5, y: spot.y - 0.5, w: spot.w + 1, h: spot.h + 1 }, weight });
  // Captions first, in their corners.
  const captions: PlacedText[] = [];
  for (const text of texts.filter((t) => t.kind === "caption" || t.kind === "narration")) {
    const wide = text.kind === "narration";
    const candidates: Candidate[] = [];
    for (const s of SIZES.slice(0, 3)) {
      const size = Math.max(Math.min(pt, MIN_LETTERING_PT), Math.round(pt * s * 10) / 10);
      const em = size * PT_MM;
      for (const maxW of wide ? [W] : [Math.max(24, W * 0.62), Math.max(20, W * 0.45), W]) {
        // The box's padding (0.55 em a side, 0.3 em above and below) and its ink border, with room to spare.
        const letters = letteringSize(text.text, size, maxW - em * 1.5 - 1.2);
        const w = wide ? W : Math.min(W, letters.w + em * 1.5 + 1.2);
        candidates.push({ shape: "caption", pt: size, w, h: letters.h + em * 0.9 + 1.2, lines: letters.lines });
      }
    }
    // A caption sits in a corner (the top left first), a narration along the bottom or the top.
    const corner = (s: Spot) => (s.x <= 0.01 || s.x + s.w >= W - 0.01) && (s.y <= 0.01 || s.y + s.h >= H - 0.01);
    const found = best(
      state,
      candidates,
      0,
      (s) => (corner(s) ? 0 : 400) + ((s.y > H / 2 ? 0.8 : 0) + (s.x > W / 2 ? 0.4 : 0) + (wide && s.y < H / 2 ? 0.4 : 0)) * 10,
      { reach: NO_REACH, edge: true, cost: (c) => (1 - c.pt / pt) * SCORE.smaller },
    );
    if (!found) continue;
    take(state, found.spot);
    if (!wide) state.captions.push(found.spot);
    captions.push({ id: text.id, frame: frame.frame, kind: text.kind, box: share(found.spot), tail: null, pt: found.candidate.pt, rotate: 0, face: found.face, shape: "ellipse" });
  }
  // Then the speech, in reading order: placed one by one, and in another order when that reads wrong.
  const lines = texts.filter((t) => t.kind === "speech");
  let speech = placeSpeech(frame, state, lines, lines.map((_, i) => i), pt, pad, options);
  if (lines.length > 1 && speech.disorder) {
    for (const order of orders(lines.length)) {
      const other = placeSpeech(frame, state, lines, order, pt, pad, options);
      if (other.score < speech.score) speech = other;
    }
  }
  state.taken = speech.taken;
  // Sound effects last, big and tilted where the picture is free.
  const sounds: PlacedText[] = [];
  for (const text of texts.filter((t) => t.kind === "sfx")) {
    const big = pt * 2.1;
    const size = letteringSize(text.text, big, W * 0.7);
    const w = Math.min(W - 2 * pad, size.w + big * PT_MM * 0.4);
    const h = Math.min(H - 2 * pad, size.h + big * PT_MM * 0.2);
    // Tilted italic capitals reach past their box: they keep further from the border.
    const inside = -Math.max(pad, 3);
    const found = best(state, [{ shape: "box", pt: big, w, h, lines: size.lines }], pad, (s) => Math.abs(s.y / H - 0.3) * 2, {
      reach: { left: inside, top: inside, right: inside, bottom: inside },
      cost: () => 0,
    });
    if (!found) continue;
    take(state, found.spot);
    sounds.push({ id: text.id, frame: frame.frame, kind: "sfx", box: share(found.spot), tail: null, pt: big, rotate: -7, face: found.face, shape: "ellipse" });
  }
  return [...captions, ...inReadingOrder(speech.placed, speech.heads, state), ...sounds];
}

/** Every order to place up to three lines in (beyond: forwards and backwards), the reading order first. */
function orders(n: number): number[][] {
  const forward = Array.from({ length: n }, (_, i) => i);
  if (n > 3) return [forward, [...forward].reverse()];
  const out: number[][] = [];
  const walk = (left: number[], done: number[]) => {
    if (!left.length) out.push(done);
    for (const i of left) walk(left.filter((j) => j !== i), [...done, i]);
  };
  walk(forward, []);
  return out;
}

/**
 * A frame's speech lines placed one by one in `order` (indexes into `lines`, which are in reading
 * order): each balloon near and above its speaker's head with its tail toward it, the earlier lines
 * higher and further left. Returns them in reading order, the places they took, the total score and
 * whether some pair still reads in the wrong order.
 */
function placeSpeech(
  frame: FrameToPlace,
  base: FrameState,
  lines: TextToPlace[],
  order: number[],
  pt: number,
  pad: number,
  options: PlaceOptions,
): { placed: PlacedText[]; heads: Map<string, { x: number; y: number } | null>; taken: FrameState["taken"]; score: number; disorder: boolean } {
  const state: FrameState = { ...base, taken: [...base.taken] };
  const { W, H } = state;
  const spots = new Map<number, Spot>();
  const placed = new Map<number, PlacedText>();
  const heads = new Map<string, { x: number; y: number } | null>();
  let total = 0;
  for (const index of order) {
    const text = lines[index];
    // A speech balloon: an ellipse (or a rounded box) around the lettering, with a tail toward the speaker's head.
    const head = headOf(frame, text.speaker);
    // A line with more to come in the frame sits high, leaving room below for the next.
    const more = index < lines.length - 1;
    const score = (s: Spot) => {
      let score = 0;
      // Balloons read best two or three lines tall, about twice as wide as high.
      score += Math.abs(Math.log(s.w / s.h / 2.2)) * 16;
      if (head) {
        const cx = s.x + s.w / 2;
        const bottom = s.y + s.h;
        score += (Math.hypot(cx - head.x, bottom - head.top) / W) * 12;
        if (bottom > head.top) score += 4 + ((bottom - head.top) / H) * 30;
      } else score += (s.y / H) * 3;
      // Reading order (a Z) against every line placed so far.
      for (const [other, spot] of spots) if (other < index ? readsBefore(s, spot) : readsBefore(spot, s)) score += SCORE.order;
      // A caption tells where and when: it reads first.
      for (const caption of state.captions) if (readsBefore(s, caption)) score += SCORE.order;
      score += (s.y / H) * (more ? 30 : 2) + (index === 0 ? (s.x / W) * 1.5 : 0);
      // The tail must not run over a face (its own speaker's included).
      if (head && state.faces.length) {
        const tail = tailFor(s, head, W, H, state.faces);
        for (let t = 0.25; t <= 1; t += 0.25) {
          const x = tail.from.x + (tail.x - tail.from.x) * t;
          const y = tail.from.y + (tail.y - tail.from.y) * t;
          if (state.faces.some((f) => x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h)) {
            score += SCORE.nearFace;
            break;
          }
        }
      }
      return score;
    };
    let found = best(state, speechCandidates(text.text, pt, W, H, ["ellipse", "box"]), pad, score);
    // Last: the line moves into a caption box along the frame's top or bottom edge, over the border.
    if (found?.face && options.captions) {
      const boxed = best(state, speechCandidates(text.text, pt, W, H, ["caption"]), pad, score, { edge: true });
      if (boxed && boxed.score < found.score) found = boxed;
    }
    if (!found) continue;
    total += found.score;
    const spot = found.spot;
    state.taken.push({ spot: { x: spot.x - 0.5, y: spot.y - 0.5, w: spot.w + 1, h: spot.h + 1 }, weight: 1 });
    spots.set(index, spot);
    const tail = tailFor(spot, head, W, H, state.faces);
    if (head)
      state.taken.push({ spot: { x: Math.min(tail.from.x, tail.x) - 0.5, y: Math.min(tail.from.y, tail.y) - 0.5, w: Math.abs(tail.x - tail.from.x) + 1, h: Math.abs(tail.y - tail.from.y) + 1 }, weight: 0.4 });
    heads.set(text.id, head);
    placed.set(index, {
      id: text.id,
      frame: frame.frame,
      kind: "speech",
      box: { x: spot.x / W, y: spot.y / H, w: spot.w / W, h: spot.h / H },
      tail: { x: tail.x / W, y: tail.y / H },
      pt: Math.round(found.candidate.pt * 10) / 10,
      rotate: 0,
      face: found.face,
      shape: found.candidate.shape,
    });
  }
  const indexes = [...placed.keys()].sort((a, b) => a - b);
  let disorder = false;
  for (let i = 0; i < indexes.length; i++)
    for (let j = i + 1; j < indexes.length; j++) if (readsBefore(spots.get(indexes[j])!, spots.get(indexes[i])!)) disorder = true;
  return { placed: indexes.map((i) => placed.get(i)!), heads, taken: state.taken, score: total, disorder };
}

/**
 * A balloon's tail (mm in the frame): from its edge toward the head, stopping short of it and of
 * any face; down a little when nobody was found.
 */
function tailFor(spot: Spot, head: { x: number; y: number } | null, W: number, H: number, faces: Spot[] = []): { x: number; y: number; from: { x: number; y: number } } {
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  if (!head) return { x: clamp(cx + spot.w * 0.12, 1, W - 1), y: clamp(spot.y + spot.h + Math.min(6, H * 0.06), 1, H - 1), from: { x: cx, y: spot.y + spot.h } };
  const angle = Math.atan2(head.y - cy, head.x - cx);
  const ex = cx + (Math.cos(angle) * spot.w) / 2;
  const ey = cy + (Math.sin(angle) * spot.h) / 2;
  let length = Math.min(Math.max(Math.hypot(head.x - ex, head.y - ey) - 2.5, 3), 16);
  const tip = () => ({ x: clamp(ex + Math.cos(angle) * length, 1, W - 1), y: clamp(ey + Math.sin(angle) * length, 1, H - 1) });
  // The tip points at the head from outside the face: it never pokes into one.
  const inFace = (p: { x: number; y: number }) => faces.some((f) => p.x > f.x - 0.5 && p.x < f.x + f.w + 0.5 && p.y > f.y - 0.5 && p.y < f.y + f.h + 0.5);
  while (length > 2.5 && inFace(tip())) length -= 0.5;
  return { ...tip(), from: { x: ex, y: ey } };
}

/**
 * Whether balloon `s` reads before `other` (comics read in a Z): side by side - their heights
 * overlapping by much of the smaller one - the left one first; otherwise the higher one.
 */
function readsBefore(s: Spot, other: Spot): boolean {
  const shared = Math.min(s.y + s.h, other.y + other.h) - Math.max(s.y, other.y);
  if (shared > 0.4 * Math.min(s.h, other.h)) return s.x + s.w / 2 < other.x + other.w / 2 - 1;
  return s.y + s.h / 2 < other.y + other.h / 2 - 1;
}

/**
 * Balloons read in a Z: where a later line ended up before an earlier one (the room around faces
 * left no other place), the two trade places - each keeps its size, centred where the other was,
 * and its tail turns to its own speaker - unless that covers another text or more faces.
 */
function inReadingOrder(out: PlacedText[], heads: Map<string, { x: number; y: number } | null>, state: FrameState): PlacedText[] {
  const { W, H, faces } = state;
  const mm = (b: PlacedText): Spot => ({ x: b.box.x * W, y: b.box.y * H, w: b.box.w * W, h: b.box.h * H });
  const speech = out.filter((b) => b.kind === "speech");
  for (let i = 0; i < speech.length; i++)
    for (let j = i + 1; j < speech.length; j++) {
      const [early, late] = [speech[i], speech[j]];
      const a = mm(early);
      const b = mm(late);
      if (!readsBefore(b, a)) continue;
      const moved = (balloon: PlacedText, box: Spot, to: Spot): Spot => {
        // Where its lettering stays inside the frame and its shape within the reach.
        const inner = letteringBox(balloon.shape, { x: 0, y: 0, w: box.w, h: box.h }, balloon.pt);
        const [x0, x1] = span(W, box.w, state.reach.left, state.reach.right, inner.x, inner.w, 0);
        const [y0, y1] = span(H, box.h, state.reach.top, state.reach.bottom, inner.y, inner.h, 0);
        return { x: clamp(to.x + to.w / 2 - box.w / 2, x0, Math.max(x0, x1)), y: clamp(to.y + to.h / 2 - box.h / 2, y0, Math.max(y0, y1)), w: box.w, h: box.h };
      };
      const earlyTo = moved(early, a, b);
      const lateTo = moved(late, b, a);
      const others = out.filter((o) => o !== early && o !== late).map(mm);
      const free = (s: Spot) => !others.some((o) => overlaps(o, s));
      // Faces covered or touched by the pair: the swap may not make it worse.
      const near = (shape: BalloonShape, s: Spot) => (coversFace(shape, s, faces) ? 2 : faces.some((f) => shapeTouches(shape, s, grownFace(f))) ? 1 : 0);
      if (overlaps(earlyTo, lateTo) || !free(earlyTo) || !free(lateTo)) continue;
      if (near(early.shape, earlyTo) + near(late.shape, lateTo) > near(early.shape, a) + near(late.shape, b)) continue;
      if (coversFace(early.shape, earlyTo, faces) || coversFace(late.shape, lateTo, faces)) {
        if (!early.face && !late.face) continue;
      }
      for (const [balloon, spot] of [
        [early, earlyTo],
        [late, lateTo],
      ] as const) {
        const tail = tailFor(spot, heads.get(balloon.id) ?? null, W, H, faces);
        balloon.box = { x: spot.x / W, y: spot.y / H, w: spot.w / W, h: spot.h / H };
        balloon.tail = { x: tail.x / W, y: tail.y / H };
        balloon.face = coversFace(balloon.shape, spot, faces);
      }
    }
  return out;
}

const rank = (kind: TextKind) => ({ caption: 0, narration: 0, speech: 1, sfx: 2 })[kind];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** What laying out one panel page needs: its frames (with SAM's masks and the pictures' shapes) and texts. */
export interface PanelPageInput {
  page: number;
  frames: { frame: number; rect: FrameRect; subject: PageSubject | null; aspect: number | null; cast: FrameCast[] }[];
  texts: TextToPlace[];
}

/**
 * How far a frame's balloons may stand out of it: over its border to just short of the gutter's
 * middle between frames, or a little into the margin on the page's outer sides.
 */
function reachOf(rect: FrameRect, gutterMm: number, borderMm: number): Reach {
  const inner = Math.max(0, borderMm + gutterMm / 2 - GUTTER_GAP);
  const outer = borderMm + OUTER_REACH;
  const side = (atEdge: boolean) => (atEdge ? outer : inner);
  return {
    left: side(rect.x <= 1e-6),
    top: side(rect.y <= 1e-6),
    right: side(rect.x + rect.w >= 1 - 1e-6),
    bottom: side(rect.y + rect.h >= 1 - 1e-6),
  };
}

/**
 * The layout with every panel page laid out: each frame's crop keeps SAM's figures in view, and its
 * texts are placed (placeFrameTexts). Picture book pages are left to chooseLayout.
 */
export function layoutPanels(layout: BookLayout, pages: PanelPageInput[], options: PlaceOptions = {}): BookLayout {
  if (!pages.length) return layout;
  const next: BookLayout = { ...layout, pages: { ...layout.pages } };
  const gutter = layout.panels?.gutterMm ?? 3;
  const border = layout.panels?.borderMm ?? 0.8;
  const pt = letteringPt(layout);
  for (const page of pages) {
    const current = layout.pages[String(page.page)] ?? blankPage();
    const frames: PageLayout["frames"] = {};
    const balloons: PlacedText[] = [];
    for (const f of page.frames) {
      const box = frameInner(frameBox(layout.format, f.rect, gutter), border);
      const aspect = f.aspect ?? box.w / box.h;
      const focus = f.subject?.box ? { x: f.subject.box.x + f.subject.box.w / 2, y: f.subject.box.y + f.subject.box.h / 2 } : { x: 0.5, y: 0.5 };
      frames[String(f.frame)] = { focus, aspect };
      const texts = page.texts.filter((t) => t.frame === f.frame);
      if (texts.length)
        balloons.push(...placeFrameTexts({ frame: f.frame, box, aspect, focus, subject: f.subject, cast: f.cast, reach: reachOf(f.rect, gutter, border) }, texts, pt, options));
    }
    next.pages[String(page.page)] = { ...current, options: ["plate"], choice: null, panels: true, frames, balloons };
  }
  return next;
}

/** The theme's lettering font: its own, else the heading font. */
export function letteringFont(theme: BookTheme): { family: string; weight: number } {
  return theme.lettering?.font ?? theme.fonts.heading;
}
