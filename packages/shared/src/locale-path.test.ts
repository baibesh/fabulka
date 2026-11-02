import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, isLanguage, localePath, splitLocalePath } from "./locale-path";

describe("splitLocalePath", () => {
  it("reads the language prefix and keeps the rest", () => {
    expect(splitLocalePath("/ru/catalog")).toEqual({ language: "ru", path: "/catalog", prefixed: true });
    expect(splitLocalePath("/kk")).toEqual({ language: "kk", path: "/", prefixed: true });
    expect(splitLocalePath("/de?x=1")).toEqual({ language: "de", path: "/?x=1", prefixed: true });
    expect(splitLocalePath("/es#faq")).toEqual({ language: "es", path: "/#faq", prefixed: true });
    expect(splitLocalePath("/es/catalog/bath-time?a=b#c")).toEqual({ language: "es", path: "/catalog/bath-time?a=b#c", prefixed: true });
  });

  it("takes an unprefixed path for English, the default, and tells /en apart", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(splitLocalePath("/catalog")).toEqual({ language: "en", path: "/catalog", prefixed: false });
    expect(splitLocalePath("/")).toEqual({ language: "en", path: "/", prefixed: false });
    expect(splitLocalePath("/en/catalog")).toEqual({ language: "en", path: "/catalog", prefixed: true });
  });

  it("counts only the site's languages as a prefix", () => {
    expect(splitLocalePath("/fr/catalog")).toEqual({ language: "en", path: "/fr/catalog", prefixed: false });
    expect(splitLocalePath("/my")).toEqual({ language: "en", path: "/my", prefixed: false });
    expect(splitLocalePath("/russian")).toEqual({ language: "en", path: "/russian", prefixed: false });
  });
});

describe("localePath", () => {
  it("prefixes every language but English", () => {
    expect(localePath("ru", "/catalog")).toBe("/ru/catalog");
    expect(localePath("en", "/catalog")).toBe("/catalog");
    expect(localePath("kk", "/catalog/bath-time")).toBe("/kk/catalog/bath-time");
    expect(localePath(DEFAULT_LANGUAGE, "/")).toBe("/");
  });

  it("puts the home page's query and hash right after the prefix", () => {
    expect(localePath("kk", "/")).toBe("/kk");
    expect(localePath("de", "/#examples")).toBe("/de#examples");
    expect(localePath("es", "/?auth=error")).toBe("/es?auth=error");
    expect(localePath("ru", "/my#orders")).toBe("/ru/my#orders");
    expect(localePath("en", "/?auth=error")).toBe("/?auth=error");
  });

  it("swaps a language already in the path", () => {
    expect(localePath("de", "/ru/catalog")).toBe("/de/catalog");
    expect(localePath("en", "/kk/books/1")).toBe("/books/1");
    expect(localePath("ru", "/en")).toBe("/ru");
    expect(localePath("ru", localePath("ru", "/create"))).toBe("/ru/create");
  });

  it("leaves other addresses and the admin, API and files alone", () => {
    expect(localePath("ru", "#top")).toBe("#top");
    expect(localePath("ru", "https://fabulka.com/catalog")).toBe("https://fabulka.com/catalog");
    expect(localePath("ru", "mailto:hello@fabulka.com")).toBe("mailto:hello@fabulka.com");
    expect(localePath("ru", "//evil.com")).toBe("//evil.com");
    expect(localePath("ru", "/admin")).toBe("/admin");
    expect(localePath("de", "/admin/books/1")).toBe("/admin/books/1");
    expect(localePath("kk", "/api/auth/login?x=1")).toBe("/api/auth/login?x=1");
    expect(localePath("es", "/files/a.pdf")).toBe("/files/a.pdf");
    expect(localePath("ru", "/administration")).toBe("/ru/administration");
  });
});

describe("isLanguage", () => {
  it("knows the five languages only", () => {
    expect(["ru", "kk", "en", "es", "de"].every(isLanguage)).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});
