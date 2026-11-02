import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, isLanguage, localePath, splitLocalePath } from "./locale-path";

describe("splitLocalePath", () => {
  it("reads the language prefix and keeps the rest", () => {
    expect(splitLocalePath("/en/catalog")).toEqual({ language: "en", path: "/catalog", prefixed: true });
    expect(splitLocalePath("/kk")).toEqual({ language: "kk", path: "/", prefixed: true });
    expect(splitLocalePath("/de?x=1")).toEqual({ language: "de", path: "/?x=1", prefixed: true });
    expect(splitLocalePath("/es#faq")).toEqual({ language: "es", path: "/#faq", prefixed: true });
    expect(splitLocalePath("/es/catalog/bath-time?a=b#c")).toEqual({ language: "es", path: "/catalog/bath-time?a=b#c", prefixed: true });
  });

  it("takes an unprefixed path for Russian and tells /ru apart", () => {
    expect(splitLocalePath("/catalog")).toEqual({ language: "ru", path: "/catalog", prefixed: false });
    expect(splitLocalePath("/")).toEqual({ language: "ru", path: "/", prefixed: false });
    expect(splitLocalePath("/ru/catalog")).toEqual({ language: "ru", path: "/catalog", prefixed: true });
  });

  it("counts only the site's languages as a prefix", () => {
    expect(splitLocalePath("/fr/catalog")).toEqual({ language: "ru", path: "/fr/catalog", prefixed: false });
    expect(splitLocalePath("/my")).toEqual({ language: "ru", path: "/my", prefixed: false });
    expect(splitLocalePath("/english")).toEqual({ language: "ru", path: "/english", prefixed: false });
  });
});

describe("localePath", () => {
  it("prefixes every language but Russian", () => {
    expect(localePath("en", "/catalog")).toBe("/en/catalog");
    expect(localePath("ru", "/catalog")).toBe("/catalog");
    expect(localePath("kk", "/catalog/bath-time")).toBe("/kk/catalog/bath-time");
    expect(localePath(DEFAULT_LANGUAGE, "/")).toBe("/");
  });

  it("puts the home page's query and hash right after the prefix", () => {
    expect(localePath("kk", "/")).toBe("/kk");
    expect(localePath("de", "/#examples")).toBe("/de#examples");
    expect(localePath("es", "/?auth=error")).toBe("/es?auth=error");
    expect(localePath("en", "/my#orders")).toBe("/en/my#orders");
  });

  it("swaps a language already in the path", () => {
    expect(localePath("de", "/en/catalog")).toBe("/de/catalog");
    expect(localePath("ru", "/kk/books/1")).toBe("/books/1");
    expect(localePath("en", "/ru")).toBe("/en");
    expect(localePath("en", localePath("en", "/create"))).toBe("/en/create");
  });

  it("leaves other addresses and the admin, API and files alone", () => {
    expect(localePath("en", "#top")).toBe("#top");
    expect(localePath("en", "https://fabulka.com/catalog")).toBe("https://fabulka.com/catalog");
    expect(localePath("en", "mailto:hello@fabulka.com")).toBe("mailto:hello@fabulka.com");
    expect(localePath("en", "//evil.com")).toBe("//evil.com");
    expect(localePath("en", "/admin")).toBe("/admin");
    expect(localePath("de", "/admin/books/1")).toBe("/admin/books/1");
    expect(localePath("kk", "/api/auth/login?x=1")).toBe("/api/auth/login?x=1");
    expect(localePath("es", "/files/a.pdf")).toBe("/files/a.pdf");
    expect(localePath("en", "/administration")).toBe("/en/administration");
  });
});

describe("isLanguage", () => {
  it("knows the five languages only", () => {
    expect(["ru", "kk", "en", "es", "de"].every(isLanguage)).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});
