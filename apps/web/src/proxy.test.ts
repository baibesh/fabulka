import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropRedirects } from "./lib/redirects";
import { proxy } from "./proxy";

/** The redirects the API answers with (GET /api/seo/redirects). */
let stored: { from: string; to: string; status: 301 | 302 }[] = [];

beforeEach(() => {
  dropRedirects();
  stored = [];
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(stored)));
});
afterEach(() => vi.unstubAllGlobals());

const run = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));
const location = async (path: string) => (await run(path)).headers.get("location");
const rewrittenTo = async (path: string) => (await run(path)).headers.get("x-middleware-rewrite");

describe("proxy", () => {
  it("serves unprefixed addresses from the English routes, invisibly", async () => {
    expect(await rewrittenTo("/")).toBe("http://localhost:3000/en");
    expect(await rewrittenTo("/catalog/bath-time?x=1")).toBe("http://localhost:3000/en/catalog/bath-time?x=1");
    // Not a language: an English path that does not exist, so a 404.
    expect(await rewrittenTo("/fr/catalog")).toBe("http://localhost:3000/en/fr/catalog");
  });

  it("lets the other languages through as they are", async () => {
    for (const path of ["/ru/catalog", "/kk", "/es/catalog/bath-time", "/de/my"]) {
      const response = await run(path);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("redirects /en to the unprefixed address, permanently, keeping the query", async () => {
    expect((await run("/en/catalog")).status).toBe(308);
    expect(await location("/en/catalog?x=1")).toBe("http://localhost:3000/catalog?x=1");
    expect(await location("/en")).toBe("http://localhost:3000/");
    expect(await location("/en?auth=error")).toBe("http://localhost:3000/?auth=error");
  });

  it("redirects old ?lang= links to the language's address and drops the parameter", async () => {
    expect((await run("/catalog?lang=kk")).status).toBe(308);
    expect(await location("/catalog?lang=kk")).toBe("http://localhost:3000/kk/catalog");
    expect(await location("/?lang=ru&auth=error")).toBe("http://localhost:3000/ru?auth=error");
    expect(await location("/de/books/1?lang=en")).toBe("http://localhost:3000/books/1");
    expect(await location("/ru/books/1?lang=en")).toBe("http://localhost:3000/books/1");
    expect(await location("/es/catalog?lang=xx")).toBe("http://localhost:3000/es/catalog");
    expect(await location("/catalog?lang=xx")).toBe("http://localhost:3000/catalog");
  });

  it("applies the admin's redirects first, keeping the query for a path", async () => {
    stored = [
      { from: "/old-catalog", to: "/de/catalog", status: 301 },
      { from: "/promo", to: "https://example.com/x?a=1", status: 302 },
    ];
    const moved = await run("/old-catalog/?utm=1");
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("http://localhost:3000/de/catalog?utm=1");
    const away = await run("/promo");
    expect(away.status).toBe(302);
    expect(away.headers.get("location")).toBe("https://example.com/x?a=1");
    // Anything else goes on as before.
    expect(await rewrittenTo("/catalog")).toBe("http://localhost:3000/en/catalog");
  });

  it("keeps the redirects for a minute and works on when the API is down", async () => {
    stored = [{ from: "/a", to: "/b", status: 301 }];
    await run("/x");
    await run("/y");
    expect(fetch).toHaveBeenCalledTimes(1);
    dropRedirects();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await rewrittenTo("/a")).toBe("http://localhost:3000/en/a");
  });
});
