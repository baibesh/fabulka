import { z } from "zod";
import { LANGUAGES, type Language } from "../language";
import { BookThemeSchema, FontRefSchema, ORNAMENTS, PageVariantSchema, TypeScaleSchema, type BookTheme } from "./model";
import { ThemeCheckSchema, checkContrast, checkFonts, checkSizes, type ProposedTheme, type ThemeCheck } from "./theme-checks";
import { BOOK_THEMES } from "./themes";

/**
 * Themes edited by hand in the admin («Темы»). Curated themes stay in code and read-only; staff
 * duplicate one to get an editable copy, and AI themes are editable as they are. Every save runs the
 * proposal's checks (fonts, contrast, sizes, glyphs, a sample book through render QA); a theme that
 * fails is kept as a draft and cannot be published. A published theme's edits wait as pending
 * changes until staff publish them: books keep the copy of the theme they were made with, so only
 * books made (or switched to the theme) after that get the change.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A #rrggbb color");

/** What staff may change in a theme; the rest (id, version, languages, fit limits) the API keeps. */
export const ThemeEditSchema = z.object({
  name: z.object(Object.fromEntries(LANGUAGES.map((l) => [l, z.string().trim().min(1).max(40)])) as Record<Language, z.ZodString>),
  fonts: z.object({ heading: FontRefSchema, body: FontRefSchema }),
  palette: z.object({ paper: hex, ink: hex, accent: hex, muted: hex, cover: hex, plate: hex }),
  sizes: z.object({ young: TypeScaleSchema, middle: TypeScaleSchema, older: TypeScaleSchema }),
  variants: z
    .array(PageVariantSchema)
    .min(1)
    .max(6)
    .refine((v) => new Set(v).size === v.length, "Each layout once"),
  textSpace: z.enum(["top", "bottom"]).nullable(),
  cover: z.enum(["framed", "scene"]),
  ornament: z.enum(ORNAMENTS),
  /** A storage path of the theme's own drawn or uploaded ornament; null: the SVG one. */
  ornamentImage: z.string().max(200).nullable(),
  /** Comic lettering (speech balloons and caption boxes); null: the heading font, not a comic theme. */
  lettering: z.object({ font: FontRefSchema, scale: z.number().min(0.4).max(1.2) }).nullable(),
});
export type ThemeEdit = z.infer<typeof ThemeEditSchema>;

/** The palette roles in the order the editor shows them. */
export const PALETTE_ROLES = ["paper", "ink", "accent", "muted", "cover", "plate"] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

/** A theme with comic lettering: offered through a story format that names it, not to picture books. */
export const isComicTheme = (theme: Pick<BookTheme, "lettering">) => theme.lettering !== null;

/** Curated themes staff may duplicate: the ones offered to parents and the comic format's. */
export const DUPLICABLE_THEMES = ["fairy", "adventure", "little", "comic"] as const;

/** The name of a copy, by language: "<name> (copy)". */
const COPY: Record<Language, (name: string) => string> = {
  ru: (n) => `${n} (копия)`,
  kk: (n) => `${n} (көшірме)`,
  en: (n) => `${n} (copy)`,
  es: (n) => `${n} (copia)`,
  de: (n) => `${n} (Kopie)`,
};

/** Curated themes' names (the site's messages carry them too: design.theme.<id>). */
const CURATED_NAMES: Record<string, Record<Language, string>> = {
  fairy: { ru: "Сказка", kk: "Ертегі", en: "Fairy tale", es: "Cuento", de: "Märchen" },
  adventure: { ru: "Приключение", kk: "Шытырман оқиға", en: "Adventure", es: "Aventura", de: "Abenteuer" },
  little: { ru: "Малышам", kk: "Кішкентайларға", en: "For little ones", es: "Para los más pequeños", de: "Für die Kleinen" },
  comic: { ru: "Комикс", kk: "Комикс", en: "Comic", es: "Cómic", de: "Comic" },
  classic: { ru: "Классика", kk: "Классика", en: "Classic", es: "Clásico", de: "Klassisch" },
};

/** A theme's name in every language: an AI theme's own (English where one is missing), a curated one's. */
export function themeNames(theme: BookTheme): Record<Language, string> {
  const own = theme.source === "ai" ? theme.name : CURATED_NAMES[theme.id];
  const fallback = own?.en ?? own?.ru ?? theme.id;
  return Object.fromEntries(LANGUAGES.map((l) => [l, own?.[l] || fallback])) as Record<Language, string>;
}

/** The names a copy of `theme` gets, cut to the 40 characters a name may have. */
export function copyNames(theme: BookTheme): Record<Language, string> {
  const names = themeNames(theme);
  return Object.fromEntries(LANGUAGES.map((l) => [l, COPY[l](names[l]).slice(0, 40)])) as Record<Language, string>;
}

/** What the editor starts from: the theme's editable fields. */
export function editOf(theme: BookTheme): ThemeEdit {
  return {
    name: themeNames(theme),
    fonts: structuredClone(theme.fonts),
    palette: { ...theme.palette },
    sizes: structuredClone(theme.sizes),
    variants: [...theme.variants],
    textSpace: theme.textSpace,
    cover: theme.cover,
    ornament: theme.ornament,
    ornamentImage: theme.ornamentImage,
    lettering: theme.lettering ? structuredClone(theme.lettering) : null,
  };
}

/**
 * `base` with the edit applied: an AI theme (copies too), its id, version, fit limits and languages
 * kept (the glyph check sets the languages again).
 */
export function applyEdit(base: BookTheme, edit: ThemeEdit): BookTheme {
  return {
    ...base,
    source: "ai",
    legacy: false,
    name: { ...edit.name },
    fonts: structuredClone(edit.fonts),
    palette: { ...edit.palette },
    sizes: structuredClone(edit.sizes),
    variants: [...edit.variants],
    textSpace: edit.textSpace,
    cover: edit.cover,
    ornament: edit.ornament,
    ornamentImage: edit.ornamentImage,
    lettering: edit.lettering ? structuredClone(edit.lettering) : null,
  };
}

/** The checks that need no font files or renderer: what the editor shows while staff type. */
export function quickChecks(theme: BookTheme): ThemeCheck[] {
  return [checkFonts(theme), checkContrast(theme), checkSizes(theme)];
}

/** Publishable: every check passed, the sample book through render QA included. */
export function checksPass(checks: readonly ThemeCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.ok) && checks.some((c) => c.check === "render");
}

/** One changed field of a theme: its path ("palette.paper", "sizes.young.bodyPt"), before and after. */
export const ThemeChangeSchema = z.object({ path: z.string(), before: z.unknown(), after: z.unknown() });
export type ThemeChange = z.infer<typeof ThemeChangeSchema>;

/** Every changed leaf of two edits (arrays compared whole: the layouts' order matters). */
export function themeChanges(before: ThemeEdit, after: ThemeEdit): ThemeChange[] {
  const out: ThemeChange[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    const plain = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
    if (plain(a) && plain(b)) {
      const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
      for (const key of keys) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, before: a ?? null, after: b ?? null });
  };
  walk(before, after, "");
  return out;
}

/** The edit as the proposal JSON Muse Spark answers with, for "refine with words". */
export function proposalOf(edit: ThemeEdit, ornamentPrompt: string): ProposedTheme {
  return {
    name: edit.name,
    fonts: edit.fonts,
    palette: edit.palette,
    sizes: edit.sizes,
    variants: edit.variants.slice(0, 5),
    textSpace: edit.textSpace,
    cover: edit.cover,
    ornament: edit.ornament,
    ornamentPrompt,
  };
}

/**
 * The edit Muse Spark's adjusted proposal makes: its names, fonts, colors, sizes, layouts and cover;
 * the ornament image and the comic lettering stay (a comic theme keeps its panel layout).
 */
export function editFromProposal(current: ThemeEdit, proposal: ProposedTheme): ThemeEdit {
  const variants = [...new Set(proposal.variants)];
  return {
    ...current,
    name: { ...proposal.name },
    fonts: structuredClone(proposal.fonts),
    palette: { ...proposal.palette },
    sizes: structuredClone(proposal.sizes),
    variants: current.lettering || !variants.length ? [...current.variants] : variants,
    textSpace: proposal.textSpace,
    cover: proposal.cover,
    ornament: proposal.ornament,
  };
}

/** Body of PUT /admin/themes/:id: the theme's new fields. */
export const ThemeSaveSchema = z.object({ theme: ThemeEditSchema });
export type ThemeSave = z.infer<typeof ThemeSaveSchema>;

/** Body of POST /admin/themes/check: the editor's fields, checked without saving. */
export const ThemeCheckRequestSchema = ThemeSaveSchema;

/** Body of POST /admin/themes/:id/refine: the owner's words and the theme as the editor holds it. */
export const ThemeRefineSchema = z.object({ comment: z.string().trim().min(3).max(300), theme: ThemeEditSchema });
export type ThemeRefine = z.infer<typeof ThemeRefineSchema>;

/** Muse Spark's adjusted theme, not saved: the fields, what changed and the quick checks with glyphs. */
export const ThemeRefinementSchema = z.object({
  theme: ThemeEditSchema,
  changes: z.array(ThemeChangeSchema),
  checks: z.array(ThemeCheckSchema),
});
export type ThemeRefinement = z.infer<typeof ThemeRefinementSchema>;

/** Body of POST /admin/themes/:id/ornament: a PNG, JPEG or WebP as a data URL (at most 2 MB). */
export const THEME_ORNAMENT_MAX_BYTES = 2 * 1024 * 1024;
export const ThemeOrnamentUploadSchema = z.object({
  image: z
    .string()
    .regex(/^data:[\w.+/-]*;base64,[A-Za-z0-9+/=]+$/, "A base64 data URL")
    .max(Math.ceil((THEME_ORNAMENT_MAX_BYTES * 4) / 3) + 100),
});
export const ThemeOrnamentResultSchema = z.object({ path: z.string(), url: z.string() });
export type ThemeOrnamentResult = z.infer<typeof ThemeOrnamentResultSchema>;

/** What happened to a theme, for its history: made, copied, saved, published, changes dropped. */
export const THEME_HISTORY_ACTIONS = ["create", "duplicate", "save", "publish", "discard"] as const;

/** One entry of a theme's history: the theme as it was after the action, and how its checks went. */
export const ThemeHistoryEntrySchema = z.object({
  id: z.string(),
  action: z.enum(THEME_HISTORY_ACTIONS),
  version: z.number().int(),
  theme: BookThemeSchema,
  checks: z.array(ThemeCheckSchema),
  /** Passed every check (the sample book included). */
  ok: z.boolean(),
  who: z.string().nullable(),
  at: z.string(),
});
export type ThemeHistoryEntry = z.infer<typeof ThemeHistoryEntrySchema>;

/** A curated theme staff may duplicate, or null. */
export function duplicableTheme(id: string): BookTheme | null {
  return (DUPLICABLE_THEMES as readonly string[]).includes(id) ? BOOK_THEMES[id] : null;
}
