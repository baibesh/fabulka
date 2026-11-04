import { z } from "zod";
import { BASE_LANGUAGES, LanguageSchema, localized, type Language } from "./language";
import { MethodologySlugSchema } from "./methodologies";

// ---- Story formats ---------------------------------------------------------------------------
//
// A format says what a page of a book is made of: a grid of frames (pictures) and texts tied to
// frames. A picture book page is one full frame and a narration; a comic page is three to six
// panels with speech balloons, caption boxes and sound effects. Formats live in the database and
// are edited in the admin like methods (DEFAULT_STORY_FORMATS only seeds it); a method points to
// one. What a format may hold is data; only a new kind of text element needs code (TEXT_KINDS).

/**
 * The kinds of text a page may carry. Each is code: how it is placed, drawn and what SAM looks for
 * in its frame (TEXT_KIND_INFO). A format picks which of them it uses and how long each may be.
 * - narration: the story's prose; on a one-frame page it is laid out like a picture book's text.
 * - caption: a narrator's box in a panel's corner ("Meanwhile, at the park...").
 * - speech: what a character says, in a balloon with a tail pointing at the speaker's head.
 * - sfx: a sound word drawn as lettering in the picture ("SPLASH!").
 */
export const TEXT_KINDS = ["narration", "caption", "speech", "sfx"] as const;
export const TextKindSchema = z.enum(TEXT_KINDS);
export type TextKind = z.infer<typeof TextKindSchema>;

/** What SAM 3.1 may be asked to find in a frame, one concept a request. */
export const SAM_CONCEPTS = ["person", "animal", "face"] as const;
export type SamConcept = (typeof SAM_CONCEPTS)[number];

/**
 * How each kind of text behaves, in code: whether it has a speaker, what SAM finds in a frame that
 * carries it (people and animals so text keeps off them; faces so a balloon points at a head and
 * never covers one), and how it is drawn in a panel.
 */
export const TEXT_KIND_INFO: Record<TextKind, { speaker: boolean; sam: readonly SamConcept[]; panel: "band" | "box" | "balloon" | "sfx" }> = {
  narration: { speaker: false, sam: ["person", "animal"], panel: "band" },
  caption: { speaker: false, sam: ["person", "animal"], panel: "box" },
  speech: { speaker: true, sam: ["person", "animal", "face"], panel: "balloon" },
  sfx: { speaker: false, sam: ["person", "animal"], panel: "sfx" },
};

/** What SAM is asked for in a frame carrying these kinds of text (always people and animals). */
export function samConceptsFor(kinds: Iterable<TextKind>): SamConcept[] {
  const wanted = new Set<SamConcept>(["person", "animal"]);
  for (const kind of kinds) for (const concept of TEXT_KIND_INFO[kind].sam) wanted.add(concept);
  return SAM_CONCEPTS.filter((c) => wanted.has(c));
}

/** A frame's box on the page's live area, 0..1 from its top left. */
export const FrameRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "A frame must stay on the page");
export type FrameRect = z.infer<typeof FrameRectSchema>;

/** The whole page: a picture book's one frame. */
export const FULL_FRAME: FrameRect = { x: 0, y: 0, w: 1, h: 1 };

/** A page grid: its frames in reading order (left to right, top to bottom). */
export const FrameGridSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(40),
  frames: z.array(FrameRectSchema).min(1).max(9),
});
export type FrameGrid = z.infer<typeof FrameGridSchema>;

const r = (x: number, y: number, w: number, h: number): FrameRect => ({ x, y, w, h });

/** Grids the admin offers to add to a format; a format may also have grids of its own. */
export const PRESET_GRIDS: readonly FrameGrid[] = [
  { id: "full", frames: [r(0, 0, 1, 1)] },
  { id: "big-top-2", frames: [r(0, 0, 1, 0.55), r(0, 0.55, 0.5, 0.45), r(0.5, 0.55, 0.5, 0.45)] },
  { id: "two-rows", frames: [r(0, 0, 1, 0.5), r(0, 0.5, 1, 0.5)] },
  { id: "strips-3", frames: [r(0, 0, 1, 1 / 3), r(0, 1 / 3, 1, 1 / 3), r(0, 2 / 3, 1, 1 / 3)] },
  { id: "grid-4", frames: [r(0, 0, 0.5, 0.5), r(0.5, 0, 0.5, 0.5), r(0, 0.5, 0.5, 0.5), r(0.5, 0.5, 0.5, 0.5)] },
  { id: "wide-2-wide", frames: [r(0, 0, 1, 0.36), r(0, 0.36, 0.5, 0.32), r(0.5, 0.36, 0.5, 0.32), r(0, 0.68, 1, 0.32)] },
  { id: "wide-4", frames: [r(0, 0, 1, 0.4), r(0, 0.4, 0.5, 0.3), r(0.5, 0.4, 0.5, 0.3), r(0, 0.7, 0.5, 0.3), r(0.5, 0.7, 0.5, 0.3)] },
  { id: "grid-6", frames: [0, 1, 2].flatMap((row) => [r(0, row / 3, 0.5, 1 / 3), r(0.5, row / 3, 0.5, 1 / 3)]) },
];

/** How long one kind of text may be in a format, and how many of it a frame may carry. */
export const FormatTextRuleSchema = z.object({
  kind: TextKindSchema,
  maxWords: z.number().int().min(1).max(150),
  perFrame: z.number().int().min(1).max(6),
});
export type FormatTextRule = z.infer<typeof FormatTextRuleSchema>;

const FormatTextSchema = z.object({ name: z.string().trim().max(80), summary: z.string().trim().max(300) });
export const StoryFormatTextsSchema = z.partialRecord(LanguageSchema, FormatTextSchema);
export type StoryFormatTexts = z.infer<typeof StoryFormatTextsSchema>;

/** A format's name and summary in `language`, falling back like any localized text. */
export function storyFormatText(texts: StoryFormatTexts, language: Language): { name: string; summary: string } {
  const field = (key: "name" | "summary") => localized(Object.fromEntries(Object.entries(texts).map(([lang, t]) => [lang, t?.[key] ?? ""])), language);
  return { name: field("name"), summary: field("summary") };
}

/** Pages a format's book may have (the service's PAGE_COUNT when a format sets none). */
export const FORMAT_PAGES_MIN = 2;
export const FORMAT_PAGES_MAX = 24;

const promptLines = (max: number) => z.array(z.string().trim().min(1).max(max)).max(12);
const formatAge = z.number().int().min(2).max(12);

const StoryFormatFieldsSchema = z.object({
  texts: StoryFormatTextsSchema,
  ageMin: formatAge,
  ageMax: formatAge,
  /** Story pages a book has; null: the service's default (PAGE_COUNT). */
  pageCount: z.number().int().min(FORMAT_PAGES_MIN).max(FORMAT_PAGES_MAX).nullable(),
  /** The grids a page may use, in order of preference; Muse Spark picks one per page. */
  grids: z.array(FrameGridSchema).min(1).max(12),
  /** The kinds of text the format uses, each with its length and how many a frame may carry. */
  textRules: z.array(FormatTextRuleSchema).min(1).max(TEXT_KINDS.length),
  /** Rules for Muse Spark's scenario, English (the method's rules come on top). */
  rules: promptLines(400),
  /** Replaces the default art style in every picture prompt (a catalog book's own style wins); null: the default. */
  artStyle: z.string().trim().max(400).nullable(),
  /** Said in every frame's picture prompt: where to leave room for text, how to frame faces. Null: nothing. */
  frameDirection: z.string().trim().max(400).nullable(),
  /** Side characters drawn on character sheets of their own and chained like the hero (0: none). */
  castSheets: z.number().int().min(0).max(4),
  /** The theme its books get when the catalog book names none (a theme id); null: by the child's age. */
  theme: z.string().trim().min(1).max(60).nullable(),
  /** The white between panels and the panels' ink border, in millimetres (panel pages only). */
  gutterMm: z.number().min(0).max(12),
  borderMm: z.number().min(0).max(3),
  published: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

function checkFormat(f: z.infer<typeof StoryFormatFieldsSchema>, ctx: z.RefinementCtx) {
  if (f.ageMin > f.ageMax) ctx.addIssue({ code: "custom", path: ["ageMax"], message: "ageMax < ageMin" });
  const ids = f.grids.map((g) => g.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["grids"], message: "Grid ids repeat" });
  const kinds = f.textRules.map((t) => t.kind);
  if (new Set(kinds).size !== kinds.length) ctx.addIssue({ code: "custom", path: ["textRules"], message: "A kind of text is listed twice" });
  if (!f.texts.ru?.name) ctx.addIssue({ code: "custom", path: ["texts", "ru", "name"], message: "Name it in Russian" });
  const missing = BASE_LANGUAGES.filter((lang) => !f.texts[lang]?.name);
  if (f.published && missing.length) {
    ctx.addIssue({ code: "custom", path: ["published"], message: `To publish, name it in ${BASE_LANGUAGES.join(", ")}: missing ${missing.join(", ")}` });
  }
}

/** Body of PUT /admin/story-formats/:slug: the whole format; the slug stays. */
export const UpdateStoryFormatSchema = StoryFormatFieldsSchema.superRefine(checkFormat);
export type UpdateStoryFormat = z.infer<typeof UpdateStoryFormatSchema>;

/** Body of POST /admin/story-formats. */
export const CreateStoryFormatSchema = StoryFormatFieldsSchema.extend({ slug: MethodologySlugSchema }).superRefine(checkFormat);
export type CreateStoryFormat = z.infer<typeof CreateStoryFormatSchema>;

/** A format as stored and as generation reads it. */
export type StoryFormatData = Omit<z.infer<typeof StoryFormatFieldsSchema>, "published" | "sortOrder"> & { slug: string };

/** A format in the admin: every field, what follows it and what a book of it costs. */
export const AdminStoryFormatSchema = StoryFormatFieldsSchema.extend({
  slug: z.string(),
  /** Methods that point to it; while there are any it cannot be deleted. */
  methodologies: z.array(z.string()),
  books: z.number().int(),
  estimate: z.object({ images: z.number().int(), samCalls: z.number().int(), usd: z.number(), seconds: z.number() }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminStoryFormat = z.infer<typeof AdminStoryFormatSchema>;

/** A format as the site names it (a method's card, the admin's pickers). */
export const StoryFormatSummarySchema = z.object({ slug: z.string(), name: z.string(), summary: z.string() });
export type StoryFormatSummary = z.infer<typeof StoryFormatSummarySchema>;

/** Body of a 409 from DELETE /admin/story-formats/:slug: methods or books use it. */
export const STORY_FORMAT_IN_USE = "story_format_in_use";
/** Body of a 409 from POST /admin/story-formats: one with that slug exists. */
export const STORY_FORMAT_EXISTS = "story_format_exists";

/** The format every method had before formats: one picture and its text a page. */
export const PICTURE_BOOK = "picture-book";
export const COMIC = "comic";

/**
 * The formats the service starts with. The API adds the missing ones on start and never overwrites
 * what the admin changed; nothing reads this list at runtime.
 */
export const DEFAULT_STORY_FORMATS: readonly (StoryFormatData & { sortOrder: number })[] = [
  {
    slug: PICTURE_BOOK,
    sortOrder: 0,
    texts: {
      ru: { name: "Книжка с картинками", summary: "Одна картинка и текст на каждой странице: читать вслух вместе." },
      kk: { name: "Суретті кітап", summary: "Әр бетте бір сурет пен мәтін: бірге дауыстап оқуға." },
      en: { name: "Picture book", summary: "One picture and its text on every page, to read aloud together." },
      es: { name: "Libro ilustrado", summary: "Una ilustración y su texto en cada página, para leer en voz alta juntos." },
      de: { name: "Bilderbuch", summary: "Auf jeder Seite ein Bild und sein Text - zum gemeinsamen Vorlesen." },
    },
    ageMin: 2,
    ageMax: 12,
    pageCount: null,
    grids: [{ id: "full", frames: [FULL_FRAME] }],
    textRules: [{ kind: "narration", maxWords: 120, perFrame: 1 }],
    rules: [],
    artStyle: null,
    frameDirection: null,
    castSheets: 0,
    theme: null,
    gutterMm: 0,
    borderMm: 0,
  },
  {
    slug: COMIC,
    sortOrder: 10,
    texts: {
      ru: { name: "Комикс", summary: "Страницы из кадров: реплики в облачках, подписи рассказчика и звуки." },
      kk: { name: "Комикс", summary: "Кадрлардан тұратын беттер: бұлттағы сөздер, баяндаушының жазбалары және дыбыстар." },
      en: { name: "Comic", summary: "Pages of panels with speech balloons, narrator captions and sound effects." },
      es: { name: "Cómic", summary: "Páginas de viñetas con bocadillos, cartelas del narrador y onomatopeyas." },
      de: { name: "Comic", summary: "Seiten aus Panels mit Sprechblasen, Erzählerkästen und Geräuschwörtern." },
    },
    ageMin: 8,
    ageMax: 12,
    pageCount: 8,
    grids: ["big-top-2", "grid-4", "wide-2-wide", "strips-3", "wide-4"].map((id) => PRESET_GRIDS.find((g) => g.id === id)!),
    textRules: [
      { kind: "caption", maxWords: 12, perFrame: 1 },
      { kind: "speech", maxWords: 14, perFrame: 2 },
      { kind: "sfx", maxWords: 2, perFrame: 1 },
    ],
    rules: [
      "Tell each page as panels that read left to right, top to bottom; each panel is one moment.",
      "Most panels carry one or two speech balloons; the hero speaks on every page.",
      "A caption is a short narrator's box (time, place, a jump in the story); at most one on a page's panels out of two.",
      "A sound effect is one or two loud words for a sound in the panel (WHOOSH, SPLASH); use them now and then, not in every panel.",
      "Vary the camera: a wide panel to show the place, medium shots for talk, a closer one for a feeling.",
      "End every page on a small hook that makes the reader turn it.",
    ],
    artStyle:
      "bold clean comic book art for children, crisp confident ink outlines, flat bright colors with soft cel shading, expressive faces, " +
      "dynamic camera angles, no text, no letters, no speech balloons, no panel borders",
    frameDirection:
      "Leave open sky or a plain background across the top quarter of the picture, above everyone's heads, for speech balloons; " +
      "show the face of every character who speaks.",
    castSheets: 2,
    theme: "comic",
    gutterMm: 3,
    borderMm: 0.8,
  },
];

/** The fewest and the most frames a page of the format has. */
export function framesRange(format: Pick<StoryFormatData, "grids">): { min: number; max: number } {
  const counts = format.grids.map((g) => g.frames.length);
  return { min: Math.min(...counts), max: Math.max(...counts) };
}

/** The format's rule for a kind of text, or null when it does not use that kind. */
export function textRule(format: Pick<StoryFormatData, "textRules">, kind: TextKind): FormatTextRule | null {
  return format.textRules.find((t) => t.kind === kind) ?? null;
}

/**
 * The grid a page takes: the one Muse Spark named when the format has it and its frame count is the
 * page's; else the format's first grid with that many frames; else the closest in frame count.
 */
export function gridFor(format: Pick<StoryFormatData, "grids">, id: string | undefined, frames: number): FrameGrid {
  const named = format.grids.find((g) => g.id === id);
  if (named && named.frames.length === frames) return named;
  const same = format.grids.find((g) => g.frames.length === frames);
  if (same) return same;
  return [...format.grids].sort((a, b) => Math.abs(a.frames.length - frames) - Math.abs(b.frames.length - frames))[0];
}

// ---- Cost and time of a book in a format -------------------------------------------------------

/** What the models charge (dev.meta.ai pricing): Muse Image per picture, SAM 3.1 per image read. */
export const MODEL_PRICES = {
  image: 0.01,
  sam: 0.0025,
  /** A Muse Spark scenario of about this many output tokens a frame, plus the review. */
  sparkScenario: 0.012,
  sparkPerFrame: 0.0012,
  sparkReview: 0.004,
} as const;

/** Typical seconds of a call, used for the estimate (generation.ts keeps the measured ones). */
const SECONDS = { story: 31, perFrameWriting: 1.2, review: 5, sheet: 22, frame: 34, mask: 2.5, render: 4 };

/** Frames drawn at once, across the pages of a book (the frames of one page always go together). */
export const FRAME_CONCURRENCY = 6;

/**
 * What one book in the format costs and takes, about: every picture (character sheets, the cover,
 * every frame) at Muse Image's price, every SAM request (each frame's concepts and the cover's) and
 * Muse Spark's scenario and review. Frames are counted at the middle of the format's grids. `pages`
 * is the book's page count; `pet` and `toy` add their sheets.
 */
export function formatEstimate(
  format: Pick<StoryFormatData, "grids" | "textRules" | "castSheets" | "pageCount">,
  options: { pages?: number; pet?: boolean; toy?: boolean } = {},
): { images: number; samCalls: number; usd: number; seconds: number } {
  const pages = format.pageCount ?? options.pages ?? 10;
  const { min, max } = framesRange(format);
  const frames = Math.round(pages * ((min + max) / 2));
  const sheets = 1 + (options.pet ? 1 : 0) + (options.toy ? 1 : 0) + format.castSheets;
  const concepts = samConceptsFor(format.textRules.map((t) => t.kind)).length;
  const images = sheets + 1 + frames;
  const samCalls = frames * concepts + 2;
  const usd = images * MODEL_PRICES.image + samCalls * MODEL_PRICES.sam + MODEL_PRICES.sparkScenario + frames * MODEL_PRICES.sparkPerFrame + MODEL_PRICES.sparkReview;
  const seconds =
    SECONDS.story +
    frames * SECONDS.perFrameWriting +
    SECONDS.review +
    sheets * SECONDS.sheet +
    Math.ceil(frames / FRAME_CONCURRENCY) * (SECONDS.frame + SECONDS.mask) +
    SECONDS.render;
  return { images, samCalls, usd: Math.round(usd * 1000) / 1000, seconds: Math.round(seconds) };
}

// ---- The pipeline, step by step -----------------------------------------------------------------
//
// Every step generation runs has a stable id, the model it calls and the format's parameters it
// uses, so a graph of the pipeline can be drawn per format and each ModelCall row (its `step`,
// `page` and `frame`) found on it.

export const PIPELINE_STEP_IDS = [
  "toy.cutout",
  "toy.describe",
  "story.write",
  "story.review",
  "sheet.hero",
  "sheet.pet",
  "sheet.toy",
  "sheet.cast",
  "frame.draw",
  "frame.rewrite",
  "frame.mask",
  "cover.draw",
  "cover.mask",
  "layout.check",
  "text.shorten",
  /** A finished book translated into another language (an example's new version): every text element. */
  "story.translate",
] as const;
export const PipelineStepIdSchema = z.enum(PIPELINE_STEP_IDS);
export type PipelineStepId = z.infer<typeof PipelineStepIdSchema>;

export interface PipelineStep {
  id: PipelineStepId;
  /** The model it calls: Muse Spark, Muse Image, SAM 3.1, or Chromium for render QA. */
  model: "muse-spark" | "muse-image" | "sam" | "chromium";
  /** What one run is for: the whole book, one cast member, one frame, one text element. */
  per: "book" | "cast" | "frame" | "element";
  /** The steps whose output it takes. */
  after: PipelineStepId[];
  /** The format's settings it uses, as they stand. */
  params: Record<string, unknown>;
  /** Runs only for some books (a toy photo, a pet, a refused picture, text that overflows). */
  optional: boolean;
}

/** The steps a book in this format goes through, with the format's parameters of each. */
export function pipelineFor(format: StoryFormatData): PipelineStep[] {
  const kinds = format.textRules.map((t) => t.kind);
  const steps: PipelineStep[] = [
    { id: "toy.cutout", model: "sam", per: "book", after: [], params: { concept: "toy" }, optional: true },
    { id: "toy.describe", model: "muse-spark", per: "book", after: ["toy.cutout"], params: {}, optional: true },
    {
      id: "story.write",
      model: "muse-spark",
      per: "book",
      after: ["toy.describe"],
      params: { pageCount: format.pageCount, grids: format.grids.map((g) => g.id), textRules: format.textRules, rules: format.rules },
      optional: false,
    },
    { id: "story.review", model: "muse-spark", per: "book", after: ["story.write"], params: {}, optional: false },
    { id: "sheet.hero", model: "muse-image", per: "book", after: ["story.review"], params: { artStyle: format.artStyle }, optional: false },
    { id: "sheet.pet", model: "muse-image", per: "book", after: ["sheet.hero"], params: {}, optional: true },
    { id: "sheet.toy", model: "muse-image", per: "book", after: ["sheet.pet"], params: {}, optional: true },
    { id: "sheet.cast", model: "muse-image", per: "cast", after: ["sheet.toy"], params: { castSheets: format.castSheets }, optional: format.castSheets === 0 },
    {
      id: "frame.draw",
      model: "muse-image",
      per: "frame",
      after: ["sheet.cast"],
      params: { artStyle: format.artStyle, frameDirection: format.frameDirection, concurrency: FRAME_CONCURRENCY },
      optional: false,
    },
    { id: "frame.rewrite", model: "muse-spark", per: "frame", after: ["frame.draw"], params: {}, optional: true },
    { id: "frame.mask", model: "sam", per: "frame", after: ["frame.draw"], params: { concepts: samConceptsFor(kinds) }, optional: false },
    { id: "cover.draw", model: "muse-image", per: "book", after: ["sheet.cast"], params: { artStyle: format.artStyle }, optional: false },
    { id: "cover.mask", model: "sam", per: "book", after: ["cover.draw"], params: { concepts: ["person", "animal"] }, optional: false },
    {
      id: "layout.check",
      model: "chromium",
      per: "book",
      after: ["frame.mask", "cover.mask"],
      params: { gutterMm: format.gutterMm, borderMm: format.borderMm, theme: format.theme },
      optional: false,
    },
    { id: "text.shorten", model: "muse-spark", per: "element", after: ["layout.check"], params: { textRules: format.textRules }, optional: true },
    { id: "story.translate", model: "muse-spark", per: "book", after: ["layout.check"], params: { textRules: format.textRules }, optional: true },
  ];
  return steps;
}
