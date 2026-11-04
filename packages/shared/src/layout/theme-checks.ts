import { z } from "zod";
import { LANGUAGES, LanguageSchema, type Language } from "../language";
import { contrast, luminance } from "./choose";
import { AGE_GROUPS, AGE_LIMITS, type BookTheme, ORNAMENTS, PageVariantSchema, ThemePaletteSchema, TypeScaleSchema } from "./model";
import { BOOK_FONTS } from "./themes";

/**
 * AI-proposed themes. Muse Spark answers a short brief from the owner with this JSON; the API turns
 * it into a BookTheme and checks it in code before anyone sees it: fonts only from the vetted list,
 * contrast of text against every background it sits on, type sizes within each age band's limits,
 * every letter of all five languages in both fonts, and a sample book in every language through
 * render QA. Only then may staff publish it.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A #rrggbb color");

export const ProposedThemeSchema = z.object({
  name: z.object(Object.fromEntries(LANGUAGES.map((l) => [l, z.string().trim().min(1).max(40)])) as Record<Language, z.ZodString>),
  fonts: z.object({
    heading: z.object({ family: z.string(), weight: z.number().int() }),
    body: z.object({ family: z.string(), weight: z.number().int() }),
  }),
  palette: z.object({ paper: hex, ink: hex, accent: hex, muted: hex, cover: hex, plate: hex }),
  sizes: z.object({ young: TypeScaleSchema, middle: TypeScaleSchema, older: TypeScaleSchema }),
  variants: z.array(PageVariantSchema).min(1).max(5),
  textSpace: z.enum(["top", "bottom"]).nullable(),
  cover: z.enum(["framed", "scene"]),
  /** The SVG ornament used when the drawn one is missing. */
  ornament: z.enum(ORNAMENTS),
  /** What the image model is asked to draw as the theme's ornament (English). */
  ornamentPrompt: z.string().trim().min(3).max(300),
});
export type ProposedTheme = z.infer<typeof ProposedThemeSchema>;

/** Body of POST /admin/themes: the owner's brief - mood, age, palette words. */
export const ThemeBriefSchema = z.object({ brief: z.string().trim().min(3).max(300) });
export type ThemeBrief = z.infer<typeof ThemeBriefSchema>;

/**
 * WCAG AAA for body text on paper and on a plate (7:1): picture books are read aloud in all kinds of
 * light, often by young eyes. Large titles may go down to 3.
 */
export const MIN_TEXT_CONTRAST = 7;
/** Text over a picture, against what is under it (the chooser's check): WCAG AA, 4.5:1. */
export const MIN_OVERLAY_CONTRAST = 4.5;
export const MIN_LARGE_CONTRAST = 3;
/** Ornaments (the accent color) are decoration, not text: they need only to stand out from the paper. */
export const MIN_DECOR_CONTRAST = 2;

/** One check a proposed theme went through, for the admin (and the refusal). */
export const ThemeCheckSchema = z.object({
  check: z.enum(["schema", "fonts", "contrast", "sizes", "glyphs", "render"]),
  ok: z.boolean(),
  /** What failed, in English, specific enough to fix: "ink #c9c2b8 on paper #fbf5ea: 1.6, needs 4.5". */
  detail: z.string(),
  language: LanguageSchema.optional(),
});
export type ThemeCheck = z.infer<typeof ThemeCheckSchema>;

/** The proposal as a theme: an AI theme, not yet covering any language (the glyph check fills that in). */
export function themeFromProposal(id: string, proposal: ProposedTheme): BookTheme {
  return {
    id,
    version: 1,
    source: "ai",
    name: proposal.name,
    legacy: false,
    languages: [],
    fonts: proposal.fonts,
    sizes: proposal.sizes,
    minFit: 0.8,
    minContrast: MIN_OVERLAY_CONTRAST,
    palette: ThemePaletteSchema.parse(proposal.palette),
    variants: [...new Set(proposal.variants.filter((v) => v !== "plate"))].length ? [...new Set(proposal.variants.filter((v) => v !== "plate"))] : ["split"],
    overlayStyle: "plate",
    textSpace: proposal.textSpace,
    cover: proposal.cover,
    ornament: proposal.ornament,
    ornamentImage: null,
    lettering: null,
  };
}

/** Fonts: all from the vetted list (comic lettering too), at a weight that ships; the body font a wide-coverage body family. */
export function checkFonts(theme: BookTheme): ThemeCheck {
  const problems: string[] = [];
  const fonts = theme.lettering ? { ...theme.fonts, lettering: theme.lettering.font } : theme.fonts;
  for (const [role, font] of Object.entries(fonts)) {
    const known = BOOK_FONTS[font.family];
    if (!known) problems.push(`${role} font ${font.family} is not on the vetted list (${Object.keys(BOOK_FONTS).join(", ")})`);
    else if (!known.weights.includes(font.weight)) problems.push(`${role} font ${font.family} has no weight ${font.weight} (${known.weights.join(", ")})`);
  }
  const body = BOOK_FONTS[theme.fonts.body.family];
  if (body && !body.body) problems.push(`${theme.fonts.body.family} is a display font: body text needs one of the wide-coverage families`);
  return { check: "fonts", ok: !problems.length, detail: problems.join("; ") || "vetted fonts" };
}

/** Contrast of text against every background it is printed on (WCAG ratios). */
export function checkContrast(theme: BookTheme): ThemeCheck {
  const p = theme.palette;
  const pairs: [string, string, string, string, number][] = [
    ["ink", p.ink, "paper", p.paper, MIN_TEXT_CONTRAST],
    ["ink", p.ink, "plate", p.plate, MIN_TEXT_CONTRAST],
    ["ink", p.ink, "cover", p.cover, MIN_LARGE_CONTRAST],
    ["muted", p.muted, "paper", p.paper, MIN_LARGE_CONTRAST],
    ["accent", p.accent, "paper", p.paper, MIN_DECOR_CONTRAST],
  ];
  const problems = pairs
    .map(([fg, a, bg, b, min]) => ({ fg, a, bg, b, min, ratio: contrast(luminance(a), luminance(b)) }))
    .filter((pair) => pair.ratio < pair.min)
    .map((pair) => `${pair.fg} ${pair.a} on ${pair.bg} ${pair.b}: ${pair.ratio.toFixed(2)}, needs ${pair.min}`);
  return { check: "contrast", ok: !problems.length, detail: problems.join("; ") || "all text pairs readable" };
}

/** Type sizes within each age band's limits; titles bigger than body text; line height sane. */
export function checkSizes(theme: BookTheme): ThemeCheck {
  const problems: string[] = [];
  for (const group of AGE_GROUPS) {
    const size = theme.sizes[group];
    const limit = AGE_LIMITS[group];
    if (size.bodyPt < limit.bodyPt[0] || size.bodyPt > limit.bodyPt[1]) problems.push(`${group}: body ${size.bodyPt}pt, allowed ${limit.bodyPt[0]}–${limit.bodyPt[1]}pt`);
    if (size.maxWords > limit.maxWords) problems.push(`${group}: ${size.maxWords} words a page, at most ${limit.maxWords}`);
    if (size.titlePt < size.bodyPt * 1.3 || size.titlePt > 48) problems.push(`${group}: title ${size.titlePt}pt, needs 1.3× body and at most 48pt`);
    if (size.headingPt < size.bodyPt || size.headingPt > size.titlePt) problems.push(`${group}: heading ${size.headingPt}pt, between body and title`);
    if (size.lineHeight < 1.2 || size.lineHeight > 1.8) problems.push(`${group}: line height ${size.lineHeight}, allowed 1.2–1.8`);
  }
  const young = theme.sizes.young.bodyPt;
  const older = theme.sizes.older.bodyPt;
  if (young < older) problems.push(`young readers get smaller type (${young}pt) than older ones (${older}pt)`);
  return { check: "sizes", ok: !problems.length, detail: problems.join("; ") || "sizes within the age limits" };
}
