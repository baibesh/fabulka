import { describe, expect, it } from "vitest";
import { MESSAGES } from "../i18n/messages";
import { DEFAULT_OG_IMAGE, defaultSeo, fallbackSeo, resolveSeo, seoMetadata } from "./seo-meta";

const none = { title: null, description: null, ogImageUrl: null, noindex: false };

describe("resolveSeo", () => {
  it("takes what staff published first", () => {
    const seo = resolveSeo("de", { key: "catalog" }, { title: "Mein Titel", description: "Meine Beschreibung", ogImageUrl: "/files/seo/og-1.jpg", noindex: true });
    expect(seo).toMatchObject({ title: "Mein Titel", description: "Meine Beschreibung", image: "/files/seo/og-1.jpg", noindex: true });
    expect(seo.source).toEqual({ title: "custom", description: "custom", image: "custom" });
  });

  it("falls back field by field to the page's default in its language", () => {
    const seo = resolveSeo("de", { key: "catalog" }, { ...none, title: "Nur der Titel" });
    expect(seo.title).toBe("Nur der Titel");
    expect(seo.description).toBe(MESSAGES.de["seo.catalog.description"]);
    expect(seo.source.description).toBe("default");
    expect(seo.image).toBe(DEFAULT_OG_IMAGE);
    // Nothing published at all: every field is the default.
    expect(resolveSeo("en", { key: "home" }, undefined).title).toBe(MESSAGES.en["seo.home.title"]);
  });

  it("has its own default in every language (no Russian on the German site)", () => {
    for (const key of ["home", "catalog", "create", "privacy", "terms"]) {
      const de = defaultSeo("de", { key });
      expect(de.title).toBe(MESSAGES.de[`seo.${key}.title` as keyof (typeof MESSAGES)["de"]]);
      expect(de.title).not.toBe(defaultSeo("ru", { key }).title);
    }
  });

  it("builds a catalog book's defaults from its title, summary and cover", () => {
    const subject = { key: "template:bath-time", label: "Baden", summary: "Über das Bad", coverUrl: "/catalog/bath-time.jpg" };
    const seo = resolveSeo("de", subject, null);
    expect(seo.title).toBe("Baden - personalisiertes Buch · Fabulka");
    expect(seo.description).toBe("Über das Bad");
    expect(seo).toMatchObject({ image: "/catalog/bath-time.jpg", source: { image: "cover" } });
    // Without a summary, a sentence with the title.
    expect(resolveSeo("en", { ...subject, summary: null }, null).description).toContain("Baden");
  });

  it("names an example book by its title, with its cover", () => {
    const seo = resolveSeo("ru", { key: "book:abc", label: "Тим и луна", coverUrl: "/files/books/abc/hero.png" }, null);
    expect(seo.title).toBe("Тим и луна - пример книги · Fabulka");
    expect(seo.image).toBe("/files/books/abc/hero.png");
  });

  it("falls back to the site's title when a page has no default (a book without a title)", () => {
    const seo = resolveSeo("es", { key: "template:gone" }, null);
    expect(seo.title).toBe(fallbackSeo("es").title);
    expect(seo.description).toBe(fallbackSeo("es").description);
    expect(seo.source).toEqual({ title: "fallback", description: "fallback", image: "default" });
  });

  it("ignores blank custom texts", () => {
    expect(resolveSeo("ru", { key: "terms" }, { ...none, title: "   " }).source.title).toBe("default");
  });
});

describe("seoMetadata", () => {
  it("sets the title as is, Open Graph, Twitter, canonical and noindex", () => {
    const seo = resolveSeo("de", { key: "catalog" }, { ...none, title: "Katalog X", noindex: true });
    const metadata = seoMetadata("de", "catalog", seo);
    expect(metadata.title).toEqual({ absolute: "Katalog X" });
    expect(metadata.alternates?.canonical).toBe("/de/catalog");
    expect(metadata.openGraph).toMatchObject({ title: "Katalog X", url: "/de/catalog", locale: "de_DE" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Katalog X" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(seoMetadata("de", "catalog", { ...seo, noindex: false }).robots).toBeUndefined();
  });
});

describe("siteLocale", () => {
  it("keeps metadata working for a [locale] that is not a language (a missing file)", () => {
    expect(resolveSeo("apple-touch-icon.png" as never, { key: "home" }, null).title).toBe(MESSAGES.en["seo.home.title"]);
  });
});
