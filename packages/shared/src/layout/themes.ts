import { LANGUAGES, type Language } from "../language";
import { ageBand } from "../methodologies";
import type { AgeGroup, BookFormat, BookLayout, BookTheme, LayoutBlock, PageLayout, TypeScale } from "./model";

/**
 * Font families books may use, from @fontsource packages (the API embeds the files in the PDF, the
 * site loads the same files). Body families are vetted wide-coverage ones: Cyrillic with Kazakh
 * (ә ғ қ ң ө ұ ү һ і) and Latin with ñ ü ß. Decorative ones go on the cover and headings only.
 */
export const BOOK_FONTS: Record<string, { package: string; weights: number[]; generic: string; body: boolean }> = {
  Literata: { package: "@fontsource/literata", weights: [400, 700], generic: "serif", body: true },
  "PT Serif": { package: "@fontsource/pt-serif", weights: [400, 700], generic: "serif", body: true },
  Andika: { package: "@fontsource/andika", weights: [400, 700], generic: "sans-serif", body: true },
  Nunito: { package: "@fontsource/nunito", weights: [400, 800], generic: "sans-serif", body: true },
  Lobster: { package: "@fontsource/lobster", weights: [400], generic: "cursive", body: false },
  Rubik: { package: "@fontsource/rubik", weights: [700], generic: "sans-serif", body: false },
  Comfortaa: { package: "@fontsource/comfortaa", weights: [700], generic: "sans-serif", body: false },
};

export const BOOK_FORMATS: Record<string, BookFormat> = {
  /** The square picture book printed today. */
  "square-210": { id: "square-210", widthMm: 210, heightMm: 210, bleedMm: 3, safeMm: 12 },
};
export const DEFAULT_FORMAT = "square-210";

/** Cover, dedication, the story, «поговорим», a drawing page, the end. */
export const DEFAULT_BLOCKS: LayoutBlock[] = [
  { kind: "cover", movable: false, optional: false },
  { kind: "dedication", movable: true, optional: true },
  { kind: "story", movable: false, optional: false },
  { kind: "talk", movable: true, optional: true },
  { kind: "drawing", movable: true, optional: true },
  { kind: "end", movable: false, optional: false },
];

const scale = (bodyPt: number, maxWords: number, titlePt: number, lineHeight = 1.42): TypeScale => ({
  bodyPt,
  lineHeight,
  titlePt,
  headingPt: Math.round(titlePt * 0.7),
  maxWords,
});

/**
 * «Сказка»: Literata, a serif drawn for long reading on screen and paper, with the full Cyrillic
 * and Latin sets; Lobster, a warm script, for the title. Pictures fill the page and the text sits
 * on their calm bottom third.
 */
const FAIRY: BookTheme = {
  id: "fairy",
  version: 1,
  legacy: false,
  languages: [...LANGUAGES],
  fonts: { heading: { family: "Lobster", weight: 400 }, body: { family: "Literata", weight: 400 } },
  sizes: { young: scale(20, 25, 36), middle: scale(16, 50, 34), older: scale(13.5, 75, 32) },
  minFit: 0.8,
  minContrast: 4.5,
  palette: { paper: "#fbf5ea", ink: "#2e2018", accent: "#9b3d52", muted: "#8a7564", cover: "#f3e3cf", plate: "#fbf5ea" },
  variants: ["overlay-bottom", "overlay-top", "facing", "spread"],
  textSpace: "bottom",
  cover: "scene",
  ornament: "leaf",
};

/**
 * «Приключение»: PT Serif, ParaType's serif made for the languages of Russia and its neighbours
 * (Kazakh included), sturdy at small sizes for older readers; Rubik Bold for punchy titles. Wide
 * spreads first, text over the sky.
 */
const ADVENTURE: BookTheme = {
  id: "adventure",
  version: 1,
  legacy: false,
  languages: [...LANGUAGES],
  fonts: { heading: { family: "Rubik", weight: 700 }, body: { family: "PT Serif", weight: 400 } },
  sizes: { young: scale(19, 25, 32), middle: scale(15.5, 55, 30), older: scale(13, 85, 28) },
  minFit: 0.8,
  minContrast: 4.5,
  palette: { paper: "#f5f2ea", ink: "#1d2a33", accent: "#d0632b", muted: "#6b7780", cover: "#e3ecef", plate: "#f5f2ea" },
  variants: ["spread", "overlay-top", "overlay-bottom", "split"],
  textSpace: "top",
  cover: "scene",
  ornament: "star",
};

/**
 * «Малышам»: Andika, SIL's typeface for children learning to read (single-storey a, clear shapes)
 * with full Cyrillic and Latin; Comfortaa Bold, round and friendly, for titles. Big type on paper,
 * beside the picture rather than over it.
 */
const LITTLE: BookTheme = {
  id: "little",
  version: 1,
  legacy: false,
  languages: [...LANGUAGES],
  fonts: { heading: { family: "Comfortaa", weight: 700 }, body: { family: "Andika", weight: 400 } },
  sizes: { young: scale(22, 25, 34, 1.38), middle: scale(18.5, 45, 32), older: scale(16, 65, 30) },
  minFit: 0.8,
  minContrast: 4.5,
  palette: { paper: "#fffaf0", ink: "#2b2a4c", accent: "#ef8a5b", muted: "#8b86a8", cover: "#ffe9cc", plate: "#fffaf0" },
  variants: ["split", "facing", "overlay-bottom"],
  textSpace: "bottom",
  cover: "framed",
  ornament: "flower",
};

/** How books looked before themes: Nunito, the picture on top, the text below. */
const CLASSIC: BookTheme = {
  id: "classic",
  version: 1,
  legacy: true,
  languages: [...LANGUAGES],
  fonts: { heading: { family: "Nunito", weight: 800 }, body: { family: "Nunito", weight: 400 } },
  sizes: { young: scale(16, 60, 26, 1.45), middle: scale(16, 60, 26, 1.45), older: scale(16, 100, 26, 1.45) },
  minFit: 0.8,
  minContrast: 4.5,
  palette: { paper: "#fffaf3", ink: "#2b2118", accent: "#e8833a", muted: "#7a6a5c", cover: "#fdf1e2", plate: "#fffaf3" },
  variants: ["split"],
  textSpace: null,
  cover: "framed",
  ornament: "sparkle",
};

export const BOOK_THEMES: Record<string, BookTheme> = { fairy: FAIRY, adventure: ADVENTURE, little: LITTLE, classic: CLASSIC };

/** Themes staff and parents can pick (the legacy one is not offered). */
export const SELECTABLE_THEMES = ["fairy", "adventure", "little"] as const;
export type SelectableTheme = (typeof SELECTABLE_THEMES)[number];

/** Themes whose fonts cover every one of these languages: what a template with them may use. */
export function themesFor(languages: readonly Language[]): BookTheme[] {
  return SELECTABLE_THEMES.map((id) => BOOK_THEMES[id]).filter((theme) => languages.every((l) => theme.languages.includes(l)));
}

/** The theme a book gets when its template names none: by the child's age. */
export function defaultThemeId(age: number): SelectableTheme {
  if (age <= 4) return "little";
  if (age <= 7) return "fairy";
  return "adventure";
}

export function ageGroup(age: number): AgeGroup {
  const band = ageBand(age);
  return band.ageMax <= 4 ? "young" : band.ageMax <= 7 ? "middle" : "older";
}

export function typeScale(theme: BookTheme, age: number): TypeScale {
  return theme.sizes[ageGroup(age)];
}

/** Words a story page may have: the age norm, or less when the theme's type leaves less room. */
export function wordsPerPage(theme: BookTheme, age: number): number {
  return Math.min(ageBand(age).maxWordsPerPage, typeScale(theme, age).maxWords);
}

/** A fresh layout for a child of `age`: nothing chosen yet, QA pending. */
export function newLayout(themeId: string, age = 6, formatId = DEFAULT_FORMAT): BookLayout {
  const theme = BOOK_THEMES[themeId] ?? BOOK_THEMES[defaultThemeId(age)];
  return {
    v: 1,
    format: BOOK_FORMATS[formatId] ?? BOOK_FORMATS[DEFAULT_FORMAT],
    theme: clone(theme),
    ageGroup: ageGroup(age),
    blocks: clone(DEFAULT_BLOCKS),
    headingFallback: false,
    pages: {},
    fits: {},
    qa: { status: "pending", checkedAt: null, issues: [] },
  };
}

/** A story page nothing has been decided for yet. */
export function blankPage(): PageLayout {
  return { options: [], pin: null, choice: null, tooFull: [], focus: { x: 0.5, y: 0.5 }, ink: {}, plateBand: "bottom", spreadSide: "right" };
}

/** The layout of a book made before themes: the classic look, as it rendered then. */
export function legacyLayout(): BookLayout {
  return newLayout("classic");
}

/** Another theme for the same book: the page picks that do not depend on the theme stay. */
export function withTheme(layout: BookLayout, themeId: string): BookLayout {
  const next: BookLayout = { ...newLayout(themeId, 6, layout.format.id), ageGroup: layout.ageGroup };
  for (const [page, state] of Object.entries(layout.pages)) {
    next.pages[page] = { ...state, choice: null, tooFull: [] };
  }
  return { ...next, blocks: layout.blocks };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
