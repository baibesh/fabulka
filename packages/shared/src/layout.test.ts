import { describe, expect, it } from "vitest";
import {
  AGE_LIMITS,
  BOOK_FORMATS,
  BOOK_THEMES,
  BookLayoutSchema,
  calmSpace,
  formatTypeScale,
  withFormat,
  SELECTABLE_THEMES,
  availableVariants,
  bookDocument,
  defaultThemeId,
  isLeft,
  legacyLayout,
  newLayout,
  pickVariant,
  planBook,
  interiorPages,
  renderBook,
  textRect,
  themesFor,
  withTheme,
  wordsPerPage,
  type BookLayout,
  type RenderableBook,
  BOOK_CSS,
  chooseLayout,
  countBreaks,
  judgePage,
  pageText,
  GRID,
  type PageSubject,
  type PageTone,
  type PageVariant,
  preferredVariants,
  blankPage,
} from "./index";

/** A hero in the middle of the picture, nothing in its bottom third. */
const MOCK_SUBJECT_LIKE: PageSubject = { box: { x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, grid: "" };
/** A light, calm picture. */
const calmTone: PageTone = { aspect: 1.5, lum: Array(GRID * GRID).fill(230), detail: Array(GRID * GRID).fill(2) };

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

  it("scales type with the format: smaller on A5, bigger on A4, the square as drawn, within the age limits", () => {
    const fairy = BOOK_THEMES.fairy;
    expect(formatTypeScale(fairy, "middle", BOOK_FORMATS["square-210"])).toEqual(fairy.sizes.middle);
    const a5 = formatTypeScale(fairy, "middle", BOOK_FORMATS["a5-portrait"]);
    const a4 = formatTypeScale(fairy, "middle", BOOK_FORMATS["a4-landscape"]);
    expect(a5.bodyPt).toBe(14.5);
    expect(a4.bodyPt).toBe(17.5);
    expect(a5.titlePt).toBeLessThan(fairy.sizes.middle.titlePt);
    expect(a4.headingPt).toBeGreaterThan(fairy.sizes.middle.headingPt);
    for (const theme of [BOOK_THEMES.fairy, BOOK_THEMES.adventure, BOOK_THEMES.little]) {
      for (const group of ["young", "middle", "older"] as const) {
        for (const format of Object.values(BOOK_FORMATS)) {
          const size = formatTypeScale(theme, group, format);
          expect(size.bodyPt).toBeGreaterThanOrEqual(AGE_LIMITS[group].bodyPt[0]);
          expect(size.bodyPt).toBeLessThanOrEqual(AGE_LIMITS[group].bodyPt[1]);
          expect(size.headingPt).toBeGreaterThanOrEqual(size.bodyPt);
          expect(size.titlePt).toBeGreaterThanOrEqual(size.headingPt);
        }
      }
    }
  });

  it("budgets words per page by the format: fewer on A5, and on A4 the capped line at bigger type", () => {
    const fairy = BOOK_THEMES.fairy;
    expect(wordsPerPage(fairy, 6, BOOK_FORMATS["square-210"])).toBe(50);
    expect(wordsPerPage(fairy, 6, BOOK_FORMATS["a5-portrait"])).toBeLessThan(50);
    expect(wordsPerPage(fairy, 6, BOOK_FORMATS["a4-landscape"])).toBeLessThan(50);
    expect(wordsPerPage(fairy, 6, BOOK_FORMATS["a5-portrait"])).toBeGreaterThan(30);
  });

  it("renders the format's type size on every page", () => {
    const a5 = renderBook(book(), withFormat(newLayout("fairy", 6), BOOK_FORMATS["a5-portrait"]));
    const a4 = renderBook(book(), withFormat(newLayout("fairy", 6), BOOK_FORMATS["a4-landscape"]));
    expect(a5.pages[2].html).toContain("--body-size:14.5pt");
    expect(a4.pages[2].html).toContain("--body-size:17.5pt");
  });

  it("asks pictures for calm space only when the first-choice layout prints text over them", () => {
    expect(calmSpace(BOOK_THEMES.fairy)).toBe("bottom");
    expect(calmSpace(BOOK_THEMES.adventure)).toBe("top");
    expect(calmSpace(BOOK_THEMES.little)).toBeNull();
    expect(calmSpace(BOOK_THEMES.classic)).toBeNull();
    expect(calmSpace({ ...BOOK_THEMES.little, variants: ["facing", "overlay-bottom"] })).toBeNull();
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
  it("fills the pages between the covers to a multiple of 4 and leaves the back cover alone on a left page", () => {
    for (const id of Object.keys(BOOK_THEMES)) {
      for (const pages of [1, 4, 7, 10]) {
        const plan = planBook(book(pages), newLayout(id));
        expect(interiorPages(plan).length % 4).toBe(0);
        expect(plan[0].key).toBe("cover");
        expect(plan.at(-2)!.key).toBe("end");
        expect(plan.at(-1)!.key).toBe("back");
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

describe("a page without its picture", () => {
  const layout = newLayout("fairy");
  const analysis = (page: number, art: boolean) => ({ page, words: 6, subject: null, tone: null, art });

  it("is judged a vignette page: the plate, flagged, whatever was pinned or picked", () => {
    const chosen = chooseLayout(layout, [analysis(1, true), analysis(2, false)]);
    expect(chosen.pages["2"]).toMatchObject({ noArt: true, options: ["plate"] });
    expect(chosen.pages["1"].noArt).toBe(false);
    const pinned = { ...chosen.pages["2"], pin: "facing" as const, choice: "split" as const };
    expect(pickVariant(layout.theme, pinned, 3)).toBe("plate");
    expect(availableVariants(layout.theme, pinned, 3)).toEqual(["plate"]);
  });

  it("shows the hero's character sheet as a vignette with the text below it", () => {
    const pages = book().pages.map((p) => (p.page === 2 ? { ...p, image: null } : p));
    const chosen = chooseLayout(layout, [analysis(2, false)]);
    const html = renderBook({ ...book(), pages }, chosen).pages.find((p) => p.key === "story-2")!.html;
    expect(html).toContain("fb-no-art");
    expect(html).toContain('class="fb-vignette" src="hero.png"');
    expect(html).toContain("fb-on-paper");
    expect(html).not.toContain("fb-empty");
    // Without a character sheet the theme's ornament stands in.
    const bare = renderBook({ ...book(), heroImage: null, pages }, chosen).pages.find((p) => p.key === "story-2")!.html;
    expect(bare).toContain("fb-vignette-ornament");
  });

  it("is an old layout's page with no flag: unchanged", () => {
    expect(BookLayoutSchema.parse(JSON.parse(JSON.stringify({ ...layout, pages: { "1": { options: ["split"] } } }))).pages["1"].noArt).toBe(false);
  });
});

describe("line breaks in page text", () => {
  const layout = newLayout("fairy");
  const withText = (text: string) => ({ ...book(1), pages: [{ page: 1, text, image: "page-1.png" }] });
  const story = (text: string, hyphenate?: (t: string) => string) =>
    renderBook(withText(text), layout, { hyphenate }).pages.find((p) => p.key === "story-1")!.html;

  it("keeps intended breaks for the CSS to show (pre-line), tidying the rest", () => {
    expect(BOOK_CSS).toMatch(/\.fb-text p \{[^}]*white-space: pre-line/);
    expect(story("Сказал кот.\n«Мяу!»\n«Мур!»")).toContain("Сказал кот.\n«Мяу!»\n«Мур!»");
    expect(pageText("  Раз. \r\n\n\n\n  Два.\t\n")).toBe("Раз.\n\nДва.");
    expect(story("Раз.\r\nДва.", (t) => t)).toContain("Раз.\nДва.");
  });

  it("renders a text without breaks exactly as before", () => {
    const text = "Бет 1. Айгерим Алматыда.";
    expect(pageText(text)).toBe(text);
    expect(story(text)).toContain(`<p data-qa-text>${text}</p>`);
  });

  it("counts breaks so a text of many short lines is not taken for one that fits", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Жол ${i + 1}.`);
    expect(countBreaks(lines.join("\n"))).toBe(9);
    expect(countBreaks("Бір. Екі.")).toBe(0);
    const square = { ...newLayout("fairy"), theme: { ...newLayout("fairy").theme, variants: ["split" as const] } };
    const judge = (breaks: number) =>
      judgePage(square, { page: 1, words: 20, breaks, subject: MOCK_SUBJECT_LIKE, tone: calmTone }).verdicts.split;
    expect(judge(0)?.reason).not.toBe("words");
    expect(judge(30)?.reason).toBe("words");
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

  it("numbers the talk questions itself, in the body font, inside the text box", () => {
    const talk = renderBook(book(), newLayout("little")).pages.find((p) => p.key === "talk")!.html;
    expect(talk).toContain('<span class="fb-num" aria-hidden="true">1.</span><span data-qa-text>Кітапта не болды?</span>');
    expect(talk).toContain('<span class="fb-num" aria-hidden="true">2.</span>');
  });

  it("puts the hero's character sheet on a scene cover, never a story page's picture", () => {
    const cover = rendered.pages[0].html;
    expect(cover).toContain('class="fb-cover-hero" src="hero.png"');
    expect(cover).toContain('class="fb-cover-sky"');
    expect(cover).not.toContain("page-1.png");
    // Bleed: the sky runs into it, the hero stays where it was.
    const bled = renderBook(book(), layout, { bleed: true }).pages[0].html;
    expect(bled).toMatch(/class="fb-cover-sky" style="left:-3mm;top:-3mm;width:216mm;height:216mm/);
    // The framed cover keeps the hero in its frame.
    expect(renderBook(book(), newLayout("little")).pages[0].html).toContain('class="fb-hero" src="hero.png"');
  });

  it("makes a print document with the page size and the book language", () => {
    const doc = bookDocument(rendered, { title: "x", language: "kk", fontCss: "@font-face{}" });
    expect(doc).toContain('<html lang="kk">');
    expect(doc).toContain("@page { size: 210mm 210mm; margin: 0; }");
  });
});

describe("text over a picture", () => {
  /** Fairy with `style`, story page 1 (a right page) pinned to `first`, page 2 (a left page) to `second`. */
  const pinned = (style: BookLayout["theme"]["overlayStyle"], first: PageVariant, second: PageVariant = "split"): BookLayout => {
    const layout = newLayout({ ...BOOK_THEMES.fairy, overlayStyle: style }, 6);
    layout.pages["1"] = { ...blankPage(), pin: first, ink: { "overlay-bottom": "light" } };
    layout.pages["2"] = { ...blankPage(), pin: second, spreadSide: "left" };
    return layout;
  };
  const html = (layout: BookLayout, key: string) => renderBook(book(), layout).pages.find((p) => p.key === key)!.html;
  /** The text box over the bottom third of a square page, as books were printed before the setting. */
  const TODAY = 'class="fb-box fb-text fb-ink-light fb-bottom" data-fit-box style="left:12mm;top:138.6mm;width:186mm;height:59.4mm"';

  it("puts a plate behind text over the picture, in ink, by default", () => {
    expect(BOOK_THEMES.fairy.overlayStyle).toBe("plate");
    const story = html(pinned("plate", "overlay-bottom"), "story-1");
    expect(story).toContain('class="fb-box fb-text fb-ink-light fb-bottom fb-over-plate" data-fit-box');
    expect(BOOK_CSS).toMatch(/\.fb-over-plate \.fb-flow::before \{[^}]*background: color-mix\(in srgb, var\(--plate\) 88%/);
    expect(BOOK_CSS).toMatch(/\.fb-over-plate, \.fb-over-fade \{ color: var\(--ink\)/);
  });

  it("keeps the text box where and as big as it was, so render QA measures the same text", () => {
    const box = (layout: BookLayout) => html(layout, "story-1").match(/data-fit-box style="([^"]*?)"/)![1];
    const today = box(pinned("none", "overlay-bottom"));
    expect(box(pinned("plate", "overlay-bottom"))).toBe(today);
    expect(box(pinned("fade", "overlay-bottom")).startsWith(`${today};--over:`)).toBe(true);
  });

  it("draws no plate behind text beside the picture or on the plate layout", () => {
    const layout = pinned("plate", "overlay-bottom");
    expect(html(layout, "story-2")).toContain('class="fb-box fb-text fb-ink-dark fb-on-paper"');
    expect(html(layout, "story-2")).not.toContain("fb-over-");
    expect(html(pinned("plate", "plate"), "story-1")).not.toContain("fb-over-");
  });

  it("keeps today's output with none, and for books whose theme copy predates the setting", () => {
    const none = renderBook(book(), pinned("none", "overlay-bottom"));
    expect(none.pages.find((p) => p.key === "story-1")!.html).toContain(TODAY);
    expect(none.pages.map((p) => p.html).join("")).not.toContain("fb-over-");
    const stored = JSON.parse(JSON.stringify(pinned("plate", "overlay-bottom")));
    delete stored.theme.overlayStyle;
    const old = BookLayoutSchema.parse(stored);
    expect(old.theme.overlayStyle).toBe("none");
    expect(renderBook(book(), old).pages.map((p) => p.html)).toEqual(none.pages.map((p) => p.html));
  });

  it("fades the paper from the page edge into the picture, thinning out at a spread's fold", () => {
    const story = html(pinned("fade", "overlay-bottom"), "story-1");
    // Out to the trim and the bleed below and at the sides, 16 mm up into the picture.
    expect(story).toContain("fb-bottom fb-over-fade");
    expect(story).toContain(";--over:-16mm -15mm -15mm -15mm");
    const spread = html(pinned("fade", "split", "spread"), "story-2");
    // Text on the left page: the fold is on its right, where the fade reaches the edge and no further.
    expect(spread).toContain("fb-over-fade fb-gutter-right");
    expect(spread).toContain(";--over:-16mm -12mm -15mm -15mm");
  });

  it("with avoid, tries layouts with the text beside the picture first, and still plates the rest", () => {
    const avoid = { ...BOOK_THEMES.fairy, overlayStyle: "avoid" as const };
    expect(preferredVariants(avoid)).toEqual(["facing", "split", "overlay-bottom", "overlay-top", "spread"]);
    expect(preferredVariants(BOOK_THEMES.fairy)).toEqual(BOOK_THEMES.fairy.variants);
    expect(calmSpace(avoid)).toBeNull();
    const layout = newLayout(avoid, 6);
    const judged = judgePage(layout, { page: 1, words: 12, subject: MOCK_SUBJECT_LIKE, tone: calmTone });
    expect(judged.options.slice(0, 2)).toEqual(["facing", "split"]);
    expect(html(pinned("avoid", "overlay-bottom"), "story-1")).toContain("fb-bottom fb-over-plate");
  });
});
