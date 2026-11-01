import { z } from "zod";
import { LanguageSchema } from "../language";

/**
 * How a story page is laid out. A theme lists the ones it uses in order of preference; the chooser
 * keeps those that suit the picture and falls back to "plate", which always works.
 * - overlay-bottom / overlay-top: the picture fills the page, the text sits on its calm third.
 * - split: the picture on the top of the page, the text beside it on paper below.
 * - facing: the picture on the left page, the text on its own page on the right.
 * - spread: one picture across both pages, the text over the calmer half.
 * - plate: the picture fills the page, the text on a paper plate over it.
 */
export const PAGE_VARIANTS = ["overlay-bottom", "overlay-top", "split", "facing", "spread", "plate"] as const;
export const PageVariantSchema = z.enum(PAGE_VARIANTS);
export type PageVariant = z.infer<typeof PageVariantSchema>;

/** Variants that take two facing pages, so they must start on a left page. */
export const TWO_PAGE_VARIANTS: readonly PageVariant[] = ["facing", "spread"];
export const isTwoPage = (variant: PageVariant) => TWO_PAGE_VARIANTS.includes(variant);

/**
 * Parts of a book. "story" stands for all the story pages, in the story's order; "photo" is a page
 * with the parent's photo of the child (shown only once a photo is uploaded).
 */
export const BLOCK_KINDS = ["cover", "dedication", "story", "talk", "drawing", "photo", "end"] as const;
export const BlockKindSchema = z.enum(BLOCK_KINDS);
export type BlockKind = z.infer<typeof BlockKindSchema>;

/**
 * A block in the book's order. The template decides which blocks there are and which the parent
 * may move or leave out; the cover, the story and the end never move. A drawing block is one page.
 */
export const LayoutBlockSchema = z.object({
  kind: BlockKindSchema,
  movable: z.boolean(),
  optional: z.boolean(),
});
export type LayoutBlock = z.infer<typeof LayoutBlockSchema>;

/** A printed size. Bleed is what the printer trims off; text stays inside the safe zone. */
export const BookFormatSchema = z.object({
  id: z.string(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  bleedMm: z.number().min(0),
  safeMm: z.number().min(0),
});
export type BookFormat = z.infer<typeof BookFormatSchema>;

export const FontRefSchema = z.object({ family: z.string(), weight: z.number().int() });
export type FontRef = z.infer<typeof FontRefSchema>;

/** Type sizes for one age band, and how many words a story page may have at that size. */
export const TypeScaleSchema = z.object({
  bodyPt: z.number().positive(),
  lineHeight: z.number().positive(),
  titlePt: z.number().positive(),
  headingPt: z.number().positive(),
  maxWords: z.number().int().positive(),
});
export type TypeScale = z.infer<typeof TypeScaleSchema>;

export const AGE_GROUPS = ["young", "middle", "older"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

/** Type sizes a theme may use per age band (points), and words a page may hold. */
export const AGE_LIMITS: Record<AgeGroup, { bodyPt: [number, number]; maxWords: number }> = {
  young: { bodyPt: [16, 26], maxWords: 40 },
  middle: { bodyPt: [13, 22], maxWords: 70 },
  older: { bodyPt: [11, 18], maxWords: 110 },
};

export const ORNAMENTS = ["leaf", "star", "flower", "sparkle"] as const;

export const ThemePaletteSchema = z.object({
  paper: z.string(),
  ink: z.string(),
  accent: z.string(),
  muted: z.string(),
  cover: z.string(),
  /** Behind the cover title and under text on a plate. */
  plate: z.string(),
});

/**
 * A curated look: fonts, sizes by age, colors, the page layouts it uses and its cover. Not a free
 * editor: themes live in code (and later come from Muse Spark, checked and approved by staff).
 */
export const BookThemeSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  /** "curated": in code, named in the UI's messages; "ai": proposed by Muse Spark, approved by staff. */
  source: z.enum(["curated", "ai"]).default("curated"),
  /** An AI theme's name by language (a curated theme's name is in the UI's messages). */
  name: z.partialRecord(LanguageSchema, z.string().max(60)).optional(),
  /** Hidden from pickers: the look books had before themes, kept so they still render the same. */
  legacy: z.boolean().default(false),
  /** Book languages both fonts fully cover (checked by a unit test against the font files). */
  languages: z.array(LanguageSchema),
  fonts: z.object({ heading: FontRefSchema, body: FontRefSchema }),
  sizes: z.object({ young: TypeScaleSchema, middle: TypeScaleSchema, older: TypeScaleSchema }),
  /** The smallest share of the body size render QA may shrink text to before it gives up. */
  minFit: z.number().min(0.5).max(1),
  /** Contrast text over a picture must reach against what is under it (WCAG ratio). */
  minContrast: z.number().min(1),
  palette: ThemePaletteSchema,
  variants: z.array(PageVariantSchema).min(1),
  /** Where pictures are asked to leave calm space for text. */
  textSpace: z.enum(["top", "bottom"]).nullable(),
  cover: z.enum(["framed", "scene"]),
  /** Drawn as SVG, so it never depends on a font having the glyph. */
  ornament: z.enum(ORNAMENTS),
  /** An AI theme's drawn ornament (a storage path), used instead of the SVG one; null: the SVG. */
  ornamentImage: z.string().nullable().default(null),
});
export type BookTheme = z.infer<typeof BookThemeSchema>;

/**
 * The parent's photo of the child: a JPEG the API re-encoded (metadata, location included, stripped)
 * next to the book's pictures, never sent to any model. `path` is its storage path.
 */
export const BookPhotoSchema = z.object({
  path: z.string(),
  /** Plain text under the photo (escaped by the renderer); null: none. */
  caption: z.string().nullable().default(null),
  /** Width / height of the stored JPEG. */
  aspect: z.number().positive(),
});
export type BookPhoto = z.infer<typeof BookPhotoSchema>;

/** A point in a picture, 0..1 from the top left: what the crop keeps in view. */
export const FocusSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export type Focus = z.infer<typeof FocusSchema>;

/** One story page's layout: what suits its picture, and what staff or the parent picked. */
export const PageLayoutSchema = z.object({
  /** Variants that suit the picture, best first; "plate" last. */
  options: z.array(PageVariantSchema),
  /** Set by staff in the admin: used even when the chooser would not pick it. */
  pin: PageVariantSchema.nullable().default(null),
  /** Picked by the parent among the options before ordering. */
  choice: PageVariantSchema.nullable().default(null),
  /** Variants whose text did not fit even at the smallest size (render QA). */
  tooFull: z.array(PageVariantSchema).default([]),
  /** The hero's centre in the picture (SAM), which the crop keeps in view. */
  focus: FocusSchema.default({ x: 0.5, y: 0.5 }),
  /** The picture's width / height, for the crop. */
  aspect: z.number().positive().default(1.5),
  /** Text color over the picture, by variant: dark ink or white. */
  ink: z.partialRecord(PageVariantSchema, z.enum(["dark", "light"])).default({}),
  /** Where the plate goes. */
  plateBand: z.enum(["top", "bottom"]).default("bottom"),
  /** Which half of a spread carries the text. */
  spreadSide: z.enum(["left", "right"]).default("right"),
});
export type PageLayout = z.infer<typeof PageLayoutSchema>;

export const RENDER_ISSUE_KINDS = ["overflow", "fallback-font"] as const;
/** Things render QA tells staff without blocking print: "crop" — a picture too narrow for the format's layouts. */
export const RENDER_NOTE_KINDS = ["crop"] as const;
export const RenderIssueSchema = z.object({
  /** The rendered page's key: "cover", "story-3", "talk"… */
  page: z.string(),
  kind: z.enum(RENDER_ISSUE_KINDS),
  detail: z.string(),
});
export type RenderIssue = z.infer<typeof RenderIssueSchema>;

/**
 * What render QA found when the PDF was last made. "shrunk": some text was made smaller to fit;
 * "blocked": something still does not fit or a letter fell back to a system font, so it is not printed.
 */
export const LayoutQaSchema = z.object({
  status: z.enum(["pending", "ok", "shrunk", "blocked"]),
  checkedAt: z.string().nullable(),
  issues: z.array(RenderIssueSchema),
  /** Not blocking: e.g. a page that fell back to the plate because the format crops its picture too much. */
  notes: z.array(z.object({ page: z.string(), kind: z.enum(RENDER_NOTE_KINDS), detail: z.string() })).default([]),
});
export type LayoutQa = z.infer<typeof LayoutQaSchema>;

/**
 * A book's layout: format, a snapshot of its theme, the blocks in order and each page's layout.
 * The theme is copied in, so a book keeps its look when the theme in code changes; it is frozen
 * into the order when the book is printed.
 */
export const BookLayoutSchema = z.object({
  v: z.literal(1),
  format: BookFormatSchema,
  theme: BookThemeSchema,
  /** The child's age band, which picks the theme's type sizes. */
  ageGroup: z.enum(AGE_GROUPS).default("middle"),
  blocks: z.array(LayoutBlockSchema),
  /** Optional blocks the template lets the parent add (a drawing block may be added more than once). */
  addable: z.array(BlockKindSchema).default(["dedication", "talk", "drawing"]),
  /** The parent's own dedication; null: the default «Специально для тебя, …!». Plain text, escaped. */
  dedication: z.string().nullable().default(null),
  /** The parent's photo of the child for the photo page; null until one is uploaded. */
  photo: BookPhotoSchema.nullable().default(null),
  /** The title has a letter the heading font lacks: the cover and headings use the body font. */
  headingFallback: z.boolean().default(false),
  /** By story page number. */
  pages: z.record(z.string(), PageLayoutSchema).default({}),
  /** How much render QA shrank each page's text, by page key; 1 when left out. */
  fits: z.record(z.string(), z.number()).default({}),
  qa: LayoutQaSchema,
});
export type BookLayout = z.infer<typeof BookLayoutSchema>;
