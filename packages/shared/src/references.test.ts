import { describe, expect, it } from "vitest";
import {
  BUILTIN_ROLES,
  CreateReferenceSchema,
  REFERENCE_ATTACH,
  StoryPageSchema,
  StorySchema,
  accessOf,
  allowed,
  beatOf,
  permissionsOf,
  selectReferences,
  slotOf,
  type ReferenceChoice,
} from "./index";

let n = 0;
const ref = (over: Partial<ReferenceChoice> & Pick<ReferenceChoice, "kind">): ReferenceChoice => ({
  id: `r${++n}`,
  theme: null,
  methodology: null,
  beat: null,
  enabled: true,
  sortOrder: 0,
  ...over,
});

describe("selectReferences", () => {
  const refs = [
    ref({ kind: "style", theme: "fairy", sortOrder: 2, id: "style-fairy-c" }),
    ref({ kind: "style", theme: "fairy", sortOrder: 0, id: "style-fairy-a" }),
    ref({ kind: "style", theme: "fairy", sortOrder: 1, id: "style-fairy-b" }),
    ref({ kind: "style", theme: "fairy", sortOrder: -1, id: "style-fairy-off", enabled: false }),
    ref({ kind: "style", theme: "adventure", id: "style-adventure" }),
    ref({ kind: "composition", methodology: "growth-mindset", beat: 2, sortOrder: 1, id: "beat2-b" }),
    ref({ kind: "composition", methodology: "growth-mindset", beat: 2, sortOrder: 0, id: "beat2-a" }),
    ref({ kind: "composition", methodology: "growth-mindset", beat: 3, id: "beat3" }),
    ref({ kind: "composition", methodology: "adventure-quest", beat: 2, id: "quest2" }),
    ref({ kind: "character_guide", id: "guide" }),
  ];
  const book = { theme: "fairy", methodology: "growth-mindset" };
  const ids = (list: ReferenceChoice[]) => list.map((r) => r.id);

  it("sends the theme's style pictures in order, at most two, and the guide, with the hero sheet", () => {
    expect(ids(selectReferences(refs, book, { kind: "hero" }))).toEqual(["style-fairy-a", "style-fairy-b", "guide"]);
    expect(REFERENCE_ATTACH.style).toBe(2);
  });

  it("puts the page's beat sketch first, then the style pictures", () => {
    expect(ids(selectReferences(refs, book, { kind: "page", beat: 2 }))).toEqual(["beat2-a", "style-fairy-a", "style-fairy-b"]);
    expect(ids(selectReferences(refs, book, { kind: "page", beat: 3 }))).toEqual(["beat3", "style-fairy-a", "style-fairy-b"]);
    // A beat nobody drew, or a page without a beat: style only.
    expect(ids(selectReferences(refs, book, { kind: "page", beat: 5 }))).toEqual(["style-fairy-a", "style-fairy-b"]);
    expect(ids(selectReferences(refs, book, { kind: "page", beat: null }))).toEqual(["style-fairy-a", "style-fairy-b"]);
  });

  it("gives the cover style pictures only, and another theme its own", () => {
    expect(ids(selectReferences(refs, book, { kind: "cover" }))).toEqual(["style-fairy-a", "style-fairy-b"]);
    expect(ids(selectReferences(refs, { theme: "adventure", methodology: "adventure-quest" }, { kind: "page", beat: 2 }))).toEqual([
      "quest2",
      "style-adventure",
    ]);
  });

  it("sends nothing that is switched off, and nothing at all without references", () => {
    const off = refs.map((r) => ({ ...r, enabled: false }));
    expect(selectReferences(off, book, { kind: "page", beat: 2 })).toEqual([]);
    expect(selectReferences([], book, { kind: "hero" })).toEqual([]);
  });
});

describe("beatOf", () => {
  it("takes Muse Spark's tag when it is one of the beats", () => {
    expect(beatOf(3, 1, 10, 6)).toBe(3);
  });

  it("spreads untagged pages over the beats in order", () => {
    expect(Array.from({ length: 10 }, (_, i) => beatOf(undefined, i + 1, 10, 6))).toEqual([1, 1, 2, 2, 3, 4, 4, 5, 5, 6]);
    // A tag outside the method is not trusted.
    expect(beatOf(9, 10, 10, 6)).toBe(6);
    expect(beatOf(0, 1, 10, 6)).toBe(1);
    expect(beatOf(2, 1, 10, 0)).toBeNull();
  });

  it("is read from the story and survives a bad tag", () => {
    expect(StoryPageSchema.parse({ page: 1, beat: 2, text: "a", scene_prompt: "b" }).beat).toBe(2);
    expect(StoryPageSchema.parse({ page: 1, beat: "two", text: "a", scene_prompt: "b" }).beat).toBeUndefined();
    const story = StorySchema.parse({ title: "t", hero_description: "h", pages: [{ page: 1, text: "a", scene_prompt: "b" }], talk_questions: ["1", "2", "3"] });
    expect(story.cover_scene).toBeNull();
    expect(story.blurb).toBeNull();
  });
});

describe("reference slots", () => {
  const image = "data:image/png;base64,iVBORw0KGgo=";

  it("keeps only the fields a kind uses", () => {
    expect(slotOf({ kind: "style", theme: "fairy", methodology: "x", beat: 2 })).toEqual({ kind: "style", theme: "fairy", methodology: null, beat: null });
    expect(slotOf({ kind: "character_guide", theme: "fairy" })).toEqual({ kind: "character_guide", theme: null, methodology: null, beat: null });
  });

  it("asks a style picture for a theme and a composition sketch for a method beat", () => {
    expect(CreateReferenceSchema.safeParse({ kind: "style", image }).success).toBe(false);
    expect(CreateReferenceSchema.safeParse({ kind: "style", theme: "fairy", image }).success).toBe(true);
    expect(CreateReferenceSchema.safeParse({ kind: "composition", methodology: "growth-mindset", image }).success).toBe(false);
    expect(CreateReferenceSchema.safeParse({ kind: "composition", methodology: "growth-mindset", beat: 2, image }).success).toBe(true);
    expect(CreateReferenceSchema.safeParse({ kind: "cover", theme: "fairy", image }).success).toBe(false);
    expect(CreateReferenceSchema.safeParse({ kind: "character_guide", image: "not a data url" }).success).toBe(false);
  });
});

describe("the illustrator role", () => {
  it("opens references, books for review and themes and methods to read", () => {
    const role = BUILTIN_ROLES.find((r) => r.key === "illustrator")!;
    expect(role).toMatchObject({ scoped: false, locked: false });
    expect(role.rights).toEqual(["references", "books.review", "themes.read", "methodologies.read"]);
    const access = accessOf(["illustrator"], BUILTIN_ROLES, []);
    expect(permissionsOf(access)).toEqual(["books", "methodologies", "themes", "references"]);
    // Reading and flagging, never the whole sections' writes.
    expect(allowed(access, ["books.review"])).toBe(true);
    expect(allowed(access, ["books"])).toBe(false);
    expect(allowed(access, ["themes"])).toBe(false);
    expect(allowed(access, ["themes", "themes.read"])).toBe(true);
    expect(allowed(access, ["orders"])).toBe(false);
  });

  it("is covered by the superadmin and by the whole sections", () => {
    const admin = accessOf(["admin"], BUILTIN_ROLES, []);
    expect(allowed(admin, ["references"])).toBe(true);
    expect(allowed(admin, ["books.review"])).toBe(true);
    const books = accessOf(["staff"], [{ key: "staff", rights: ["books"], scoped: false }], []);
    expect(allowed(books, ["books.review"])).toBe(true);
  });
});
