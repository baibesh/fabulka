import { describe, expect, it } from "vitest";
import {
  GRID,
  chooseLayout,
  contrast,
  encodeGrid,
  gridCell,
  judgePage,
  luminance,
  newLayout,
  objectPosition,
  underBox,
  type PageAnalysis,
  type PageSubject,
} from "./index";

/** A hero in a box (0..1), as SAM's mask on the grid. */
function subject(x0: number, y0: number, x1: number, y1: number): PageSubject {
  const cells = Array.from({ length: GRID * GRID }, (_, i) => {
    const x = (i % GRID) + 0.5;
    const y = Math.floor(i / GRID) + 0.5;
    return x / GRID >= x0 && x / GRID <= x1 && y / GRID >= y0 && y / GRID <= y1;
  });
  return { box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, grid: encodeGrid(cells) };
}

/** A picture with one lightness everywhere, or a different one below `split` (0..1 from the top). */
const tone = (top: number, bottom = top, split = 0.5, aspect = 1) => ({
  aspect,
  lum: Array.from({ length: GRID * GRID }, (_, i) => (Math.floor(i / GRID) / GRID < split ? top : bottom)),
});

const page = (over: Partial<PageAnalysis> = {}): PageAnalysis => ({
  page: 1,
  words: 12,
  subject: subject(0.35, 0.25, 0.65, 0.6),
  tone: tone(225),
  ...over,
});

describe("grids", () => {
  it("round-trips a mask", () => {
    const s = subject(0.5, 0.5, 1, 1);
    expect(gridCell(s, 0, 0)).toBe(false);
    expect(gridCell(s, GRID - 1, GRID - 1)).toBe(true);
    expect(s.grid).toHaveLength((GRID * GRID) / 4);
  });

  it("computes WCAG contrast", () => {
    expect(contrast(luminance("#ffffff"), luminance("#000000"))).toBeCloseTo(21, 0);
    expect(luminance(255)).toBeCloseTo(1);
  });
});

describe("cropping", () => {
  it("keeps the hero in view when a wide picture fills a square page", () => {
    // A 3:2 picture with the hero at the far left: the crop slides left, as far as it can.
    expect(objectPosition({ x: 0.1, y: 0.5 }, 1.5, 1).x).toBe(0);
    expect(objectPosition({ x: 0.5, y: 0.5 }, 1.5, 1)).toEqual({ x: 0.5, y: 0.5 });
    // Nothing to crop vertically.
    expect(objectPosition({ x: 0.5, y: 0.1 }, 1.5, 1).y).toBe(0.5);
  });

  it("maps a box on the page to the part of the picture under it", () => {
    const art = { x: 0, y: 0, w: 210, h: 210 };
    const under = underBox({ x: 0, y: 105, w: 210, h: 105 }, art, 1.5, { x: 0.5, y: 0.5 });
    expect(under.x).toBeCloseTo(1 / 6);
    expect(under.w).toBeCloseTo(2 / 3);
    expect(under.y).toBeCloseTo(0.5);
  });
});

describe("chooser", () => {
  const layout = newLayout("fairy");

  it("puts text on the calm bottom third of a light picture, in dark ink", () => {
    const judged = judgePage(layout, page());
    expect(judged.options[0]).toBe("overlay-bottom");
    expect(judged.ink?.["overlay-bottom"]).toBe("dark");
    expect(judged.options.at(-1)).toBe("plate");
  });

  it("never puts text over the hero", () => {
    const judged = judgePage(layout, page({ subject: subject(0.1, 0.55, 0.9, 1) }));
    expect(judged.options).not.toContain("overlay-bottom");
    expect(judged.verdicts["overlay-bottom"]?.reason).toBe("overlap");
    // The plate moves to the top, away from the hero.
    expect(judged.plateBand).toBe("top");
  });

  it("uses white text on a dark sky", () => {
    const judged = judgePage(layout, page({ tone: tone(30) }));
    expect(judged.ink?.["overlay-bottom"]).toBe("light");
    expect(judged.options[0]).toBe("overlay-bottom");
  });

  it("turns down mid-grey backgrounds that neither ink reads on", () => {
    const judged = judgePage(layout, page({ tone: tone(128) }));
    expect(judged.verdicts["overlay-bottom"]?.reason).toBe("contrast");
  });

  it("turns down a busy background", () => {
    const busy = { aspect: 1, lum: Array.from({ length: GRID * GRID }, (_, i) => (i % 2 ? 20 : 240)) };
    expect(judgePage(layout, page({ tone: busy })).verdicts["overlay-bottom"]?.reason).toBe("busy");
  });

  it("never runs a spread's fold through the hero", () => {
    const adventure = newLayout("adventure", 8);
    // The hero in the middle of a 3:2 picture spread over two square pages: right on the fold.
    expect(judgePage(adventure, page()).verdicts.spread?.reason).toBe("gutter");
    // The hero on the left page, the right page's bottom calm: the spread suits.
    const left = page({ subject: subject(0.08, 0.2, 0.3, 0.6), words: 20 });
    expect(judgePage(adventure, left).verdicts.spread?.ok).toBe(true);
  });

  it("turns down fine texture that the cell means average away, like a city under the text", () => {
    // Every cell has the same mean lightness, but a lot of detail inside it (Muse Image's roofs).
    const city = { ...tone(200), detail: Array.from({ length: GRID * GRID }, () => 40) };
    expect(judgePage(layout, page({ tone: city })).verdicts["overlay-bottom"]?.reason).toBe("busy");
    const snow = { ...tone(225), detail: Array.from({ length: GRID * GRID }, () => 8) };
    expect(judgePage(layout, page({ tone: snow })).options[0]).toBe("overlay-bottom");
  });

  it("turns down a layout the text is far too long for", () => {
    const judged = judgePage(layout, page({ words: 400 }));
    expect(judged.verdicts["overlay-bottom"]?.reason).toBe("words");
    expect(judged.options).toEqual(["plate"]);
  });

  it("falls back to the plate when nothing is known of the picture", () => {
    expect(judgePage(layout, page({ subject: null })).options).toEqual(["facing", "plate"]);
  });

  it("keeps staff pins and drops a parent's pick that no longer suits", () => {
    const pinned = newLayout("fairy");
    pinned.pages["1"] = { ...judgePage(pinned, page()), pin: "overlay-top", choice: "overlay-bottom", tooFull: [] } as never;
    const next = chooseLayout(pinned, [page({ subject: subject(0.1, 0.55, 0.9, 1) })]);
    expect(next.pages["1"].pin).toBe("overlay-top");
    expect(next.pages["1"].choice).toBeNull();
  });
});
