import { describe, expect, it } from "vitest";
import { alternates, languageVersions } from "./seo";

describe("languageVersions", () => {
  it("names every language's address and x-default for the unprefixed Russian one", () => {
    expect(languageVersions("/catalog")).toEqual({
      ru: "/catalog",
      kk: "/kk/catalog",
      en: "/en/catalog",
      es: "/es/catalog",
      de: "/de/catalog",
      "x-default": "/catalog",
    });
    expect(languageVersions("/")).toMatchObject({ ru: "/", kk: "/kk", "x-default": "/" });
  });
});

describe("alternates", () => {
  it("points the canonical at the page's own language version", () => {
    expect(alternates("en", "/catalog/bath-time")?.canonical).toBe("/en/catalog/bath-time");
    expect(alternates("ru", "/privacy")?.canonical).toBe("/privacy");
    expect(alternates("de", "/")?.languages).toEqual(languageVersions("/"));
  });
});
