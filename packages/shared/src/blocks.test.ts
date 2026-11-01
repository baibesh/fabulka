import { describe, expect, it } from "vitest";
import {
  BOOK_FORMATS,
  BOOK_THEMES,
  DedicationSchema,
  GRID,
  PRINT_SLUG_MM,
  TemplateBlocksSchema,
  arrangeBlocks,
  chooseLayout,
  cropNote,
  newLayout,
  planBook,
  printDocument,
  printPageSize,
  renderBook,
  withFormat,
  type BlockKind,
  type PageAnalysis,
  type RenderableBook,
} from "./index";

const book = (pages = 4): RenderableBook => ({
  title: "Алия и звёзды",
  childName: "Алия",
  language: "ru",
  heroImage: "hero.png",
  pages: Array.from({ length: pages }, (_, i) => ({ page: i + 1, text: `Страница ${i + 1}.`, image: `page-${i + 1}.png` })),
  talkQuestions: ["Что случилось?"],
});

const kinds = (layout: ReturnType<typeof newLayout>) => layout.blocks.map((b) => b.kind);

describe("blocks", () => {
  it("lets the parent move, remove and add optional blocks, never the cover, story or end", () => {
    const layout = newLayout("little");
    const moved = arrangeBlocks(layout, ["cover", "story", "dedication", "talk", "drawing", "end"]);
    expect("layout" in moved && kinds(moved.layout)).toEqual(["cover", "story", "dedication", "talk", "drawing", "end"]);
    const removed = arrangeBlocks(layout, ["cover", "story", "end"]);
    expect("layout" in removed && kinds(removed.layout)).toEqual(["cover", "story", "end"]);
    const added = arrangeBlocks(layout, ["cover", "dedication", "story", "talk", "drawing", "drawing", "drawing", "end"]);
    expect("layout" in added && added.layout.blocks.filter((b) => b.kind === "drawing")).toHaveLength(3);

    const refuse = (order: BlockKind[]) => {
      const result = arrangeBlocks(layout, order);
      return "problem" in result ? result.problem : null;
    };
    expect(refuse(["story", "cover", "end"])).toBe("fixed-moved");
    expect(refuse(["cover", "dedication", "end"])).toBe("required-removed");
    expect(refuse(["cover", "story", "end", "talk"])).toBe("shape");
    expect(refuse(["cover", "story", "talk", "talk", "end"])).toBe("too-many");
    expect(refuse(["cover", "story", "drawing", "drawing", "drawing", "drawing", "drawing", "end"])).toBe("too-many");
  });

  it("keeps the template's rules: fixed blocks stay, only offered kinds can be added", () => {
    const blocks = TemplateBlocksSchema.parse({
      order: [
        { kind: "cover", movable: false, optional: false },
        { kind: "story", movable: false, optional: false },
        { kind: "talk", movable: false, optional: false },
        { kind: "end", movable: false, optional: false },
      ],
      addable: ["drawing"],
    });
    const layout = newLayout("fairy", 6, undefined, blocks);
    expect(layout.addable).toEqual(["drawing"]);
    expect("problem" in arrangeBlocks(layout, ["cover", "story", "end"])).toBe(true);
    expect("problem" in arrangeBlocks(layout, ["cover", "talk", "story", "end"])).toBe(true);
    expect("problem" in arrangeBlocks(layout, ["cover", "dedication", "story", "talk", "end"])).toBe(true);
    expect("layout" in arrangeBlocks(layout, ["cover", "story", "drawing", "talk", "end"])).toBe(true);
  });

  it("refuses a template whose cover is not first or whose story moves", () => {
    const base = { kind: "cover", movable: false, optional: false } as const;
    expect(TemplateBlocksSchema.safeParse({ order: [base, { kind: "end", movable: false, optional: false }], addable: [] }).success).toBe(false);
    expect(
      TemplateBlocksSchema.safeParse({
        order: [base, { kind: "story", movable: true, optional: false }, { kind: "end", movable: false, optional: false }],
        addable: [],
      }).success,
    ).toBe(false);
  });

  it("takes a plain-text dedication, no markup", () => {
    expect(DedicationSchema.parse("  Любимой  Алие\nот мамы ")).toBe("Любимой Алие от мамы");
    expect(DedicationSchema.safeParse("<b>Алия</b>").success).toBe(false);
    expect(DedicationSchema.safeParse("а".repeat(161)).success).toBe(false);
    expect(DedicationSchema.safeParse("   ").success).toBe(false);
  });
});

describe("padding", () => {
  it("pads with drawing pages before the end to a multiple of 4, marked as fillers", () => {
    for (const order of [
      ["cover", "story", "end"],
      ["cover", "dedication", "story", "talk", "drawing", "end"],
      ["cover", "story", "drawing", "drawing", "end"],
    ] as BlockKind[][]) {
      for (const pages of [3, 4, 5, 6]) {
        const arranged = arrangeBlocks(newLayout("little"), order);
        if (!("layout" in arranged)) throw new Error("refused");
        const plan = planBook(book(pages), arranged.layout);
        expect(plan.length % 4).toBe(0);
        expect(plan.at(-1)?.kind).toBe("end");
        const fillers = plan.filter((p) => p.filler);
        expect(fillers.length).toBeLessThan(4);
        expect(fillers.every((p) => p.kind === "drawing")).toBe(true);
        // The padding sits right before the end: it never moves a story page.
        if (fillers.length) expect(plan.indexOf(fillers.at(-1)!)).toBe(plan.length - 2);
      }
    }
  });

  it("renders the parent's dedication escaped and marks filler pages", () => {
    const layout = { ...newLayout("little"), dedication: "Для Алии & её <друзей>" };
    const rendered = renderBook(book(4), layout);
    const dedication = rendered.pages.find((p) => p.key === "dedication")!;
    expect(dedication.html).toContain("Для Алии &amp; её &lt;друзей&gt;");
    for (const page of rendered.pages.filter((p) => p.filler)) expect(page.html).toContain('data-filler="true"');
  });
});

describe("formats", () => {
  const tone = (aspect: number) => ({ aspect, lum: Array.from({ length: GRID * GRID }, () => 230) });
  const page = (n: number, aspect: number): PageAnalysis => ({ page: n, words: 8, subject: { box: null, grid: "" }, tone: tone(aspect) });

  it("drops layouts that would crop a 3:2 picture to less than half in a tall A5 page, and says so", () => {
    const a5 = withFormat(newLayout("fairy"), BOOK_FORMATS["a5-portrait"]);
    const chosen = chooseLayout(a5, [page(1, 1.5)]);
    expect(chosen.pages["1"].options).not.toContain("overlay-bottom");
    expect(chosen.pages["1"].options).not.toContain("facing");
    // A spread of two A5 pages is about as wide as the picture: it stays.
    expect(chosen.pages["1"].options).toContain("spread");
    expect(cropNote(a5, page(1, 1.5))).toMatch(/a5-portrait.*overlay-bottom 47%/);
    // The square book keeps every layout: no note.
    expect(cropNote(newLayout("fairy"), page(1, 1.5))).toBeNull();
  });

  it("falls back to the plate when no layout of the theme keeps enough picture", () => {
    const little = withFormat(newLayout("little"), { ...BOOK_FORMATS["a5-portrait"], widthMm: 100, heightMm: 300 });
    const chosen = chooseLayout(little, [page(1, 1.5)]);
    expect(chosen.pages["1"].options).toEqual(["plate"]);
    expect(cropNote(little, page(1, 1.5))).toMatch(/plate used/);
  });

  it("prints with bleed and crop marks on a sheet the size of trim, bleed and slug", () => {
    const layout = withFormat(newLayout("fairy"), BOOK_FORMATS["a4-landscape"]);
    const rendered = renderBook(book(4), layout, { bleed: true });
    const cover = rendered.pages[0].html;
    // The page grows by the bleed; the trimmed page sits inside, the picture runs into the bleed.
    expect(cover).toContain("--w:303mm");
    expect(cover).toContain('class="fb-trim" style="left:3mm;top:3mm;width:297mm;height:210mm"');
    expect(cover).toMatch(/left:-3mm;top:-3mm;width:303mm;height:216mm/);
    const size = printPageSize(layout.format);
    expect(size).toEqual({ widthMm: 297 + 2 * (3 + PRINT_SLUG_MM), heightMm: 210 + 2 * (3 + PRINT_SLUG_MM) });
    const html = printDocument(rendered, { title: "t", language: "ru", fontCss: "", format: layout.format, label: "order o1" });
    expect(html).toContain(`@page { size: ${size.widthMm}mm ${size.heightMm}mm`);
    expect(html.match(/<line /g)?.length).toBe(8 * rendered.pages.length);
    expect(html).toContain("order o1 · 1/");
    // The screen version has no bleed.
    expect(renderBook(book(4), layout).pages[0].html).not.toContain("fb-trim");
    expect(BOOK_THEMES.fairy.variants).toContain("spread");
  });
});
