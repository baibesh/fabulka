import { describe, expect, it } from "vitest";
import {
  BOOK_FORMATS,
  COVER_MAX_OVERLAP,
  GRID,
  SPINE_TEXT_MIN_MM,
  type BookLayout,
  type PageSubject,
  type PageTone,
  coverArtRect,
  coverOverlap,
  coverTextRect,
  coverWrap,
  chooseCover,
  encodeGrid,
  interiorPages,
  newLayout,
  planBook,
  printDocument,
  renderBook,
  renderCoverWrap,
  spineWidthMm,
  splitTitle,
  wrapSheetSize,
} from "./index";

/** A SAM mask covering the part of the picture where `inside(x, y)` holds (x, y in 0..1). */
function subject(inside: (x: number, y: number) => boolean): PageSubject {
  const cells: boolean[] = [];
  let [x0, y0, x1, y1] = [1, 1, 0, 0];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const [x, y] = [(gx + 0.5) / GRID, (gy + 0.5) / GRID];
      const hit = inside(x, y);
      cells.push(hit);
      if (hit) [x0, y0, x1, y1] = [Math.min(x0, gx / GRID), Math.min(y0, gy / GRID), Math.max(x1, (gx + 1) / GRID), Math.max(y1, (gy + 1) / GRID)];
    }
  }
  return { box: x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null, grid: encodeGrid(cells) };
}

/** A square picture, light and calm everywhere unless `lum` says otherwise. */
function tone(lum: (x: number, y: number) => number = () => 225): PageTone {
  const values: number[] = [];
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) values.push(lum((gx + 0.5) / GRID, (gy + 0.5) / GRID));
  return { aspect: 1, lum: values, detail: values.map(() => 4) };
}

const layout = (format = "square-210"): BookLayout => newLayout("fairy", 6, format);

describe("chooseCover", () => {
  it("letters the calm top when the hero stands low in the picture", () => {
    const hero = subject((x, y) => x > 0.35 && x < 0.65 && y > 0.5);
    const cover = chooseCover(layout(), hero, tone());
    expect(cover).toMatchObject({ mode: "overlay", band: "top", ink: "dark" });
    expect(coverOverlap(layout(), cover, hero, coverTextRect(layout().format, "top"))).toBeLessThanOrEqual(COVER_MAX_OVERLAP);
  });

  it("goes to the bottom when the hero's head is up in the top band", () => {
    const hero = subject((x, y) => x > 0.35 && x < 0.65 && y < 0.55);
    expect(chooseCover(layout(), hero, tone())).toMatchObject({ mode: "overlay", band: "bottom" });
  });

  it("puts the lettering on its own band, never over a face, when the hero fills the picture", () => {
    const hero = subject((x, y) => x > 0.2 && x < 0.8 && y > 0.1 && y < 0.95);
    const cover = chooseCover(layout(), hero, tone());
    expect(cover.mode).toBe("banner");
    // The picture moves out from under the band: the lettering covers nobody.
    const rect = coverTextRect(layout().format, cover.band);
    expect(coverOverlap(layout(), cover, hero, rect)).toBe(0);
    const art = coverArtRect(layout().format, cover);
    expect(cover.band === "top" ? art.y : art.y + art.h).toBeCloseTo(cover.band === "top" ? 84 : 126);
  });

  it("reads light lettering over a dark sky and refuses a busy one", () => {
    const hero = subject((x, y) => x > 0.4 && x < 0.6 && y > 0.6);
    expect(chooseCover(layout(), hero, tone((_, y) => (y < 0.5 ? 30 : 200)))).toMatchObject({ mode: "overlay", band: "top", ink: "light" });
    // A checkerboard top (a city, branches) is too busy to read on; the bottom is taken by the hero.
    const busy = tone((x, y) => (y < 0.5 ? (Math.floor(x * GRID) + Math.floor(y * GRID)) % 2 ? 20 : 240 : 200));
    expect(chooseCover(layout(), subject((x, y) => y > 0.55), busy).mode).toBe("banner");
  });

  it("chooses the banner when nothing is known of the picture", () => {
    expect(chooseCover(layout(), null, null)).toMatchObject({ mode: "banner", band: "top" });
  });
});

describe("spine and wrap", () => {
  it("is as wide as the paper, plus a softcover's card or a hardcover's boards", () => {
    // 24 pages = 12 leaves of 0.12 mm = 1.44 mm.
    expect(spineWidthMm(24, "soft")).toBe(2);
    expect(spineWidthMm(24, "hard")).toBe(7.5);
    expect(spineWidthMm(96, "soft")).toBe(6.5);
    // Thicker books, wider spines; always whole half millimetres.
    for (const pages of [8, 16, 40, 120]) {
      for (const binding of ["soft", "hard"] as const) {
        expect(spineWidthMm(pages + 8, binding)).toBeGreaterThan(spineWidthMm(pages, binding));
        expect((spineWidthMm(pages, binding) * 2) % 1).toBe(0);
      }
    }
  });

  it("lays out back, spine and front for both bindings", () => {
    const format = BOOK_FORMATS["a5-portrait"];
    const soft = coverWrap(format, 20, "soft");
    expect(soft.widthMm).toBeCloseTo(2 * 148 + soft.spineMm);
    expect(soft.heightMm).toBe(210);
    expect(soft.marginMm).toBe(3);
    expect(soft.spineText).toBe(soft.spineMm >= SPINE_TEXT_MIN_MM);
    const hard = coverWrap(format, 20, "hard");
    // Boards a square bigger than the page, two hinges, the turn-in round it all.
    expect(hard.front.w).toBe(151);
    expect(hard.heightMm).toBe(216);
    expect(hard.widthMm).toBeCloseTo(2 * 151 + 2 * 8 + hard.spineMm);
    expect(hard.marginMm).toBe(15);
    expect(hard.spineText).toBe(true);
    expect(hard.spine.x).toBe(151 + 8);
    expect(wrapSheetSize(hard).heightMm).toBe(216 + 2 * 15 + 20);
  });

  it("prints the wrap first and only the pages between the covers after it", () => {
    const book = {
      title: "Айша и быстрый велосипед",
      childName: "Айша",
      language: "ru" as const,
      heroImage: "hero.jpg",
      coverImage: "cover.jpg",
      blurb: "Айша мечтает доехать до старого дуба.",
      pages: [1, 2, 3].map((page) => ({ page, text: `Страница ${page}`, image: `page-${page}.jpg` })),
      talkQuestions: ["Что было дальше?"],
    };
    const base = { ...layout(), cover: { mode: "overlay" as const, band: "top" as const, ink: "dark" as const, focus: { x: 0.5, y: 0.7 }, aspect: 1 } };
    const plan = planBook(book, base);
    const spec = coverWrap(base.format, interiorPages(plan).length, "hard");
    const html = renderCoverWrap(book, base, spec);
    expect(html).toContain('data-testid="spine-text"');
    expect(html).toContain("fb-spine-up");
    expect(html).toContain("Айша");
    const doc = printDocument(renderBook(book, base, { bleed: true }), {
      title: book.title,
      language: "ru",
      fontCss: "",
      format: base.format,
      label: "test",
      wrap: { html, spec },
    });
    const keys = [...doc.matchAll(/class="fb-sheet[^"]*" data-key="([^"]+)"/g)].map((m) => m[1]);
    expect(keys[0]).toBe("wrap");
    expect(keys).not.toContain("cover");
    expect(keys).not.toContain("back");
    expect((keys.length - 1) % 4).toBe(0);
    expect(doc).toContain("@page fbwrap");
  });
});

describe("the designed cover", () => {
  const book = (title: string, name: string) => ({
    title,
    childName: name,
    language: "en" as const,
    heroImage: "hero.jpg",
    coverImage: "cover.jpg",
    blurb: "Aisha wants to ride all the way to the big oak.",
    pages: [{ page: 1, text: "One", image: "p1.jpg" }],
    talkQuestions: [],
  });

  it("letters the child's name big, the rest of the title around it, and a subtitle", () => {
    const base = { ...layout(), cover: { mode: "overlay" as const, band: "top" as const, ink: "dark" as const, focus: { x: 0.5, y: 0.7 }, aspect: 1 } };
    const pages = renderBook(book("Aisha and the Swift Ride", "Aisha"), base).pages;
    const cover = pages[0].html;
    expect(cover).toContain('data-testid="cover-name"');
    expect(cover).toMatch(/data-testid="cover-name"[^>]*>Aisha</);
    expect(cover).toContain(">and the Swift Ride<");
    expect(cover).toContain("A Fabulka story");
    expect(cover).toContain('src="cover.jpg"');
    // The back cover: its blurb and the Fabulka mark, last in the book.
    expect(pages.at(-1)!.key).toBe("back");
    expect(pages.at(-1)!.html).toContain("Aisha wants to ride");
    expect(pages.at(-1)!.html).toContain("Fabulka");
  });

  it("keeps the older cover for books without a cover illustration", () => {
    const cover = renderBook({ ...book("Aisha", "Aisha"), coverImage: null }, layout()).pages[0].html;
    expect(cover).not.toContain("cover-name");
    expect(cover).toContain("fb-cover-title");
  });
});

describe("splitTitle", () => {
  it("finds the name, declined or not, in the title", () => {
    expect(splitTitle("Aisha and the Swift Ride", "Aisha")).toEqual({ before: "", name: "Aisha", after: "and the Swift Ride" });
    expect(splitTitle("Приключения Тимура в горах", "Тимур")).toEqual({ before: "Приключения", name: "Тимура", after: "в горах" });
    expect(splitTitle("Айшаның ғажайып күні", "Айша")).toEqual({ before: "", name: "Айшаның", after: "ғажайып күні" });
    expect(splitTitle("Der Drache, Mia!", "Mia")).toEqual({ before: "Der Drache,", name: "Mia", after: "!" });
  });

  it("stands the name alone when the title does not have it", () => {
    expect(splitTitle("The Swift Ride", "Aisha")).toEqual({ before: "", name: "Aisha", after: "The Swift Ride" });
  });
});
