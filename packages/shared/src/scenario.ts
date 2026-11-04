import { z } from "zod";
import type { PageSubject, PageTone } from "./layout";
import { FULL_FRAME, FrameRectSchema, TEXT_KIND_INFO, TextKindSchema, gridFor, textRule, type FrameRect, type StoryFormatData, type TextKind } from "./formats";

// ---- The scenario Muse Spark writes, and a page as a book keeps it --------------------------------
//
// One universal shape for every format: a page is a grid of frames (pictures) and texts tied to
// frames. Muse Spark writes it (StorySchema); the API stores it (StoredPage); books made before
// formats (one picture and one text a page) are read through normalizePage, losslessly, as one full
// frame and a narration.

/** Where a character stands in a frame, so SAM's figures can be matched to who speaks. */
export const CAST_POSITIONS = ["left", "center", "right"] as const;
export const CastPositionSchema = z.enum(CAST_POSITIONS);
export type CastPosition = z.infer<typeof CastPositionSchema>;

/** Who a frame shows, by id ("hero", "pet", "toy" or a cast member's id), and where. */
export const FrameCastSchema = z.object({ id: z.string().trim().min(1).max(40), at: CastPositionSchema.optional().catch(undefined) });
export type FrameCast = z.infer<typeof FrameCastSchema>;

export const ScenarioFrameSchema = z.object({
  frame: z.number().int().min(1),
  scene_prompt: z.string().min(1),
  cast: z.array(FrameCastSchema).max(8).default([]).catch([]),
});

export const ScenarioTextSchema = z.object({
  kind: TextKindSchema,
  /** The frame it belongs to (1-based); a narration of a one-frame page is in frame 1. */
  frame: z.number().int().min(1).default(1),
  /** Who speaks a balloon: "hero", "pet", "toy" or a cast member's id; null for the other kinds. */
  speaker: z.string().trim().max(40).nullable().default(null).catch(null),
  text: z.string().min(1),
});

/**
 * One page as Muse Spark returns it. A page in the older shape ({ text, scene_prompt }, what Spark
 * wrote before formats) is read as one full frame with its narration.
 */
export const StoryPageSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const page = raw as Record<string, unknown>;
    if (Array.isArray(page.frames)) return page;
    return {
      ...page,
      grid: page.grid ?? "full",
      frames: [{ frame: 1, scene_prompt: page.scene_prompt }],
      texts: typeof page.text === "string" ? [{ kind: "narration", frame: 1, text: page.text }] : [],
    };
  },
  z.object({
    page: z.number().int().min(1),
    /** The method beat the page tells (1 = the first of the method's structure), as Muse Spark tagged it. */
    beat: z.number().int().optional().catch(undefined),
    /** The format's grid it uses (FrameGrid id). */
    grid: z.string().max(40).optional().catch(undefined),
    frames: z.array(ScenarioFrameSchema).min(1).max(9),
    texts: z.array(ScenarioTextSchema).max(30),
  }),
);
export type StoryPage = z.infer<typeof StoryPageSchema>;

/** A side character (or a thing that recurs, like a scooter) described once, for every picture it is in. */
export const CastMemberSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((id) => id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cast"),
  name: z.string().trim().min(1).max(60),
  /** English, for the illustrator: species or age, skin tone, hair, clothes and colors; or a thing's exact look. */
  look: z.string().trim().min(1).max(400),
  /** A character (drawn on a sheet of its own when the format allows) or a recurring thing (its look repeated). */
  kind: z.enum(["character", "thing"]).default("character").catch("character"),
});
export type CastMember = z.infer<typeof CastMemberSchema>;

export const StorySchema = z.object({
  title: z.string().min(1),
  hero_description: z.string().min(1),
  /** The pet's look, or null when the child has no pet. */
  pet_description: z.string().min(1).nullable().default(null),
  /** Side characters and recurring things, each described once; most important first. */
  cast: z.array(CastMemberSchema).max(8).default([]).catch([]),
  pages: z.array(StoryPageSchema).min(1),
  /** Questions for the parent to ask while reading together, in the book's language. */
  talk_questions: z.array(z.string().min(1)).min(3).max(5),
  /** The front cover's picture (English): the hero in the story's most joyful moment; null: none given. */
  cover_scene: z.string().trim().min(1).max(600).nullable().default(null).catch(null),
  /** Two short sentences for the back cover, in the book's language; null: none given. */
  blurb: z.string().trim().min(1).max(400).nullable().default(null).catch(null),
});
export type Story = z.infer<typeof StorySchema>;

/** How a frame's picture came about (illustrateFrame); "refused": every version was refused, no picture. */
export type ArtOutcome = "drawn" | "softened" | "rewritten" | "refused";

/** A frame as a book keeps it. */
export interface StoredFrame {
  frame: number;
  /** Its box on the page's live area (0..1). */
  rect: FrameRect;
  scenePrompt: string;
  cast: FrameCast[];
  imagePath: string | null;
  /** Where SAM found the characters; null when SAM failed, missing before it ran. */
  subject?: PageSubject | null;
  /** How light the picture is where, measured when the book was first rendered. */
  tone?: PageTone | null;
  art?: ArtOutcome;
}

/** A text element as a book keeps it; `id` is stable within the page ("1.1": frame 1, first text). */
export interface StoredText {
  id: string;
  kind: TextKind;
  frame: number;
  speaker: string | null;
  text: string;
}

/** A story page as a book keeps it (Book.pages). */
export interface StoredPage {
  page: number;
  /** The method beat the page tells (1 = the first); missing for books made before beats. */
  beat?: number | null;
  /** The grid's id; "full" for a picture book page. */
  grid: string;
  frames: StoredFrame[];
  texts: StoredText[];
}

/** A page as books made before formats kept it: one picture, one text. */
interface LegacyPage {
  page: number;
  beat?: number | null;
  text?: string;
  scenePrompt?: string;
  imagePath?: string | null;
  subject?: StoredFrame["subject"];
  tone?: StoredFrame["tone"];
  art?: ArtOutcome;
}

/**
 * Any stored page in today's shape. A page of a book made before formats becomes one full frame
 * (its picture, SAM mask, tone and how it was drawn) and one narration (its text): nothing is lost,
 * and the renderer lays such a page out exactly as before.
 */
export function normalizePage(raw: unknown): StoredPage {
  const page = (raw ?? {}) as Partial<StoredPage> & LegacyPage;
  if (Array.isArray(page.frames)) {
    return {
      page: page.page,
      beat: page.beat,
      grid: page.grid ?? "full",
      frames: page.frames.map((f) => ({ ...f, rect: f.rect ?? FULL_FRAME, cast: f.cast ?? [] })),
      texts: (page.texts ?? []).map((t, i) => ({ ...t, id: t.id ?? `${t.frame ?? 1}.${i + 1}`, frame: t.frame ?? 1, speaker: t.speaker ?? null })),
    };
  }
  const frame: StoredFrame = {
    frame: 1,
    rect: FULL_FRAME,
    scenePrompt: page.scenePrompt ?? "",
    cast: [],
    imagePath: page.imagePath ?? null,
    ...(page.subject !== undefined && { subject: page.subject }),
    ...(page.tone !== undefined && { tone: page.tone }),
    ...(page.art !== undefined && { art: page.art }),
  };
  return {
    page: page.page,
    ...(page.beat !== undefined && { beat: page.beat }),
    grid: "full",
    frames: [frame],
    texts: typeof page.text === "string" ? [{ id: "1.1", kind: "narration", frame: 1, speaker: null, text: page.text }] : [],
  };
}

/** Every stored page of a book (Book.pages) in today's shape. */
export function normalizePages(raw: unknown): StoredPage[] {
  return Array.isArray(raw) ? raw.map(normalizePage) : [];
}

/** Every picture file a page keeps, frame by frame. */
export function pageImagePaths(page: Pick<StoredPage, "frames">): string[] {
  return page.frames.map((f) => f.imagePath).filter((p): p is string => Boolean(p));
}

/** The page's prose as one text: its narration (or captions), for lists, search and the old API field. */
export function pageProse(page: { texts: Pick<StoredText, "kind" | "text">[] }): string {
  const narration = page.texts.filter((t) => t.kind === "narration");
  const list = narration.length ? narration : page.texts.filter((t) => t.kind !== "sfx");
  return list.map((t) => t.text).join("\n");
}

/**
 * A page laid out as panels (a grid of frames with balloons and boxes), not as a picture book page:
 * it has more than one frame, a frame that is not the whole page, or text other than narration.
 */
export function isPanelPage(page: { frames: { rect?: FrameRect }[]; texts: { kind: TextKind }[] }): boolean {
  if (page.frames.length !== 1) return true;
  const rect = page.frames[0].rect ?? FULL_FRAME;
  if (rect.x > 0.001 || rect.y > 0.001 || rect.w < 0.999 || rect.h < 0.999) return true;
  return page.texts.some((t) => t.kind !== "narration");
}

/** A frame's key in a book: "3.2" is page 3's second frame. */
export const frameKey = (page: number, frame: number) => `${page}.${frame}`;

/**
 * Muse Spark's page made fit for the format: the grid it named (or the closest one with as many
 * frames; frames beyond the format's largest grid are dropped), each frame's box from that grid,
 * texts only of the format's kinds, at most as many a frame as the format allows, in frames that
 * exist, with stable ids. The words are kept as written: render QA shortens what does not fit.
 */
export function storedPageFrom(page: StoryPage, format: Pick<StoryFormatData, "grids" | "textRules">, beat: number | null): StoredPage {
  const largest = Math.max(...format.grids.map((g) => g.frames.length));
  const frames = page.frames.slice(0, largest);
  const grid = gridFor(format, page.grid, frames.length);
  // A grid with fewer frames than Spark drew: the extra frames go.
  const kept = frames.slice(0, grid.frames.length);
  const counts = new Map<string, number>();
  const texts: StoredText[] = [];
  for (const text of page.texts) {
    const rule = textRule(format, text.kind);
    if (!rule) continue;
    const frame = Math.min(Math.max(text.frame, 1), kept.length);
    const key = `${frame}:${text.kind}`;
    const n = (counts.get(key) ?? 0) + 1;
    if (n > rule.perFrame) continue;
    counts.set(key, n);
    const inFrame = texts.filter((t) => t.frame === frame).length + 1;
    texts.push({
      id: `${frame}.${inFrame}`,
      kind: text.kind,
      frame,
      speaker: TEXT_KIND_INFO[text.kind].speaker ? (text.speaker ?? "hero") : null,
      text: text.text,
    });
  }
  return {
    page: page.page,
    beat,
    grid: grid.id,
    frames: kept.map((f, i) => ({ frame: i + 1, rect: grid.frames[i], scenePrompt: f.scene_prompt, cast: f.cast, imagePath: null })),
    texts,
  };
}
