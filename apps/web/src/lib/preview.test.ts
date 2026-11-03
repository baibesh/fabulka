import { describe, expect, it } from "vitest";
import { COUNTRY_COOKIE } from "../i18n/cookies";
import { previewResponse, previewTarget } from "./preview";

const target = (query: string) => previewTarget(new URLSearchParams(query));
const preview = (query: string, init?: RequestInit) => previewResponse(new Request(`http://localhost:3000/admin/preview?${query}`, init));

describe("preview as a visitor", () => {
  it("opens the landing in the language's own address for the country", () => {
    expect(target("country=DE&lang=de")).toEqual({ country: "DE", language: "de", path: "/de" });
    expect(target("country=ca&lang=en")).toEqual({ country: "CA", language: "en", path: "/" });
    expect(target("country=other&lang=es&page=catalog")).toEqual({ country: "other", language: "es", path: "/es/catalog" });
    // Any real country code: one the site does not list shows what "other" gets.
    expect(target("country=FR&lang=en")?.country).toBe("FR");
  });

  it("refuses anything but a country code, a site language and a known page", () => {
    for (const query of ["", "country=DE", "lang=de", "country=XX&lang=de", "country=DE&lang=fr", "country=DE&lang=de&page=//evil.example", "country=DE;x=1&lang=de"]) {
      expect(target(query), query).toBeNull();
    }
  });

  it("sets only the country cookie, as the site's picker does, and redirects to our own page", () => {
    const response = preview("country=DE&lang=de");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/de");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toEqual([`${COUNTRY_COOKIE}=DE; Path=/; Max-Age=31536000; SameSite=Lax`]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("marks the cookie secure behind https", () => {
    const response = preview("country=CH&lang=de", { headers: { "x-forwarded-proto": "https" } });
    expect(response.headers.getSetCookie()[0]).toMatch(/; Secure$/);
  });

  it("sets nothing for a bad request", async () => {
    const response = preview("country=DE&lang=de&page=https://evil.example");
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.text()).toContain("required");
  });
});
