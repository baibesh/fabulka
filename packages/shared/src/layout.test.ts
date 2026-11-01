import { describe, expect, it } from "vitest";
import {
  BOOK_THEMES,
  BookLayoutSchema,
  SELECTABLE_THEMES,
  availableVariants,
  bookDocument,
  defaultThemeId,
  isLeft,
  legacyLayout,
  newLayout,
  pickVariant,
  planBook,
  renderBook,
  textRect,
  themesFor,
  withTheme,
  wordsPerPage,
  type BookLayout,
  type RenderableBook,
} from "./index";

const book = (pages = 4): RenderableBook => ({
  title: "Айгерим и <звёздная> лошадка",
  childName: "Айгерим",
  language: "kk",
  heroImage: "hero.png",
  pages: Array.from({ length: pages }, (_, i) => ({ page: i + 1, text: `Бет ${i + 1}. Айгерим Алматыда.`, image: `page-${i + 1}.png` })),
  talkQuestions: ["Кітапта не болды?", "Сен не істер едің?"],
});

describe("themes", () => {
  it("picks a theme by age", () => {
    expect(defaultThemeId(3)).toBe("little");
    expect(defaultThemeId(6)).toBe("fairy");
    expect(defaultThemeId(9)).toBe("adventure");
  });

  it("caps words per page by the age norm and by the theme's room", () => {
    expect(wordsPerPage(BOOK_THEMES.fairy, 3)).toBe(25);
    expect(wordsPerPage(BOOK_THEMES.fairy, 6)).toBe(50);
    expect(wordsPerPage(BOOK_THEMES.adventure, 9)).toBe(85);
  });

  it("offers only themes that cover all of a template's languages", () => {
    expect(themesFor(["ru", "kk"]).map((t) => t.id)).toEqual([...SELECTABLE_THEMES]);
    const original = BOOK_THEMES.adventure.languages;
    BOOK_THEMES.adventure.languages = ["ru", "en"];
    try {
      expect(themesFor(["ru", "kk"]).map((t) => t.id)).toEqual(["fairy", "little"]);
    } finally {
      BOOK_THEMES.adventure.languages = original;
    }
  });

  it("makes layouts that pass their own schema, for every theme", () => {
    for (const id of Object.keys(BOOK_THEMES)) expect(() => BookLayoutSchema.parse(newLayout(id))).not.toThrow();
    expect(legacyLayout().theme.id).toBe("classic");
  });

  it("keeps staff pins but drops the parent's picks when the theme changes", () => {
    const layout = newLayout("fairy");
    layout.pages["1"] = { ...page(), pin: "split", choice: "facing" };
    const next = withTheme(layout, "little");
    expect(next.theme.id).toBe("little");
    expect(next.pages["1"].pin).toBe("split");
    expect(next.pages["1"].choice).toBeNull();
  });
});

function page(): BookLayout["pages"][string] {
  return { options: [], pin: null, choice: null, tooFull: [], focus: { x: 0.5, y: 0.5 }, ink: {}, plateBand: "bottom", spreadSide: "right" };
}

describe("planBook", () => {
  it("fills with drawing pages to a multiple of 4 and leaves the back cover alone on a left page", () => {
    for (const id of Object.keys(BOOK_THEMES)) {
      for (const pages of [1, 4, 7, 10]) {
        const plan = planBook(book(pages), newLayout(id));
        expect(plan.length % 4).toBe(0);
        expect(plan[0].key).toBe("cover");
        expect(plan.at(-1)!.key).toBe("end");
        expect(isLeft(plan.at(-1)!.index)).toBe(true);
      }
    }
  });

  it("starts two-page layouts on a left page only", () => {
    const plan = planBook(book(6), newLayout("adventure"));
    for (const p of plan.filter((p) => p.part === 0 && (p.variant === "spread" || p.variant === "facing"))) {
      expect(isLeft(p.index)).toBe(true);
    }
    // The first story page lands on a right page: no spread there.
    const first = plan.find((p) => p.key === "story-1")!;
    expect(first.side).toBe("right");
    expect(first.variant).toBe("overlay-top");
    expect(plan.find((p) => p.key === "story-2")!.variant).toBe("spread");
    expect(plan.some((p) => p.key === "story-2-b")).toBe(true);
  });

  it("uses a staff pin, then the parent's pick, then the options in order", () => {
    const theme = BOOK_THEMES.fairy;
    const state = { ...page(), options: ["overlay-bottom", "facing", "plate"] as const };
    expect(pickVariant(theme, { ...state, options: [...state.options] }, 2)).toBe("overlay-bottom");
    expect(pickVariant(theme, { ...state, options: [...state.options], choice: "plate" }, 2)).toBe("plate");
    expect(pickVariant(theme, { ...state, options: [...state.options], choice: "plate", pin: "split" }, 2)).toBe("split");
    // A two-page pick cannot start on a right page.
    expect(pickVariant(theme, { ...state, options: [...state.options], choice: "facing" }, 2)).toBe("overlay-bottom");
    expect(pickVariant(theme, { ...state, options: [...state.options], tooFull: ["overlay-bottom"] }, 2)).toBe("plate");
  });

  it("offers at most three layouts, always with the plate to fall back to", () => {
    const theme = BOOK_THEMES.fairy;
    expect(availableVariants(theme, undefined, 1)).toEqual(["overlay-bottom", "overlay-top", "facing"]);
    expect(availableVariants(theme, { ...page(), options: ["overlay-top"] }, 2)).toEqual(["overlay-top", "plate"]);
  });

  it("keeps text inside the safe zone", () => {
    const { format } = newLayout("fairy");
    for (const variant of ["overlay-top", "overlay-bottom", "split", "facing", "spread", "plate"] as const) {
      const r = textRect(variant, format);
      expect(r.x).toBeGreaterThanOrEqual(format.safeMm);
      expect(r.y).toBeGreaterThanOrEqual(format.safeMm);
      expect(r.x + r.w).toBeLessThanOrEqual(format.widthMm - format.safeMm + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(format.heightMm - format.safeMm + 0.01);
    }
  });
});

describe("renderBook", () => {
  const layout = newLayout("fairy");
  const rendered = renderBook(book(), layout, { hyphenate: (t) => t.replace("Алматыда", "Ал­ма­ты­да") });

  it("renders one section per planned page with the theme on it", () => {
    expect(rendered.pages).toHaveLength(planBook(book(), layout).length);
    for (const p of rendered.pages) expect(p.html).toContain("--body:'Literata', serif");
  });

  it("escapes text and keeps soft hyphens", () => {
    const cover = rendered.pages[0].html;
    expect(cover).toContain("Айгерим и &lt;звёздная&gt; лошадка");
    expect(rendered.pages.find((p) => p.key === "story-1")!.html).toContain("Ал­ма­ты­да");
  });

  it("prints the book's own words in its language", () => {
    const html = rendered.pages.map((p) => p.html).join("");
    expect(html).toContain("Әңгімелесейік");
    expect(html).toContain("Арнайы саған, Айгерим!");
    expect(html).toContain("Соңы");
  });

  it("marks words with their hints", () => {
    const marked = renderBook(book(), layout, {
      mark: (t) => (t.includes("Айгерим") ? [t.split("Айгерим")[0], { text: "Айгерим", hint: "<имя>" }, t.split("Айгерим")[1]] : [t]),
    });
    expect(marked.pages.find((p) => p.key === "story-1")!.html).toContain('data-hint="&lt;имя&gt;">Айгерим</mark>');
  });

  it("uses the body font for headings when the title needs it", () => {
    const fallback = renderBook(book(), { ...layout, headingFallback: true });
    expect(fallback.pages[0].html).toContain("--heading:'Literata', serif;--heading-weight:700");
  });

  it("applies render QA's shrink per page", () => {
    const shrunk = renderBook(book(), { ...layout, fits: { "story-2": 0.85 } });
    expect(shrunk.pages.find((p) => p.key === "story-2")!.html).toContain("--fit:0.85");
    expect(shrunk.pages.find((p) => p.key === "story-1")!.html).toContain("--fit:1");
  });

  it("makes a print document with the page size and the book language", () => {
    const doc = bookDocument(rendered, { title: "x", language: "kk", fontCss: "@font-face{}" });
    expect(doc).toContain('<html lang="kk">');
    expect(doc).toContain("@page { size: 210mm 210mm; margin: 0; }");
  });
});
