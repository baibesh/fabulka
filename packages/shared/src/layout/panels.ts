import type { FrameRect, TextKind } from "../formats";
import type { FrameCast } from "../scenario";
import { GRID, gridCell, objectPosition, type PageSubject } from "./choose";
import type { BookFormat, BookLayout, BookTheme, Focus, PageLayout, PlacedText } from "./model";
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
/** Cells per side of a frame's occupancy grid. */
const CELLS = 32;
/** What covering one cell costs: a face is never covered, a body only when nothing else is free. */
const COST = { body: 1, nearFace: 20, face: 40 } as const;
/** Covering another text (or its tail) costs more than anything in the picture: texts never overlap. */
const OVER_TEXT = 20000;
/** How much of a face's box (around it) counts as the face. */
const FACE_MARGIN = { x: 0.15, y: 0.25 };
/** The smallest share of the lettering size a balloon may shrink to, to keep off a face. */
const SMALLER = 0.88;
/** Line height of the lettering. */
const LINE = 1.16;
/** Width of a capital letter of the lettering, in em (Nunito ExtraBold capitals are wide). */
const CAP_EM = 0.7;

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
  return { w: Math.min(maxW, Math.max(...lines)), h: lines.length * em * LINE, lines: lines.length };
}

/** What placing a frame's texts needs to know of the frame. */
export interface FrameToPlace {
  frame: number;
  /** Its box on the page, mm. */
  box: Rect;
  /** The picture's width / height and the point the crop keeps in view. */
  aspect: number;
  focus: Focus;
  /** SAM's mask; null when SAM failed or the frame has no picture. */
  subject: PageSubject | null;
  /** Who the scene shows and where, from the scenario. */
  cast: FrameCast[];
}

export interface TextToPlace {
  id: string;
  kind: TextKind;
  frame: number;
  speaker: string | null;
  text: string;
}

/** A box in the frame, mm from its top left. */
interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A frame's occupancy grid: what covering each cell costs. */
class Occupancy {
  readonly cells = new Float32Array(CELLS * CELLS);
  constructor(
    readonly w: number,
    readonly h: number,
  ) {}

  private range(s: Spot): [number, number, number, number] {
    const x0 = Math.max(0, Math.floor((s.x / this.w) * CELLS));
    const y0 = Math.max(0, Math.floor((s.y / this.h) * CELLS));
    const x1 = Math.min(CELLS, Math.ceil(((s.x + s.w) / this.w) * CELLS));
    const y1 = Math.min(CELLS, Math.ceil(((s.y + s.h) / this.h) * CELLS));
    return [x0, y0, x1, y1];
  }

  mark(s: Spot, value: number) {
    const [x0, y0, x1, y1] = this.range(s);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.cells[y * CELLS + x] = Math.max(this.cells[y * CELLS + x], value);
  }

  /** The mean cost under a box, and the most costly cell. */
  cost(s: Spot): { mean: number; max: number } {
    const [x0, y0, x1, y1] = this.range(s);
    let sum = 0;
    let n = 0;
    let max = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const v = this.cells[y * CELLS + x];
        sum += v;
        max = Math.max(max, v);
        n++;
      }
    return n ? { mean: sum / n, max } : { mean: 1, max: 1 };
  }
}

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

/** The frame's occupancy from SAM: bodies from the mask, faces (with a margin) from their boxes. */
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
      if (gridCell(subject, gx, gy)) occ.cells[cy * CELLS + cx] = COST.body;
    }
  for (const face of subject.faces ?? []) {
    const f = boxToFrame(frame, face);
    occ.mark({ x: f.x - f.w * FACE_MARGIN.x, y: f.y - f.h * FACE_MARGIN.y, w: f.w * (1 + 2 * FACE_MARGIN.x), h: f.h * (1 + 2 * FACE_MARGIN.y) }, COST.nearFace);
    occ.mark(f, COST.face);
  }
  return occ;
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

/** Grid search: the cheapest place for a box of this size, by `score` (lower is better). */
type Cost = { mean: number; max: number };

function search(
  occ: Occupancy,
  taken: Occupancy,
  w: number,
  h: number,
  pad: number,
  score: (s: Spot, cost: Cost) => number,
): { spot: Spot; cost: Cost } | null {
  const stepX = Math.max(1, (occ.w - w) / 36);
  const stepY = Math.max(1, (occ.h - h) / 36);
  let best: { spot: Spot; cost: { mean: number; max: number }; score: number } | null = null;
  for (let y = pad; y + h <= occ.h - pad + 1e-6; y += stepY)
    for (let x = pad; x + w <= occ.w - pad + 1e-6; x += stepX) {
      const spot = { x, y, w, h };
      const cost = occ.cost(spot);
      const over = taken.cost(spot);
      // Any cell of another balloon under it is worse than any face: lettering on lettering cannot be read.
      const s = score(spot, cost) + over.mean * OVER_TEXT + (over.max >= 1 ? OVER_TEXT / 4 : 0);
      if (!best || s < best.score) best = { spot, cost, score: s };
    }
  return best;
}

/**
 * Every text of one frame placed, in reading order: the caption in the corner that covers least (the
 * top left first), each balloon near and above its speaker's head with its tail toward it - the
 * first further up and left, the next below or right of it - and sound effects big and tilted where
 * the picture is free. Faces cost so much that a balloon covers one only when the frame has no other
 * room (then `face` is set). Boxes are returned as shares of the frame.
 */
export function placeFrameTexts(frame: FrameToPlace, texts: TextToPlace[], pt: number): PlacedText[] {
  const occ = occupancy(frame);
  // The texts placed so far (1) and their tails (0.4), apart from the picture's figures and faces.
  const taken = new Occupancy(frame.box.w, frame.box.h);
  const { w: W, h: H } = frame.box;
  const pad = Math.min(2, W * 0.02);
  const em = pt * PT_MM;
  const out: PlacedText[] = [];
  const share = (s: Spot) => ({ x: s.x / W, y: s.y / H, w: s.w / W, h: s.h / H });
  const ordered = [...texts].sort((a, b) => rank(a.kind) - rank(b.kind));
  let last: Spot | null = null;
  let k = 0;
  const heads = new Map<string, { x: number; y: number } | null>();
  for (const text of ordered) {
    if (text.kind === "caption" || text.kind === "narration") {
      const wide = text.kind === "narration";
      const maxW = wide ? W - 2 * pad : Math.max(24, W * 0.62);
      // The box's padding (0.55 em a side, 0.3 em above and below) and its ink border, with room to spare.
      const size = letteringSize(text.text, pt, maxW - em * 1.5 - 1.2);
      const w = wide ? W - 2 * pad : Math.min(W, size.w + em * 1.5 + 1.2);
      const h = size.h + em * 0.9 + 1.2;
      const corners: Spot[] = wide
        ? [{ x: pad, y: H - h - pad, w, h }, { x: pad, y: pad, w, h }]
        : [
            { x: 0, y: 0, w, h },
            { x: W - w, y: 0, w, h },
            { x: 0, y: H - h, w, h },
            { x: W - w, y: H - h, w, h },
          ];
      const rankOf = (spot: Spot, i: number) => {
        const cost = occ.cost(spot);
        return cost.mean * 10 + cost.max + i * 0.4 + taken.cost(spot).mean * OVER_TEXT;
      };
      const pick = corners.map((spot, i) => ({ spot, cost: occ.cost(spot), rank: rankOf(spot, i) })).sort((a, b) => a.rank - b.rank)[0];
      taken.mark({ x: pick.spot.x - 1, y: pick.spot.y - 1, w: pick.spot.w + 2, h: pick.spot.h + 2 + em * 0.4 }, 1);
      out.push({ id: text.id, frame: frame.frame, kind: text.kind, box: share(pick.spot), tail: null, pt, rotate: 0, face: pick.cost.max >= COST.face });
      continue;
    }
    if (text.kind === "sfx") {
      const big = pt * 2.1;
      const size = letteringSize(text.text, big, W * 0.7);
      const w = size.w + big * PT_MM * 0.4;
      const h = size.h + big * PT_MM * 0.2;
      const found = search(occ, taken, w, h, pad, (s, c) => c.mean * 12 + c.max * 2 + Math.abs(s.y / H - 0.3) * 2);
      if (!found) continue;
      taken.mark(found.spot, 1);
      out.push({ id: text.id, frame: frame.frame, kind: "sfx", box: share(found.spot), tail: null, pt: big, rotate: -7, face: found.cost.max >= COST.face });
      continue;
    }
    // A speech balloon: an ellipse around the lettering, with a tail toward the speaker's head.
    const head = headOf(frame, text.speaker);
    const first = k === 0;
    const previous: Spot | null = last;
    const place = (size: number) => {
      const maxW = Math.min(W * 0.5, 54);
      const letters = letteringSize(text.text, size, Math.max(16, maxW));
      const m = size * PT_MM;
      const w = letters.w * 1.24 + m * 1.6;
      const h = letters.h * 1.3 + m * 1.1;
      return search(occ, taken, Math.min(w, W - 2 * pad), Math.min(h, H - 2 * pad), pad, (s, c) => {
        let score = c.mean * 60 + (c.max >= COST.nearFace ? 150 : 0) + (c.max >= COST.face ? 400 : 0);
        if (head) {
          const cx = s.x + s.w / 2;
          const bottom = s.y + s.h;
          score += (Math.hypot(cx - head.x, bottom - head.top) / W) * 12;
          if (bottom > head.top) score += 4 + ((bottom - head.top) / H) * 30;
        } else score += (s.y / H) * 3;
        // Reading order: a later balloon sits lower, or to the right at the same height.
        if (previous) {
          if (s.y + s.h / 2 < previous.y + previous.h / 2 - 1) score += 120;
          if (s.x + s.w <= previous.x + 1 && s.y < previous.y + previous.h) score += 60;
        }
        score += (s.y / H) * 2 + (first ? (s.x / W) * 1.5 : 0);
        return score;
      });
    };
    // A crowded panel: smaller lettering (down to SMALLER of the size) rather than a balloon on a face.
    let size = pt;
    let found = place(size);
    if (found && found.cost.max >= COST.face) {
      const smaller = place(pt * SMALLER);
      if (smaller && smaller.cost.max < COST.face) {
        found = smaller;
        size = pt * SMALLER;
      }
    }
    if (!found) continue;
    const spot = found.spot;
    taken.mark({ x: spot.x - 1, y: spot.y - 1, w: spot.w + 2, h: spot.h + 2 }, 1);
    last = spot;
    k++;
    const tail = tailFor(spot, head, W, H);
    if (head) taken.mark({ x: Math.min(tail.from.x, tail.x) - 1, y: Math.min(tail.from.y, tail.y) - 1, w: Math.abs(tail.x - tail.from.x) + 2, h: Math.abs(tail.y - tail.from.y) + 2 }, 0.4);
    heads.set(text.id, head);
    out.push({ id: text.id, frame: frame.frame, kind: "speech", box: share(spot), tail: { x: tail.x / W, y: tail.y / H }, pt: Math.round(size * 10) / 10, rotate: 0, face: found.cost.max >= COST.face });
  }
  return inReadingOrder(out, heads, occ, W, H);
}

/** A balloon's tail (mm in the frame): from its edge toward the head, stopping short of it; down a little when nobody was found. */
function tailFor(spot: Spot, head: { x: number; y: number } | null, W: number, H: number): { x: number; y: number; from: { x: number; y: number } } {
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  if (!head) return { x: clamp(cx + spot.w * 0.12, 1, W - 1), y: clamp(spot.y + spot.h + Math.min(6, H * 0.06), 1, H - 1), from: { x: cx, y: spot.y + spot.h } };
  const angle = Math.atan2(head.y - cy, head.x - cx);
  const ex = cx + (Math.cos(angle) * spot.w) / 2;
  const ey = cy + (Math.sin(angle) * spot.h) / 2;
  const length = Math.min(Math.max(Math.hypot(head.x - ex, head.y - ey) - 2.5, 3), 16);
  return { x: clamp(ex + Math.cos(angle) * length, 1, W - 1), y: clamp(ey + Math.sin(angle) * length, 1, H - 1), from: { x: ex, y: ey } };
}

/**
 * Balloons read top to bottom: where a later line ended up above an earlier one (the room around
 * faces left no other place), the two trade places - each keeps its size, centred where the other
 * was, and its tail turns to its own speaker - unless that covers another text or more faces.
 */
function inReadingOrder(out: PlacedText[], heads: Map<string, { x: number; y: number } | null>, occ: Occupancy, W: number, H: number): PlacedText[] {
  const mm = (b: PlacedText): Spot => ({ x: b.box.x * W, y: b.box.y * H, w: b.box.w * W, h: b.box.h * H });
  const centreY = (b: PlacedText) => (b.box.y + b.box.h / 2) * H;
  const overlaps = (a: Spot, b: Spot) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const speech = out.filter((b) => b.kind === "speech");
  for (let i = 0; i < speech.length; i++)
    for (let j = i + 1; j < speech.length; j++) {
      const [early, late] = [speech[i], speech[j]];
      const a = mm(early);
      const b = mm(late);
      // Out of order: the later line is higher, or beside the earlier one on its left.
      const higher = centreY(late) < centreY(early) - 1;
      const besideLeft = b.x + b.w <= a.x + 1 && b.y < a.y + a.h && a.y < b.y + b.h;
      if (!higher && !besideLeft) continue;
      const moved = (box: Spot, to: Spot): Spot => {
        const x = clamp(to.x + to.w / 2 - box.w / 2, 0, W - box.w);
        const y = clamp(to.y + to.h / 2 - box.h / 2, 0, H - box.h);
        return { x, y, w: box.w, h: box.h };
      };
      const earlyTo = moved(a, b);
      const lateTo = moved(b, a);
      const others = out.filter((o) => o !== early && o !== late).map(mm);
      const free = (s: Spot) => !others.some((o) => overlaps(o, s));
      const faces = (...spots: Spot[]) => spots.filter((s) => occ.cost(s).max >= COST.face).length;
      // The swap may not cover more faces than the balloons already do, nor any other text.
      if (overlaps(earlyTo, lateTo) || !free(earlyTo) || !free(lateTo) || faces(earlyTo, lateTo) > faces(a, b)) continue;
      for (const [balloon, spot] of [
        [early, earlyTo],
        [late, lateTo],
      ] as const) {
        const tail = tailFor(spot, heads.get(balloon.id) ?? null, W, H);
        balloon.box = { x: spot.x / W, y: spot.y / H, w: spot.w / W, h: spot.h / H };
        balloon.tail = { x: tail.x / W, y: tail.y / H };
        balloon.face = occ.cost(spot).max >= COST.face;
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
 * The layout with every panel page laid out: each frame's crop keeps SAM's figures in view, and its
 * texts are placed (placeFrameTexts). Picture book pages are left to chooseLayout.
 */
export function layoutPanels(layout: BookLayout, pages: PanelPageInput[]): BookLayout {
  if (!pages.length) return layout;
  const next: BookLayout = { ...layout, pages: { ...layout.pages } };
  const gutter = layout.panels?.gutterMm ?? 3;
  const pt = letteringPt(layout);
  for (const page of pages) {
    const current = layout.pages[String(page.page)] ?? blankPage();
    const frames: PageLayout["frames"] = {};
    const balloons: PlacedText[] = [];
    for (const f of page.frames) {
      const box = frameBox(layout.format, f.rect, gutter);
      const aspect = f.aspect ?? box.w / box.h;
      const focus = f.subject?.box ? { x: f.subject.box.x + f.subject.box.w / 2, y: f.subject.box.y + f.subject.box.h / 2 } : { x: 0.5, y: 0.5 };
      frames[String(f.frame)] = { focus, aspect };
      const texts = page.texts.filter((t) => t.frame === f.frame);
      if (texts.length) balloons.push(...placeFrameTexts({ frame: f.frame, box, aspect, focus, subject: f.subject, cast: f.cast }, texts, pt));
    }
    next.pages[String(page.page)] = { ...current, options: ["plate"], choice: null, panels: true, frames, balloons };
  }
  return next;
}

/** The theme's lettering font: its own, else the heading font. */
export function letteringFont(theme: BookTheme): { family: string; weight: number } {
  return theme.lettering?.font ?? theme.fonts.heading;
}
