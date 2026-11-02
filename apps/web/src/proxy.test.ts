import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const run = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));
const location = (path: string) => run(path).headers.get("location");
const rewrittenTo = (path: string) => run(path).headers.get("x-middleware-rewrite");

describe("proxy", () => {
  it("serves unprefixed addresses from the Russian routes, invisibly", () => {
    expect(rewrittenTo("/")).toBe("http://localhost:3000/ru");
    expect(rewrittenTo("/catalog/bath-time?x=1")).toBe("http://localhost:3000/ru/catalog/bath-time?x=1");
    // Not a language: a Russian path that does not exist, so a 404.
    expect(rewrittenTo("/fr/catalog")).toBe("http://localhost:3000/ru/fr/catalog");
  });

  it("lets the other languages through as they are", () => {
    const response = run("/en/catalog");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects /ru to the unprefixed address, permanently", () => {
    expect(run("/ru/catalog").status).toBe(308);
    expect(location("/ru/catalog?x=1")).toBe("http://localhost:3000/catalog?x=1");
    expect(location("/ru")).toBe("http://localhost:3000/");
  });

  it("redirects old ?lang= links to the language's address and drops the parameter", () => {
    expect(run("/catalog?lang=kk").status).toBe(308);
    expect(location("/catalog?lang=kk")).toBe("http://localhost:3000/kk/catalog");
    expect(location("/?lang=en&auth=error")).toBe("http://localhost:3000/en?auth=error");
    expect(location("/de/books/1?lang=ru")).toBe("http://localhost:3000/books/1");
    expect(location("/es/catalog?lang=xx")).toBe("http://localhost:3000/es/catalog");
  });
});
