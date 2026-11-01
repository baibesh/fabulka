import { describe, expect, it } from "vitest";
import { BOOK_THEMES, ProposedThemeSchema, checkContrast, checkFonts, checkSizes, renderBook, newLayout, themeFromProposal, type RenderableBook } from "./index";

const proposal = {
  name: { ru: "Лес", kk: "Орман", en: "Forest", es: "Bosque", de: "Wald" },
  fonts: { heading: { family: "Comfortaa", weight: 700 }, body: { family: "Literata", weight: 400 } },
  palette: { paper: "#f6f8ef", ink: "#22331f", accent: "#3f7d4e", muted: "#5d6b58", cover: "#dfeacf", plate: "#f6f8ef" },
  sizes: {
    young: { bodyPt: 20, lineHeight: 1.4, titlePt: 34, headingPt: 24, maxWords: 25 },
    middle: { bodyPt: 16, lineHeight: 1.4, titlePt: 32, headingPt: 22, maxWords: 50 },
    older: { bodyPt: 13.5, lineHeight: 1.4, titlePt: 30, headingPt: 21, maxWords: 75 },
  },
  variants: ["overlay-bottom", "split", "plate"],
  textSpace: "bottom",
  cover: "framed",
  ornament: "leaf",
  ornamentPrompt: "a wreath of leaves",
};

describe("AI theme checks", () => {
  const theme = themeFromProposal("ai-test", ProposedThemeSchema.parse(proposal));

  it("passes a readable, vetted, age-appropriate theme; the curated ones pass too", () => {
    expect(theme).toMatchObject({ source: "ai", variants: ["overlay-bottom", "split"], languages: [], ornamentImage: null });
    for (const t of [theme, BOOK_THEMES.fairy, BOOK_THEMES.adventure, BOOK_THEMES.little]) {
      expect(checkFonts(t).ok).toBe(true);
      expect(checkContrast(t).ok).toBe(true);
      expect(checkSizes(t).ok).toBe(true);
    }
  });

  it("refuses pale ink with the numbers", () => {
    const pale = { ...theme, palette: { ...theme.palette, ink: "#c9cfc0" } };
    const check = checkContrast(pale);
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/ink #c9cfc0 on paper #f6f8ef: 1\.\d\d, needs 4\.5/);
  });

  it("refuses fonts off the list, missing weights and display fonts for body text", () => {
    expect(checkFonts({ ...theme, fonts: { ...theme.fonts, heading: { family: "Papyrus", weight: 400 } } }).detail).toMatch(/not on the vetted list/);
    expect(checkFonts({ ...theme, fonts: { ...theme.fonts, body: { family: "Literata", weight: 300 } } }).detail).toMatch(/no weight 300/);
    expect(checkFonts({ ...theme, fonts: { ...theme.fonts, body: { family: "Lobster", weight: 400 } } }).detail).toMatch(/display font/);
  });

  it("refuses type too small for young readers or too many words", () => {
    const tiny = { ...theme, sizes: { ...theme.sizes, young: { ...theme.sizes.young, bodyPt: 11, maxWords: 90 } } };
    const check = checkSizes(tiny);
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/young: body 11pt, allowed 16–26pt/);
    expect(check.detail).toMatch(/young: 90 words a page, at most 40/);
  });

  it("refuses JSON that names an unknown layout or a color that is not a color", () => {
    expect(ProposedThemeSchema.safeParse({ ...proposal, variants: ["diagonal"] }).success).toBe(false);
    expect(ProposedThemeSchema.safeParse({ ...proposal, palette: { ...proposal.palette, ink: "dark green" } }).success).toBe(false);
  });

  it("prints the drawn ornament from where the renderer is told", () => {
    const book: RenderableBook = { title: "T", childName: "A", language: "en", heroImage: null, pages: [{ page: 1, text: "x", image: null }], talkQuestions: [] };
    const html = renderBook(book, newLayout({ ...theme, ornamentImage: "themes/ai-test/ornament.png" }), { asset: (p) => `file:///s/${p}` }).pages.find((p) => p.key === "dedication")!.html;
    expect(html).toContain('<img class="fb-ornament-img" src="file:///s/themes/ai-test/ornament.png"');
  });
});
