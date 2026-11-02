import { describe, expect, it } from "vitest";
import {
  SeoFieldsSchema,
  SeoRobotsSchema,
  SeoSettingsSchema,
  DEFAULT_SEO_SETTINGS,
  findRedirect,
  redirectProblem,
  sameSeoFields,
  seoPageKind,
  seoPagePath,
  type RedirectInput,
} from "./seo";

const redirect = (from: string, to: string, active = true): RedirectInput => ({ from, to, status: 301, active });

describe("redirectProblem", () => {
  it("accepts a plain path to a path or an external URL", () => {
    expect(redirectProblem(redirect("/old-catalog", "/catalog"), [])).toBeNull();
    expect(redirectProblem(redirect("/de/alt", "/de/catalog?x=1"), [])).toBeNull();
    expect(redirectProblem(redirect("/promo", "https://example.com/landing"), [])).toBeNull();
  });

  it("refuses the admin, the API, files and Next's own paths", () => {
    for (const from of ["/admin", "/admin/seo", "/api/books", "/files/x", "/_next/static", "/internal/revalidate"]) {
      expect(redirectProblem(redirect(from, "/catalog"), [])).toBe("reserved");
    }
    // A path that merely starts with the same letters is fine.
    expect(redirectProblem(redirect("/administration", "/catalog"), [])).toBeNull();
  });

  it("refuses paths with a query, a file extension or no leading slash", () => {
    expect(redirectProblem(redirect("old", "/catalog"), [])).toBe("from_invalid");
    expect(redirectProblem(redirect("/old?x=1", "/catalog"), [])).toBe("from_invalid");
    expect(redirectProblem(redirect("/old.html", "/catalog"), [])).toBe("file");
    expect(redirectProblem(redirect("/old", "javascript:alert(1)"), [])).toBe("to_invalid");
    expect(redirectProblem(redirect("/old", "not a url"), [])).toBe("to_invalid");
  });

  it("refuses a redirect to itself, also with a trailing slash or on this site's host", () => {
    expect(redirectProblem(redirect("/a", "/a"), [])).toBe("self");
    expect(redirectProblem(redirect("/a/", "/a?utm=1"), [])).toBe("self");
    expect(redirectProblem(redirect("/a", "https://fabulka.com/a"), [], "fabulka.com")).toBe("self");
  });

  it("refuses loops through active redirects, not through inactive ones", () => {
    const others = [redirect("/b", "/c"), redirect("/c", "/a")];
    expect(redirectProblem(redirect("/a", "/b"), others)).toBe("loop");
    expect(redirectProblem(redirect("/a", "/b"), [redirect("/b", "/c"), redirect("/c", "/a", false)])).toBeNull();
    // An inactive new redirect cannot loop.
    expect(redirectProblem(redirect("/a", "/b", false), others)).toBeNull();
    // Absolute URLs on this site count.
    expect(redirectProblem(redirect("/a", "https://fabulka.com/b"), [redirect("/b", "/a")], "fabulka.com")).toBe("loop");
  });

  it("refuses a second redirect from the same path", () => {
    expect(redirectProblem(redirect("/old/", "/x"), [redirect("/old", "/y")])).toBe("duplicate");
  });
});

describe("findRedirect", () => {
  it("matches with or without a trailing slash", () => {
    const list = [{ from: "/old", to: "/catalog" }];
    expect(findRedirect(list, "/old/")?.to).toBe("/catalog");
    expect(findRedirect(list, "/older")).toBeUndefined();
  });
});

describe("page keys", () => {
  it("map to site paths and kinds", () => {
    expect(seoPagePath("home")).toBe("/");
    expect(seoPagePath("catalog")).toBe("/catalog");
    expect(seoPagePath("template:bath-time")).toBe("/catalog/bath-time");
    expect(seoPagePath("book:abc")).toBe("/books/abc");
    expect(seoPageKind("template:bath-time")).toBe("template");
    expect(seoPageKind("terms")).toBe("static");
  });
});

describe("SeoFieldsSchema", () => {
  it("turns blank texts into null (the default)", () => {
    const fields = SeoFieldsSchema.parse({ title: "  ", description: " Hi ", ogImage: null, noindex: false });
    expect(fields).toEqual({ title: null, description: "Hi", ogImage: null, noindex: false });
    expect(sameSeoFields(fields, { ...fields })).toBe(true);
    expect(sameSeoFields(null, { title: null, description: null, ogImage: null, noindex: false })).toBe(true);
  });

  it("accepts only uploaded images", () => {
    expect(SeoFieldsSchema.safeParse({ title: null, description: null, ogImage: "../etc/passwd", noindex: false }).success).toBe(false);
    expect(SeoFieldsSchema.safeParse({ title: null, description: null, ogImage: "seo/og-ab12.jpg", noindex: false }).success).toBe(true);
  });
});

describe("SEO settings", () => {
  it("checks analytics ids and robots lines", () => {
    expect(SeoSettingsSchema.safeParse(DEFAULT_SEO_SETTINGS).success).toBe(true);
    const bad = { ...DEFAULT_SEO_SETTINGS, analytics: { ...DEFAULT_SEO_SETTINGS.analytics, ga4: "UA-123" } };
    expect(SeoSettingsSchema.safeParse(bad).success).toBe(false);
    expect(SeoRobotsSchema.parse("User-agent: GPTBot\n  Disallow: /\n\n# note")).toBe("User-agent: GPTBot\nDisallow: /\n\n# note");
    expect(SeoRobotsSchema.safeParse("<script>").success).toBe(false);
  });
});
