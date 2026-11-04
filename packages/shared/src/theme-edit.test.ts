import { describe, expect, it } from "vitest";
import {
  BOOK_THEMES,
  ThemeEditSchema,
  applyEdit,
  checkFonts,
  checksPass,
  copyNames,
  editFromProposal,
  editOf,
  isComicTheme,
  proposalOf,
  themeChanges,
} from "./index";

describe("editing themes by hand", () => {
  it("edits a curated theme's copy as an AI theme, keeping its id, version and fit limits", () => {
    const edit = editOf(BOOK_THEMES.fairy);
    expect(ThemeEditSchema.safeParse(edit).success).toBe(true);
    expect(edit.name.en).toBe("Fairy tale");
    const warmer = applyEdit({ ...BOOK_THEMES.fairy, id: "copy-1" }, { ...edit, palette: { ...edit.palette, paper: "#fff3e0" } });
    expect(warmer).toMatchObject({ id: "copy-1", version: 1, source: "ai", minFit: 0.8, palette: { paper: "#fff3e0" } });
    // The curated theme in code is untouched.
    expect(BOOK_THEMES.fairy.palette.paper).toBe("#fbf5ea");
  });

  it("names a copy in every language within the 40 characters a name may have", () => {
    const names = copyNames(BOOK_THEMES.little);
    expect(names).toMatchObject({ ru: "Малышам (копия)", de: "Für die Kleinen (Kopie)" });
    expect(Object.values(names).every((n) => n.length <= 40)).toBe(true);
  });

  it("lists every changed field with before and after, arrays whole", () => {
    const before = editOf(BOOK_THEMES.adventure);
    const after = { ...before, palette: { ...before.palette, ink: "#000000" }, variants: [...before.variants].reverse() };
    expect(themeChanges(before, after)).toEqual([
      { path: "palette.ink", before: "#1d2a33", after: "#000000" },
      { path: "variants", before: before.variants, after: after.variants },
    ]);
    expect(themeChanges(before, structuredClone(before))).toEqual([]);
  });

  it("takes Muse Spark's adjusted proposal but keeps the ornament image and a comic theme's panel layout", () => {
    const comic = { ...editOf(BOOK_THEMES.comic), ornamentImage: "themes/copy-1/ornament-0123456789abcdef.png" };
    const proposal = { ...proposalOf(comic, "the current ornament"), variants: ["split" as const], palette: { ...comic.palette, paper: "#fffaf0" } };
    const next = editFromProposal(comic, proposal);
    expect(next.variants).toEqual(["plate"]);
    expect(next.ornamentImage).toBe(comic.ornamentImage);
    expect(next.lettering).toEqual(comic.lettering);
    expect(next.palette.paper).toBe("#fffaf0");
    expect(isComicTheme(applyEdit(BOOK_THEMES.comic, next))).toBe(true);
  });

  it("checks the comic lettering font against the vetted list too", () => {
    const odd = { ...BOOK_THEMES.comic, lettering: { font: { family: "Bangers", weight: 400 }, scale: 0.8 } };
    expect(checkFonts(odd)).toMatchObject({ ok: false, detail: expect.stringMatching(/lettering font Bangers/) });
    expect(checkFonts(BOOK_THEMES.comic).ok).toBe(true);
  });

  it("publishes only what passed every check, the sample book included", () => {
    expect(checksPass([])).toBe(false);
    expect(checksPass([{ check: "contrast", ok: true, detail: "" }])).toBe(false);
    expect(checksPass([{ check: "contrast", ok: true, detail: "" }, { check: "render", ok: true, detail: "" }])).toBe(true);
    expect(checksPass([{ check: "contrast", ok: false, detail: "" }, { check: "render", ok: true, detail: "" }])).toBe(false);
  });
});
