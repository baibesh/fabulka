import { type BookFormat, type BookLayout, type BookTheme, type PageLayout, type PageVariant, isTwoPage } from "./model";

/** A box on a page, in millimetres from the trim's top left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Share of the page height the text band over a picture takes. */
export const BAND = 0.34;
/** Share of the page height a plate may take. */
export const PLATE = 0.36;
/** Share of the page height the picture takes in "split". */
export const SPLIT_ART = 0.62;

/**
 * The widest a text box gets (mm). Across a whole A4 landscape page a line ran to ~150 letters, far
 * too long to read aloud from; this keeps lines to about the square book's ~80.
 */
export const MAX_MEASURE = 190;

/** Where a variant puts the picture: on its page, or across both pages for a spread (2 × width). */
export function artRect(variant: PageVariant, format: BookFormat): Rect {
  const { widthMm: w, heightMm: h } = format;
  if (variant === "split") return { x: 0, y: 0, w, h: h * SPLIT_ART };
  if (variant === "spread") return { x: 0, y: 0, w: 2 * w, h };
  return { x: 0, y: 0, w, h };
}

/**
 * Where a variant puts the text, on the page that carries it (for a spread, on that half). The
 * renderer places the text box here and the chooser checks the picture under the same box.
 */
export function textRect(
  variant: PageVariant,
  format: BookFormat,
  state?: Pick<PageLayout, "plateBand">,
): Rect {
  const { widthMm: w, heightMm: h, safeMm: s } = format;
  const measure = Math.min(w - 2 * s, MAX_MEASURE);
  const full = { x: (w - measure) / 2, w: measure };
  switch (variant) {
    case "overlay-top":
      return { ...full, y: s, h: h * BAND - s };
    case "overlay-bottom":
    case "spread":
      return { ...full, y: h * (1 - BAND), h: h * BAND - s };
    case "split":
      return { ...full, y: h * SPLIT_ART + 4, h: h * (1 - SPLIT_ART) - 4 - s };
    case "facing":
      return { x: (w - Math.min(measure, w - 2 * s - 16)) / 2, w: Math.min(measure, w - 2 * s - 16), y: s + 18, h: h - 2 * s - 36 };
    case "plate":
      return state?.plateBand === "top" ? { ...full, y: s, h: h * PLATE - s } : { ...full, y: h * (1 - PLATE), h: h * PLATE - s };
  }
}

export type PageKind = "cover" | "dedication" | "story" | "talk" | "drawing" | "end";

/** One printed page, in order: index 0 is the cover; odd indexes are left pages. */
export interface PlannedPage {
  key: string;
  kind: PageKind;
  index: number;
  side: "cover" | "left" | "right";
  /** Story page number. */
  story?: number;
  /** 0 for a story page's first page, 1 for the second page of a two-page variant. */
  part?: 0 | 1;
  variant?: PageVariant;
  /** A blank drawing page added only to make the page count a multiple of 4. */
  filler?: boolean;
}

export const isLeft = (index: number) => index % 2 === 1;

/** What the variant of a story page is when it starts at `index`; skips what cannot go there. */
export function pickVariant(theme: BookTheme, state: PageLayout | undefined, index: number): PageVariant {
  const fits = (variant: PageVariant) => !isTwoPage(variant) || isLeft(index);
  if (state?.pin && fits(state.pin)) return state.pin;
  return availableVariants(theme, state, index, Infinity)[0] ?? "plate";
}

/**
 * The variants the parent may pick for a page starting at `index`: the options that suit its
 * picture, fit there and whose text fits, best first, at most `limit`; the parent's pick first.
 */
export function availableVariants(theme: BookTheme, state: PageLayout | undefined, index: number, limit = 3): PageVariant[] {
  const full = new Set(state?.tooFull ?? []);
  const options: PageVariant[] = state?.options.length ? state.options : [...theme.variants, "plate"];
  const usable = options.filter((v) => (!isTwoPage(v) || isLeft(index)) && !full.has(v));
  if (!usable.includes("plate")) usable.push("plate");
  const choice = state?.choice;
  const ordered = choice && usable.includes(choice) ? [choice, ...usable.filter((v) => v !== choice)] : usable;
  return ordered.slice(0, limit);
}

/** What planning needs of a book. */
export interface PlannableBook {
  pages: { page: number }[];
  talkQuestions: string[];
}

/**
 * The book's printed pages in order: the blocks as the layout orders them (a drawing block is one
 * page), each story page in its variant, then — just before the end — blank drawing pages so the
 * count is a multiple of 4 (a printed book is folded sheets). Those are marked `filler`: the reader
 * shows them as padding. The padding comes after the story, so it never moves a story page.
 */
export function planBook(book: PlannableBook, layout: BookLayout): PlannedPage[] {
  const pages: PlannedPage[] = [];
  const push = (page: Omit<PlannedPage, "index" | "side">) => {
    const index = pages.length;
    pages.push({ ...page, index, side: index === 0 ? "cover" : isLeft(index) ? "left" : "right" });
  };
  let drawings = 0;
  let ended = false;
  const pad = () => {
    const extra = (4 - ((pages.length + (ended ? 0 : 1)) % 4)) % 4;
    for (let n = 1; n <= extra; n++) push({ key: `pad-${n}`, kind: "drawing", filler: true });
  };
  for (const block of layout.blocks) {
    switch (block.kind) {
      case "cover":
        push({ key: "cover", kind: "cover" });
        break;
      case "dedication":
        push({ key: "dedication", kind: "dedication" });
        break;
      case "story":
        for (const { page } of book.pages) {
          const variant = pickVariant(layout.theme, layout.pages[String(page)], pages.length);
          push({ key: `story-${page}`, kind: "story", story: page, part: 0, variant });
          if (isTwoPage(variant)) push({ key: `story-${page}-b`, kind: "story", story: page, part: 1, variant });
        }
        break;
      case "talk":
        if (book.talkQuestions.length) push({ key: "talk", kind: "talk" });
        break;
      case "drawing":
        push({ key: `drawing-${++drawings}`, kind: "drawing" });
        break;
      case "end":
        pad();
        ended = true;
        push({ key: "end", kind: "end" });
        break;
    }
  }
  if (!ended) {
    ended = true;
    pad();
  }
  return pages;
}
