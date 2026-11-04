import { describe, expect, it } from "vitest";
import {
  BOOK_THEMES,
  COMIC,
  CreateStoryFormatSchema,
  DEFAULT_STORY_FORMATS,
  FULL_FRAME,
  GRID,
  PICTURE_BOOK,
  PRESET_GRIDS,
  StorySchema,
  encodeGrid,
  formatEstimate,
  frameBox,
  frameImageSize,
  frameInner,
  gridFor,
  isPanelPage,
  layoutPanels,
  letteringBox,
  letteringSize,
  MIN_LETTERING_PT,
  newLayout,
  normalizePage,
  normalizePages,
  pageImagePaths,
  pageProse,
  pipelineFor,
  placeFrameTexts,
  renderBook,
  samConceptsFor,
  storedPageFrom,
  type PageSubject,
  type PlacedText,
  type RenderableBook,
  type StoryPage,
} from "./index";

const picture = DEFAULT_STORY_FORMATS.find((f) => f.slug === PICTURE_BOOK)!;
const comic = DEFAULT_STORY_FORMATS.find((f) => f.slug === COMIC)!;

/** A page of a book made before formats, as Book.pages kept it. */
const legacy = {
  page: 2,
  beat: 3,
  text: "Тимур проснулся рано.",
  scenePrompt: "the hero wakes up",
  imagePath: "books/b1/page-2.jpeg",
  subject: { box: { x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, grid: "" },
  tone: null,
  art: "softened" as const,
};

describe("formats as data", () => {
  it("seeds a picture book (one full frame, one narration) and a comic (panels, balloons, captions, sound)", () => {
    expect(picture.grids).toEqual([{ id: "full", frames: [FULL_FRAME] }]);
    expect(picture.textRules.map((t) => t.kind)).toEqual(["narration"]);
    expect(comic.textRules.map((t) => t.kind)).toEqual(["caption", "speech", "sfx"]);
    expect(comic.grids.every((g) => g.frames.length >= 3 && g.frames.length <= 6)).toBe(true);
    expect(comic.theme).toBe("comic");
    expect(BOOK_THEMES.comic.lettering?.font).toEqual({ family: "Nunito", weight: 800 });
    // Every seed passes the admin's own validation.
    for (const format of DEFAULT_STORY_FORMATS) {
      const { sortOrder, ...fields } = format;
      expect(CreateStoryFormatSchema.safeParse({ ...fields, sortOrder, published: true }).success).toBe(true);
    }
  });

  it("refuses repeated grid ids and kinds of text, and frames off the page", () => {
    const { sortOrder, ...fields } = comic;
    const base = { ...fields, sortOrder, published: true, slug: "x-test" };
    expect(CreateStoryFormatSchema.safeParse({ ...base, grids: [PRESET_GRIDS[1], PRESET_GRIDS[1]] }).success).toBe(false);
    expect(
      CreateStoryFormatSchema.safeParse({ ...base, textRules: [comic.textRules[0], comic.textRules[0]] }).success,
    ).toBe(false);
    expect(
      CreateStoryFormatSchema.safeParse({ ...base, grids: [{ id: "bad", frames: [{ x: 0.5, y: 0, w: 0.8, h: 1 }] }] }).success,
    ).toBe(false);
  });

  it("asks SAM for faces only where a balloon must point at a head", () => {
    expect(samConceptsFor(["narration"])).toEqual(["person", "animal"]);
    expect(samConceptsFor(["caption", "sfx"])).toEqual(["person", "animal"]);
    expect(samConceptsFor(["caption", "speech"])).toEqual(["person", "animal", "face"]);
  });

  it("estimates a book's cost and time from its frames, not one picture a page", () => {
    const book = formatEstimate(picture, { pages: 10 });
    // 10 pages, the hero's sheet and the cover; two SAM requests a picture plus the cover's.
    expect(book.images).toBe(12);
    expect(book.samCalls).toBe(22);
    const strips = formatEstimate(comic, { pages: 10 });
    // 8 pages of 3 to 5 panels: 32 frames, the hero, two cast sheets and the cover.
    expect(strips.images).toBe(32 + 1 + 2 + 1);
    expect(strips.samCalls).toBe(32 * 3 + 2);
    expect(strips.usd).toBeGreaterThan(book.usd * 2);
    expect(strips.seconds).toBeGreaterThan(book.seconds);
    expect(formatEstimate(picture, { pages: 10, pet: true, toy: true }).images).toBe(14);
  });

  it("lists every pipeline step with its model, what it runs per and the format's settings", () => {
    const steps = pipelineFor(comic);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    const draw = steps.find((s) => s.id === "frame.draw")!;
    expect(draw).toMatchObject({ model: "muse-image", per: "frame", params: { artStyle: comic.artStyle } });
    expect(steps.find((s) => s.id === "frame.mask")!.params.concepts).toEqual(["person", "animal", "face"]);
    expect(steps.find((s) => s.id === "sheet.cast")!.optional).toBe(false);
    expect(pipelineFor(picture).find((s) => s.id === "sheet.cast")!.optional).toBe(true);
    for (const step of steps) for (const before of step.after) expect(steps.some((s) => s.id === before)).toBe(true);
  });
});

describe("the scenario Muse Spark writes", () => {
  it("reads a page in the older shape (text, scene_prompt) as one full frame and its narration", () => {
    const story = StorySchema.parse({
      title: "T",
      hero_description: "a boy",
      pages: [{ page: 1, beat: 1, text: "Once upon a time.", scene_prompt: "the hero in the park" }],
      talk_questions: ["a?", "b?", "c?"],
    });
    expect(story.cast).toEqual([]);
    expect(story.pages[0]).toMatchObject({
      grid: "full",
      frames: [{ frame: 1, scene_prompt: "the hero in the park", cast: [] }],
      texts: [{ kind: "narration", frame: 1, speaker: null, text: "Once upon a time." }],
    });
  });

  it("takes a comic page: grid, frames with who stands where, balloons with speakers, cast ids made safe", () => {
    const story = StorySchema.parse({
      title: "T",
      hero_description: "a boy",
      cast: [{ id: "Ayla Bek!", name: "Ayla", look: "a girl with braids" }],
      pages: [
        {
          page: 1,
          grid: "big-top-2",
          frames: [
            { frame: 1, scene_prompt: "a", cast: [{ id: "hero", at: "left" }, { id: "ayla", at: "middle" }] },
            { frame: 2, scene_prompt: "b" },
            { frame: 3, scene_prompt: "c" },
          ],
          texts: [{ kind: "speech", frame: 1, speaker: "hero", text: "Look!" }],
        },
      ],
      talk_questions: ["a?", "b?", "c?"],
    });
    expect(story.cast[0]).toMatchObject({ id: "ayla-bek", kind: "character" });
    // An unknown position is dropped rather than failing the story.
    expect(story.pages[0].frames[0].cast).toEqual([{ id: "hero", at: "left" }, { id: "ayla" }]);
  });

  it("fits a page to the format: its grid, its kinds of text, as many a frame as allowed, stable ids", () => {
    const page: StoryPage = {
      page: 4,
      grid: "grid-4",
      frames: [1, 2, 3, 4].map((frame) => ({ frame, scene_prompt: `s${frame}`, cast: [] })),
      texts: [
        { kind: "caption", frame: 1, speaker: null, text: "Meanwhile" },
        { kind: "speech", frame: 1, speaker: null, text: "Hi!" },
        { kind: "speech", frame: 1, speaker: "ayla", text: "Hello!" },
        { kind: "speech", frame: 1, speaker: "ayla", text: "One too many" },
        { kind: "narration", frame: 2, speaker: null, text: "Not a comic's kind" },
        { kind: "sfx", frame: 9, speaker: "hero", text: "BOOM" },
      ],
    };
    const stored = storedPageFrom(page, comic, 2);
    expect(stored.grid).toBe("grid-4");
    expect(stored.frames.map((f) => f.rect)).toEqual(PRESET_GRIDS.find((g) => g.id === "grid-4")!.frames);
    expect(stored.texts.map((t) => [t.id, t.kind, t.frame, t.speaker, t.text])).toEqual([
      ["1.1", "caption", 1, null, "Meanwhile"],
      // A balloon without a speaker is the hero's.
      ["1.2", "speech", 1, "hero", "Hi!"],
      ["1.3", "speech", 1, "ayla", "Hello!"],
      // A frame past the last one is the last frame; a sound word has no speaker.
      ["4.1", "sfx", 4, null, "BOOM"],
    ]);
    // A grid Spark named that does not match its frames: the format's first grid with as many.
    expect(gridFor(comic, "grid-4", 3).id).toBe("big-top-2");
    expect(gridFor(comic, undefined, 9).frames.length).toBe(5);
  });
});

describe("books made before formats", () => {
  it("are read losslessly: one full frame with the picture, mask, tone and outcome, and one narration", () => {
    const page = normalizePage(legacy);
    expect(page).toEqual({
      page: 2,
      beat: 3,
      grid: "full",
      frames: [
        {
          frame: 1,
          rect: FULL_FRAME,
          scenePrompt: "the hero wakes up",
          cast: [],
          imagePath: "books/b1/page-2.jpeg",
          subject: legacy.subject,
          tone: null,
          art: "softened",
        },
      ],
      texts: [{ id: "1.1", kind: "narration", frame: 1, speaker: null, text: "Тимур проснулся рано." }],
    });
    // Reading it again changes nothing, and it is still a picture book page.
    expect(normalizePage(page)).toEqual(page);
    expect(isPanelPage(page)).toBe(false);
    expect(pageProse(page)).toBe(legacy.text);
    expect(pageImagePaths(page)).toEqual(["books/b1/page-2.jpeg"]);
    expect(normalizePages("not pages")).toEqual([]);
  });

  it("render exactly as before through the adapter", () => {
    const layout = newLayout("fairy", 6);
    const page = normalizePage(legacy);
    const before: RenderableBook = {
      title: "T",
      childName: "Тимур",
      language: "ru",
      heroImage: "hero.jpeg",
      pages: [{ page: 2, text: legacy.text, image: "page-2.jpeg" }],
      talkQuestions: [],
    };
    const after: RenderableBook = {
      ...before,
      pages: [
        {
          page: 2,
          text: pageProse(page),
          image: "page-2.jpeg",
          frames: page.frames.map((f) => ({ frame: f.frame, rect: f.rect, image: "page-2.jpeg" })),
          texts: page.texts,
        },
      ],
    };
    expect(renderBook(after, layout).pages.map((p) => p.html)).toEqual(renderBook(before, layout).pages.map((p) => p.html));
  });
});

describe("panel pages", () => {
  const layout = { ...newLayout(BOOK_THEMES.comic, 10, "square-210"), panels: { gutterMm: 3, borderMm: 0.8 } };

  it("put frames on the safe area with the gutter between them, and pick the picture's shape", () => {
    const [top, left, right] = PRESET_GRIDS.find((g) => g.id === "big-top-2")!.frames.map((r) => frameBox(layout.format, r, 3));
    expect(top.x).toBeCloseTo(12);
    expect(top.w).toBeCloseTo(186);
    expect(left.y - (top.y + top.h)).toBeCloseTo(3);
    expect(right.x - (left.x + left.w)).toBeCloseTo(3);
    expect(right.x + right.w).toBeCloseTo(198);
    expect(frameImageSize(top, true)).toBe("1536x1024");
    expect(frameImageSize(left, true)).toBe("1024x1024");
    expect(frameImageSize({ w: 50, h: 90 }, true)).toBe("1024x1536");
    // A picture book page is drawn as before, whatever its shape.
    expect(frameImageSize({ w: 50, h: 90 }, false)).toBe("1536x1024");
  });

  it("estimate lettering: longer text wraps into more lines", () => {
    const one = letteringSize("Hi!", 9, 40);
    const many = letteringSize("Look at that kite flying over the cathedral, quick!", 9, 40);
    expect(one.lines).toBe(1);
    expect(many.lines).toBeGreaterThan(1);
    expect(many.w).toBeLessThanOrEqual(40);
  });

  /** A figure on the right half of the picture with its face at the top, as SAM finds them. */
  const figure: PageSubject = {
    box: { x: 0.6, y: 0.35, w: 0.3, h: 0.6 },
    grid: encodeGrid(
      Array.from({ length: GRID * GRID }, (_, i) => {
        const x = ((i % GRID) + 0.5) / GRID;
        const y = (Math.floor(i / GRID) + 0.5) / GRID;
        return x > 0.6 && x < 0.9 && y > 0.35;
      }),
    ),
    people: [{ concept: "person", box: { x: 0.6, y: 0.35, w: 0.3, h: 0.6 } }],
    faces: [{ x: 0.68, y: 0.37, w: 0.14, h: 0.16 }],
  };

  it("place a balloon above its speaker, off the face, with its tail toward the head", () => {
    const box = { x: 0, y: 0, w: 120, h: 80 };
    const [balloon] = placeFrameTexts(
      { frame: 1, box, aspect: 1.5, focus: { x: 0.5, y: 0.5 }, subject: figure, cast: [{ id: "hero", at: "right" }] },
      [{ id: "1.1", kind: "speech", frame: 1, speaker: "hero", text: "Look at the kite!" }],
      9,
    );
    expect(balloon.face).toBe(false);
    // Above the head: the balloon ends before the face begins.
    expect(balloon.box.y + balloon.box.h).toBeLessThanOrEqual(0.37 + 0.01);
    // The tail goes down toward the face's top and stops short of it.
    expect(balloon.tail!.y).toBeGreaterThan(balloon.box.y + balloon.box.h);
    expect(balloon.tail!.y).toBeLessThan(0.37 + 0.16 / 2);
    expect(Math.abs(balloon.tail!.x - 0.75)).toBeLessThan(0.2);
  });

  it("keep two balloons apart in reading order, the caption in a corner, the sound word big and tilted", () => {
    const box = { x: 0, y: 0, w: 120, h: 80 };
    const placed = placeFrameTexts(
      { frame: 2, box, aspect: 1.5, focus: { x: 0.5, y: 0.5 }, subject: figure, cast: [{ id: "hero", at: "right" }] },
      [
        { id: "2.3", kind: "sfx", frame: 2, speaker: null, text: "WHOOSH!" },
        { id: "2.1", kind: "caption", frame: 2, speaker: null, text: "Meanwhile at the park" },
        { id: "2.2", kind: "speech", frame: 2, speaker: "hero", text: "Here we go!" },
        { id: "2.4", kind: "speech", frame: 2, speaker: "hero", text: "Faster!" },
      ],
      9,
    );
    expect(placed.map((p) => p.kind)).toEqual(["caption", "speech", "speech", "sfx"]);
    const [caption, first, second, sfx] = placed;
    expect(caption.box.x === 0 || caption.box.x + caption.box.w >= 0.999).toBe(true);
    const overlap = (a: typeof first, b: typeof first) =>
      a.box.x < b.box.x + b.box.w && b.box.x < a.box.x + a.box.w && a.box.y < b.box.y + b.box.h && b.box.y < a.box.y + a.box.h;
    expect(overlap(first, second)).toBe(false);
    // Read top to bottom: the later line is not above the earlier one.
    expect(second.box.y + second.box.h / 2).toBeGreaterThanOrEqual(first.box.y + first.box.h / 2);
    expect(overlap(first, caption)).toBe(false);
    expect(placed.every((p) => !p.face)).toBe(true);
    expect(sfx.pt).toBeGreaterThan(first.pt * 2);
    expect(sfx.rotate).not.toBe(0);
  });

  it("lay a comic page out and draw it: panels, balloons as one ink shape, each text a fit box QA can name", () => {
    const grid = PRESET_GRIDS.find((g) => g.id === "big-top-2")!;
    const texts = [
      { id: "1.1", kind: "caption" as const, frame: 1, speaker: null, text: "Almaty, morning" },
      { id: "1.2", kind: "speech" as const, frame: 1, speaker: "hero", text: "Look at the kite!" },
      { id: "3.1", kind: "sfx" as const, frame: 3, speaker: null, text: "BOOM!" },
    ];
    const laidOut = layoutPanels(layout, [
      {
        page: 1,
        frames: grid.frames.map((rect, i) => ({ frame: i + 1, rect, subject: i === 1 ? null : figure, aspect: 1.5, cast: [] })),
        texts,
      },
    ]);
    const state = laidOut.pages["1"];
    expect(state).toMatchObject({ panels: true, options: ["plate"] });
    expect(state.balloons.map((b) => b.id)).toEqual(["1.1", "1.2", "3.1"]);
    const book: RenderableBook = {
      title: "Comic",
      childName: "Alia",
      language: "kk",
      heroImage: "hero.jpeg",
      pages: [
        {
          page: 1,
          text: "",
          image: "page-1.jpeg",
          frames: grid.frames.map((rect, i) => ({ frame: i + 1, rect, image: i === 2 ? null : `page-1-${i + 1}.jpeg` })),
          texts,
        },
      ],
      talkQuestions: [],
    };
    const page = renderBook(book, laidOut).pages.find((p) => p.key === "story-1")!;
    expect(page.html).toContain("fb-panels");
    expect((page.html.match(/class="fb-panel"/g) ?? []).length).toBe(3);
    expect(page.html).toContain('data-el="1:1.2"');
    expect(page.html).toContain("<ellipse");
    expect(page.html).toContain("fb-caption");
    expect(page.html).toContain("fb-sfx");
    // A refused frame shows the hero's sheet small on paper.
    expect(page.html).toContain("fb-panel-vignette");
    // The lettering font is the theme's.
    expect(page.html).toContain("--letter:'Nunito'");
    expect(page.variant).toBe("plate");
  });
});

describe("balloons in tight panels", () => {
  /** A strip panel the size of a comic's half-width frame (mm), its picture as wide as the frame. */
  const W = 89;
  const H = 52;
  const box = { x: 0, y: 0, w: W, h: H };
  type Box = { x: number; y: number; w: number; h: number };
  /** SAM's answer as it comes for a frame: figures, their faces and the mask of the figures. */
  const subjectOf = (people: Box[], faces: Box[]): PageSubject => ({
    box: people[0] ?? null,
    grid: encodeGrid(
      Array.from({ length: GRID * GRID }, (_, i) => {
        const x = ((i % GRID) + 0.5) / GRID;
        const y = (Math.floor(i / GRID) + 0.5) / GRID;
        return people.some((p) => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h);
      }),
    ),
    people: people.map((b) => ({ concept: "person" as const, box: b })),
    faces,
  });
  const frameOf = (subject: PageSubject) => ({
    frame: 1,
    box,
    aspect: W / H,
    focus: { x: 0.5, y: 0.5 },
    subject,
    cast: [
      { id: "hero", at: "left" as const },
      { id: "timur", at: "right" as const },
    ],
    reach: { left: 1.9, top: 3.8, right: 1.9, bottom: 1.9 },
  });
  /** The share of a face (a box, as a share of the frame) under a placed text's shape, measured on its own. */
  const covered = (b: PlacedText, face: Box) => {
    const [cx, cy, rx, ry] = [b.box.x + b.box.w / 2, b.box.y + b.box.h / 2, b.box.w / 2, b.box.h / 2];
    let hit = 0;
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 10; j++) {
        const x = face.x + ((i + 0.5) / 10) * face.w;
        const y = face.y + ((j + 0.5) / 10) * face.h;
        const inside =
          b.kind === "speech" && b.shape === "ellipse"
            ? ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
            : x >= b.box.x && x <= b.box.x + b.box.w && y >= b.box.y && y <= b.box.y + b.box.h;
        if (inside) hit++;
      }
    return hit / 100;
  };
  const lines = [
    { id: "2.1", kind: "speech" as const, frame: 1, speaker: "hero", text: "Wind smells like apples and adventure here!" },
    { id: "2.2", kind: "speech" as const, frame: 1, speaker: "timur", text: "I smell like dried apricots now!" },
  ];

  it("keep two long lines off both faces when the heads fill the top of a strip panel", () => {
    // Two children side by side, their faces in the upper middle: the old placement put the first line on a face.
    const faces = [
      { x: 0.2, y: 0.18, w: 0.17, h: 0.32 },
      { x: 0.6, y: 0.14, w: 0.17, h: 0.32 },
    ];
    const subject = subjectOf(
      [
        { x: 0.12, y: 0.15, w: 0.32, h: 0.85 },
        { x: 0.52, y: 0.1, w: 0.34, h: 0.9 },
      ],
      faces,
    );
    const placed = placeFrameTexts(frameOf(subject), lines, 9.5);
    expect(placed.map((p) => p.id)).toEqual(["2.1", "2.2"]);
    for (const b of placed) {
      expect(b.face).toBe(false);
      for (const f of faces) expect(covered(b, f)).toBe(0);
      // The lettering stays inside the frame even where the balloon stands out over the border.
      const inner = letteringBox(b.shape, { x: b.box.x * W, y: b.box.y * H, w: b.box.w * W, h: b.box.h * H }, b.pt);
      expect(inner.x).toBeGreaterThanOrEqual(0);
      expect(inner.y).toBeGreaterThanOrEqual(0);
      expect(inner.x + inner.w).toBeLessThanOrEqual(W + 1e-6);
      expect(inner.y + inner.h).toBeLessThanOrEqual(H + 1e-6);
      expect(b.pt).toBeGreaterThanOrEqual(MIN_LETTERING_PT);
    }
    // Reading order: the first line reads first (higher, or on the left beside the second).
    const [a, b] = placed.map((p) => p.box);
    const beside = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.4 * Math.min(a.h, b.h);
    if (beside) expect(a.x + a.w / 2).toBeLessThan(b.x + b.w / 2);
    else expect(a.y + a.h / 2).toBeLessThan(b.y + b.h / 2);
    // Each tail points toward its own speaker's head and stops outside the face.
    for (const [i, p] of placed.entries()) {
      const face = faces[i];
      const head = { x: face.x + face.w / 2, y: face.y };
      const centre = { x: p.box.x + p.box.w / 2, y: p.box.y + p.box.h / 2 };
      const tip = p.tail!;
      expect(Math.hypot((tip.x - head.x) * W, (tip.y - head.y) * H)).toBeLessThan(Math.hypot((centre.x - head.x) * W, (centre.y - head.y) * H));
      expect(tip.x > face.x && tip.x < face.x + face.w && tip.y > face.y && tip.y < face.y + face.h).toBe(false);
    }
  });

  it("wrap, box or letter a line smaller rather than cover a face in a crowd", () => {
    // A crowd: faces across the top and one big face in the middle leave only odd corners.
    const faces = [0.02, 0.2, 0.38, 0.56, 0.74].map((x) => ({ x, y: 0.06, w: 0.13, h: 0.24 })).concat([{ x: 0.3, y: 0.38, w: 0.4, h: 0.3 }]);
    const subject = subjectOf([{ x: 0.25, y: 0.35, w: 0.5, h: 0.65 }], faces);
    const placed = placeFrameTexts(frameOf(subject), lines, 9.5);
    expect(placed).toHaveLength(2);
    for (const b of placed) {
      expect(b.face).toBe(false);
      for (const f of faces) expect(covered(b, f)).toBe(0);
    }
  });

  it("let a line no balloon can carry clear of faces fail QA, then move it into a caption box at the edge", () => {
    // Faces everywhere but a strip along the top one line high: only a box as wide as the frame fits there.
    const faces: Box[] = [];
    for (let x = 0; x < 1; x += 0.125) for (let y = 0.13; y < 0.99; y += 0.18) faces.push({ x: x + 0.005, y, w: 0.115, h: 0.17 });
    const subject = subjectOf([{ x: 0, y: 0.13, w: 1, h: 0.87 }], faces);
    const line = [{ id: "1.1", kind: "speech" as const, frame: 1, speaker: "hero", text: "Up, up and away! Beanie Airlines boarding!" }];
    const [balloon] = placeFrameTexts(frameOf(subject), line, 9.5);
    expect(balloon.face).toBe(true);
    const [moved] = placeFrameTexts(frameOf(subject), line, 9.5, { captions: true });
    expect(moved.shape).toBe("caption");
    expect(moved.face).toBe(false);
    for (const f of faces) expect(covered(moved, f)).toBe(0);
    // Along the frame's top edge, its tail still toward the speaker.
    expect(moved.box.y).toBeLessThanOrEqual(0.02);
    expect(moved.tail).not.toBeNull();
  });

  it("draw a boxed line as a rect, measured inside the frame's border", () => {
    const layout = { ...newLayout(BOOK_THEMES.comic, 10, "square-210"), panels: { gutterMm: 3, borderMm: 0.8 } };
    const grid = PRESET_GRIDS.find((g) => g.id === "big-top-2")!;
    const texts = [{ id: "2.1", kind: "speech" as const, frame: 2, speaker: "hero", text: "Look!" }];
    const laidOut = layoutPanels(layout, [{ page: 1, frames: grid.frames.map((rect, i) => ({ frame: i + 1, rect, subject: null, aspect: 1.5, cast: [] })), texts }]);
    const state = laidOut.pages["1"];
    state.balloons = state.balloons.map((b) => ({ ...b, shape: "box" as const }));
    const book: RenderableBook = {
      title: "Comic",
      childName: "Alia",
      language: "en",
      heroImage: null,
      pages: [{ page: 1, text: "", image: null, frames: grid.frames.map((rect, i) => ({ frame: i + 1, rect, image: `page-1-${i + 1}.jpeg` })), texts }],
      talkQuestions: [],
    };
    const html = renderBook(book, laidOut).pages.find((p) => p.key === "story-1")!.html;
    expect(html).toContain("<rect");
    expect(html).not.toContain("<ellipse");
    const inner = frameInner(frameBox(layout.format, grid.frames[1], 3), 0.8);
    expect(html).toContain(`viewBox="0 0 ${Math.round(inner.w * 100) / 100} ${Math.round(inner.h * 100) / 100}"`);
  });
});
