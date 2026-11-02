import { DEFAULT_LANGUAGE } from "@fabulka/shared";
import { describe, expect, it } from "vitest";
import { alternates, languageVersions } from "./seo";

describe("languageVersions", () => {
  it("names every language's address and x-default for the unprefixed English one", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(languageVersions("/catalog")).toEqual({
      ru: "/ru/catalog",
      kk: "/kk/catalog",
      en: "/catalog",
      es: "/es/catalog",
      de: "/de/catalog",
      "x-default": "/catalog",
    });
    expect(languageVersions("/")).toMatchObject({ en: "/", ru: "/ru", kk: "/kk", "x-default": "/" });
  });
});

describe("alternates", () => {
  it("points the canonical at the page's own language version", () => {
    expect(alternates("ru", "/catalog/bath-time")?.canonical).toBe("/ru/catalog/bath-time");
    expect(alternates("en", "/privacy")?.canonical).toBe("/privacy");
    expect(alternates("de", "/")?.languages).toEqual(languageVersions("/"));
  });
});
